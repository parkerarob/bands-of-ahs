import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeStaffRequest, STAFF_CAPABILITIES } from "@/lib/staffAuthorization";
import { logAudit, logAuditRequired, staffActor } from "@/lib/auditLog";
import { privateJson, privateServerError } from "@/lib/privateResponse";
import { normalizeStewardship, stewardshipView } from "@/lib/sponsorStewardship.mjs";
export const runtime = "nodejs";

async function allRows(table, fields) {
  const rows=[];
  for(let offset=0; ; offset+=500) {
    const {data,error}=await supabaseAdmin.from(table).select(fields).order("id").range(offset,offset+499);
    if(error) throw error;
    rows.push(...(data||[]));
    if((data||[]).length<500) return rows;
  }
}
export async function GET(req) {
  const auth=await authorizeStaffRequest(req,STAFF_CAPABILITIES.SPONSORSHIP_READ);
  if(!auth.ok) return privateJson({error:auth.error},auth.status);
  try {
    const [gifts,items]=await Promise.all([
      allRows("sponsor_gifts","id,business_id,business_name,amount_cents,status,confirmed_at,listed_on_site,recognition_status,badge_sent_at"),
      allRows("sponsor_stewardship_items","id,gift_id,kind,title,due_on,owner_name,status,evidence,version,updated_at,source")
    ]);
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    await logAudit({actor:staffActor(auth.staff),action:"view",table:"sponsor_stewardship_items,sponsor_gifts",recordId:"stewardship-digest",route:"/api/sponsors/stewardship"});
    return privateJson({gifts,items,...stewardshipView(gifts,items,today)});
  } catch(error) { return privateServerError("sponsor-stewardship",error,"Sponsor follow-up could not be loaded."); }
}
export async function POST(req) {
  const auth=await authorizeStaffRequest(req,STAFF_CAPABILITIES.SPONSORSHIP_GIFTS_WRITE);
  if(!auth.ok) return privateJson({error:auth.error},auth.status);
  let input;
  try { input=normalizeStewardship(await req.json()); }
  catch(error) { return privateJson({error:error.message || "Check the follow-up fields."},400); }
  try {
    await logAuditRequired({actor:staffActor(auth.staff),action:"save_requested",table:"sponsor_stewardship_items",recordId:input.id,route:"/api/sponsors/stewardship",changes:{kind:input.kind,status:input.status,expectedVersion:input.version}});
    const {data,error}=await supabaseAdmin.rpc("save_sponsor_stewardship",{
      p_id:input.id,p_request_id:input.request_id,p_actor:auth.staff.id,p_expected_version:input.version,
      p_gift_id:input.gift_id,p_kind:input.kind,p_title:input.title,p_due_on:input.due_on,
      p_owner_name:input.owner_name,p_status:input.status,p_evidence:input.evidence
    });
    if(error) {
      if(["40001","23505"].includes(error.code)) return privateJson({error:"This follow-up changed or the request key was reused. Refresh and review before saving."},409);
      if(["23514","23503"].includes(error.code)) return privateJson({error:"Check the follow-up fields and confirm the gift is still confirmed."},409);
      throw error;
    }
    return privateJson({item:data});
  } catch(error) { return privateServerError("sponsor-stewardship-save",error,"The follow-up could not be saved. Your entries are still available to retry."); }
}
