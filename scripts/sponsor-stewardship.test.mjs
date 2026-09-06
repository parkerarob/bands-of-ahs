import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStewardship, stewardshipView, anniversary, validDay } from '../lib/sponsorStewardship.mjs';
const ID='e5cae3aa-e728-48f5-a8fb-cab3612f4b4f';
const input={id:ID,gift_id:ID,request_id:ID,version:0,kind:'renewal',title:'Review renewal',status:'open',due_on:'2027-09-06',owner_name:'',evidence:''};
test('follow-up validates real dates, evidence, versions and bounded input',()=>{
  assert.equal(validDay('2026-02-30'),false);
  assert.equal(validDay('2024-02-29'),true);
  assert.equal(anniversary('2024-02-29'),'2025-02-28');
  assert.equal(normalizeStewardship(input).due_on,'2027-09-06');
  for(const change of [{status:'done'},{status:'waived'},{due_on:'tomorrow'},{version:-1},{kind:'__proto__'},{title:'x'.repeat(161)},{evidence:[]}]) assert.throws(()=>normalizeStewardship({...input,...change}));
  assert.equal(normalizeStewardship({...input,status:'done',evidence:'Completed at event; staff record 2026-09-06'}).status,'done');
});
test('digest excludes unsettled/refunded money and separates unscheduled and overdue work',()=>{
  const gifts=[{id:'a',status:'confirmed',amount_cents:10000,confirmed_at:'2026-09-01',business_name:'Example',recognition_status:'sent',listed_on_site:true,badge_sent_at:'2026-09-01'}, {id:'b',status:'refunded',amount_cents:50000}];
  const items=[{gift_id:'a',status:'open',title:'Call',due_on:'2026-09-05',owner_name:''},{gift_id:'a',status:'open',title:'Review',due_on:'2026-09-06',owner_name:'Assigned owner'},{gift_id:'a',status:'open',title:'Letter',due_on:null,owner_name:''},{gift_id:'b',status:'open',title:'Inactive'}];
  const result=stewardshipView(gifts,items,'2026-09-06');
  assert.deepEqual(result.stats,{confirmedCents:10000,confirmedGifts:1,open:3,overdue:1,dueSoon:1,unscheduled:1,unassigned:2,inactiveHistory:1});
  assert.doesNotMatch(result.digest,/Inactive/);
});
test('renewal suggestions use latest canonical business gift without conflating unlinked sponsors',()=>{
  const gifts=[{id:'a',business_id:'same',status:'confirmed',confirmed_at:'2025-01-01'},{id:'b',business_id:'same',status:'confirmed',confirmed_at:'2026-04-01'},{id:'c',status:'confirmed',confirmed_at:'2026-01-01'}];
  let view=stewardshipView(gifts,[],'2026-09-06');
  assert.deepEqual(view.suggestions.filter(s=>s.kind==='renewal').map(s=>s.gift_id),['b','c']);
  view=stewardshipView(gifts,[{gift_id:'a',kind:'renewal',status:'open'}],'2026-09-06');
  assert.deepEqual(view.suggestions.filter(s=>s.kind==='renewal').map(s=>s.gift_id),['c']);
  view=stewardshipView(gifts,[{gift_id:'a',kind:'renewal',status:'done',evidence:'prior cycle'}],'2026-09-06');
  assert.deepEqual(view.suggestions.filter(s=>s.kind==='renewal').map(s=>s.gift_id),['b','c']);
});
test('saved disposition suppresses a suggestion but does not claim provider delivery',()=>{
  const gift={id:'a',status:'confirmed',amount_cents:10000,listed_on_site:true,recognition_status:'sent',confirmed_at:'2026-09-01'};
  const result=stewardshipView([gift],[{gift_id:'a',kind:'badge',status:'done',evidence:'External mail receipt recorded'}],'2026-09-06');
  assert.equal(result.suggestions.some(s=>s.kind==='badge'),false);
  assert.equal(gift.badge_sent_at,undefined);
});

test('authenticated save derives actor server-side, audits first and maps stale writes to conflict',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../app/api/sponsors/stewardship/route.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/^export const runtime[^\n]+\n/gm,'').replace(/export async function /g,'async function ');
  const calls=[];
  const deps={supabaseAdmin:{rpc:async(name,params)=>{calls.push('rpc');assert.equal(params.p_actor,'verified-staff');return {error:{code:'40001'}};}},authorizeStaffRequest:async()=>({ok:true,staff:{id:'verified-staff'}}),STAFF_CAPABILITIES:{},logAudit:async()=>{},logAuditRequired:async()=>{calls.push('audit');},staffActor:x=>x,privateJson:(payload,status=200)=>Response.json(payload,{status}),privateServerError:()=>Response.json({error:'server'},{status:500}),normalizeStewardship,stewardshipView};
  const post=new Function(...Object.keys(deps),source+'; return POST;')(...Object.values(deps));
  const response=await post(new Request('https://example.test',{method:'POST',body:JSON.stringify({...input,actor:'untrusted-actor'})}));
  assert.equal(response.status,409);assert.deepEqual(calls,['audit','rpc']);
  calls.length=0;
  deps.authorizeStaffRequest=async()=>({ok:false,status:403,error:'Not allowed'});
  const denied=new Function(...Object.keys(deps),source+'; return POST;')(...Object.values(deps));
  assert.equal((await denied(new Request('https://example.test',{method:'POST',body:JSON.stringify(input)}))).status,403);assert.deepEqual(calls,[]);
});
