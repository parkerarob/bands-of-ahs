"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./StewardshipPanel.module.css";
import { STEWARDSHIP_KINDS } from "@/lib/sponsorStewardship.mjs";

export default function StewardshipPanel() {
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [draft,setDraft]=useState(null);
  const [busy,setBusy]=useState(false);
  const [showClosed,setShowClosed]=useState(false);
  const [copied,setCopied]=useState(false);
  const request=useRef(null);
  const load=useCallback(async()=>{
    const res=await fetch("/api/sponsors/stewardship");
    const body=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(body.error||"Follow-up could not be loaded.");
    setData(body);
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>{load().catch(e=>setError(e.message));},0);return()=>clearTimeout(timer);},[load]);
  function edit(item={}) {
    request.current=null;
    setError("");
    setDraft({id:item.id||crypto.randomUUID(),version:item.version||0,gift_id:item.gift_id||"",kind:item.kind||"custom",title:item.title||"",due_on:item.due_on||"",owner_name:item.owner_name||"",status:item.status||"open",evidence:item.evidence||""});
  }
  function change(key,value) { request.current=null;setDraft(d=>({...d,[key]:value})); }
  async function save(event) {
    event.preventDefault();setBusy(true);setError("");
    request.current ||= crypto.randomUUID();
    try {
      const res=await fetch("/api/sponsors/stewardship",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...draft,request_id:request.current})});
      const body=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(body.error||"Could not save. Try again.");
      // Keep the returned version if the subsequent refresh fails.
      setDraft({...body.item,due_on:body.item.due_on||""});request.current=null;
      await load();setDraft(null);
    } catch(error) {setError(error.message);} finally {setBusy(false);}
  }
  async function refresh() {setError("");try{await load();}catch(e){setError(e.message);}}
  const giftName=id=>data?.gifts.find(g=>g.id===id)?.business_name||"Sponsor";
  const giftActive=id=>data?.gifts.some(g=>g.id===id&&g.status==="confirmed");
  return <section className={`dashboard-alerts ${styles.panel}`}>
    <h3>Sponsor stewardship</h3>
    <p>Keep recognition, renewal reviews and personal follow-up here. A saved item records work to do; it does not send a message or promise a benefit.</p>
    {error?<p role="alert">{error}</p>:null}
    <button type="button" className="sponsors-btn" onClick={refresh} disabled={busy}>Refresh</button>{" "}
    <button type="button" className="sponsors-btn sponsors-btn-primary" onClick={()=>edit()} disabled={!data||busy}>Add follow-up</button>
    {!data?<p>Loading sponsor follow-up…</p>:<>
      <p><strong>{data.stats.open} open</strong> · {data.stats.overdue} overdue · {data.stats.dueSoon} due within 30 days · {data.stats.unassigned} without owners</p>
      <details><summary>Director check-in · {data.today}</summary>
        <textarea aria-label="Director sponsorship digest" value={data.digest} readOnly rows={10} style={{width:"100%",boxSizing:"border-box"}} />
        <button type="button" className="tracker-link" onClick={async()=>{try{await navigator.clipboard.writeText(data.digest);setCopied(true);}catch{setError("Select the digest text to copy it.");}}}>{copied?"Copied":"Copy digest"}</button>
        <p className="tracker-sub">Generated from current records when refreshed. No scheduled email is enabled.</p>
      </details>
      {draft?<form onSubmit={save} className={styles.form}>
        <h4>{draft.version?"Edit follow-up":"New follow-up"}</h4>
        <fieldset disabled={busy}>
          <label>Sponsor gift <select required value={draft.gift_id} disabled={draft.version>0} onChange={e=>change("gift_id",e.target.value)}>
            <option value="">Choose a confirmed gift</option>{data.gifts.filter(g=>g.status==="confirmed").map(g=><option key={g.id} value={g.id}>{g.business_name} · ${(g.amount_cents/100).toFixed(2)} · {(g.confirmed_at||"").slice(0,10)}</option>)}
          </select></label>
          <label>Type <select value={draft.kind} onChange={e=>change("kind",e.target.value)}>{Object.entries(STEWARDSHIP_KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Next step <input required maxLength={160} value={draft.title} onChange={e=>change("title",e.target.value)} /></label>
          <label>Due date, if agreed <input type="date" value={draft.due_on} onChange={e=>change("due_on",e.target.value)} /></label>
          <label>Owner, if assigned <input maxLength={100} value={draft.owner_name} onChange={e=>change("owner_name",e.target.value)} /></label>
          <label>Status <select value={draft.status} onChange={e=>change("status",e.target.value)}><option value="open">Open</option><option value="done">Completed</option><option value="waived">Not needed</option></select></label>
          <label>Notes and evidence <textarea required={draft.status!=="open"} maxLength={2000} rows={3} value={draft.evidence} onChange={e=>change("evidence",e.target.value)} /></label>
          <p className="tracker-sub">For completed work, record what happened and the source or date. A manual record does not establish provider delivery or a new payment.</p>
          <div><button className="sponsors-btn sponsors-btn-primary" type="submit">{busy?"Saving…":"Save follow-up"}</button>{" "}<button className="sponsors-btn" type="button" onClick={()=>setDraft(null)}>Cancel</button></div>
        </fieldset>
      </form>:null}
      <h4>Recorded follow-up</h4>
      <label><input type="checkbox" checked={showClosed} onChange={e=>setShowClosed(e.target.checked)} /> Include completed, not-needed and inactive-gift history</label>
      {data.items.filter(i=>showClosed||(i.status==="open"&&giftActive(i.gift_id))).length===0?<p>No recorded follow-up in this view.</p>:null}
      {data.items.filter(i=>showClosed||(i.status==="open"&&giftActive(i.gift_id))).map(item=><article key={item.id} style={{padding:"12px 0",borderBottom:"1px solid #ded8cc"}}>
        <strong>{giftName(item.gift_id)}: {item.title}</strong>
        <p>{item.status} · {item.due_on||"Date not set"} · {item.owner_name||"Owner not set"}</p>
        {item.evidence?<p style={{whiteSpace:"pre-wrap"}}>{item.evidence}</p>:null}
        {giftActive(item.gift_id)?<button className="tracker-link" type="button" disabled={busy} onClick={()=>edit(item)}>Edit / record completion</button>:<p>Gift is no longer confirmed. History is retained; no follow-up action is scheduled.</p>}
      </article>)}
      <h4>Suggestions to review</h4>
      <p className="tracker-sub">These are not saved obligations. Renewal dates are anniversary suggestions. Confirm the arrangement and owner before saving.</p>
      {data.suggestions.length===0?<p>No new suggestions.</p>:data.suggestions.map(s=><p key={`${s.gift_id}:${s.kind}`}>
        {giftName(s.gift_id)} · {s.title}{s.due_on?` · suggested ${s.due_on}`:""}{" "}<button type="button" className="tracker-link" disabled={busy} onClick={()=>edit(s)}>Review</button>
      </p>)}
    </>}
  </section>;
}
