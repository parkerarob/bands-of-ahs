import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeStaffRequest, STAFF_CAPABILITIES } from "@/lib/staffAuthorization";
import { logAudit, staffActor } from "@/lib/auditLog";
import { privateJson, privateServerError } from "@/lib/privateResponse";
import { CAMPAIGN_BUSINESS_FIELDS, campaignResearchRows, campaignResearchQuery } from "@/lib/campaignResearch.mjs";
export const runtime = "nodejs";

export async function GET(req) {
  const auth = await authorizeStaffRequest(req, STAFF_CAPABILITIES.CAMPAIGN_SPONSORSHIP_READ);
  if (!auth.ok) return privateJson({ error: auth.error }, auth.status);
  try {
    const { search, page, size } = campaignResearchQuery(new URL(req.url));
    let query = supabaseAdmin.from("businesses").select(CAMPAIGN_BUSINESS_FIELDS, { count: "exact" });
    if (search) query = query.ilike("name_display", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, count, error } = await query.order("name_display").order("id").range(page * size, page * size + size - 1);
    if (error) throw error;
    let prospects = [];
    if (data.length) {
      const result = await supabaseAdmin.from("prospects").select("business_id").in("business_id", data.map((row) => row.id));
      if (result.error) throw result.error;
      prospects = result.data || [];
    }
    await logAudit({ actor: staffActor(auth.staff), action: "view", table: "businesses,prospects", recordId: "campaign-research", route: "/api/sponsors/campaign-research" });
    return privateJson({ businesses: campaignResearchRows(data, prospects), total: count, page, page_size: size, observed_at: new Date().toISOString() });
  } catch (error) {
    return privateServerError("campaign-research", error, "Campaign research could not be loaded. Please retry.");
  }
}
