import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { campaignResearchRows, campaignResearchQuery, safeBusinessWebsite } from '../lib/campaignResearch.mjs';
import { staffHasCapability, STAFF_CAPABILITIES } from '../lib/staffCapabilities.js';

test('campaign role exposes research and cannot reach financial, family or send functions', () => {
  const staff={role:'campaign_researcher'};
  assert.equal(staffHasCapability(staff,STAFF_CAPABILITIES.CAMPAIGN_SPONSORSHIP_READ),true);
  for(const capability of Object.values(STAFF_CAPABILITIES).filter(x=>x!==STAFF_CAPABILITIES.CAMPAIGN_SPONSORSHIP_READ)) assert.equal(staffHasCapability(staff,capability),false,capability);
  assert.equal(staffHasCapability({role:'program_staff'},STAFF_CAPABILITIES.CAMPAIGN_SPONSORSHIP_READ),false);
});
test('projection removes extra private fields and exposes only a coordination indicator', () => {
  const rows=campaignResearchRows([{id:'synthetic',name_display:'Example business',notes:'Private note',family_id:'hidden',amount_cents:100,website:'javascript:alert(1)',last_outreach_at:null}], [{business_id:'synthetic',family_id:'hidden'}]);
  assert.equal(rows[0].coordination_needed,true);
  assert.equal(rows[0].last_outreach_at,null);
  assert.equal(rows[0].website,'');
  assert.equal(JSON.stringify(rows).includes('hidden'),false);
  assert.equal(JSON.stringify(rows).includes('Private note'),false);
  assert.equal('amount_cents' in rows[0],false);
  assert.equal(safeBusinessWebsite('https://example.com'),'https://example.com/');
});
test('research pagination is bounded and search is capped', () => {
  assert.equal(campaignResearchQuery(new URL('https://example.com/?page=-1')).page,0);
  assert.equal(campaignResearchQuery(new URL('https://example.com/?page=999999')).page,2000);
  assert.equal(campaignResearchQuery(new URL('https://example.com/?q='+ 'a'.repeat(200))).search.length,100);
});
test('route refuses unassigned users before querying any source', async () => {
  let source=await readFile(new URL('../app/api/sponsors/campaign-research/route.js',import.meta.url),'utf8');
  source=source.replace(/^import .*?;\n/gm,'').replace('export const runtime = "nodejs";','').replace('export async function GET','async function GET');
  const run=new Function('authorizeStaffRequest','STAFF_CAPABILITIES','privateJson','supabaseAdmin',source+';return GET;');
  let reads=0;
  const get=run(async()=>({ok:false,status:403,error:'Denied'}),STAFF_CAPABILITIES,(body,status)=>({body,status}),{from:()=>{reads++;throw new Error('should not query');}});
  assert.equal((await get({url:'https://example.com'})).status,403);assert.equal(reads,0);
});
