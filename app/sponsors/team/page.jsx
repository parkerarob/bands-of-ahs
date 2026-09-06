"use client";
import { useCallback, useEffect, useState } from "react";
import { StaffGate } from "@/components/StaffGate";
import styles from "./campaign.module.css";

function Directory({ signOut }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const load = useCallback(async (signal) => {
    setBusy(true); setError(""); setData(null);
    try {
      const res = await fetch(`/api/sponsors/campaign-research?q=${encodeURIComponent(query)}&page=${page}`, { signal });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load campaign research.");
      if (!signal.aborted) setData(body);
    } catch (err) {
      if (!signal.aborted) setError(err.message || "Could not load campaign research.");
    } finally { if (!signal.aborted) setBusy(false); }
  }, [query, page]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => load(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load, revision]);
  return <>
    <div className={styles.actions}><button onClick={() => setRevision((value) => value + 1)} disabled={busy}>Refresh</button><button onClick={signOut}>Sign out</button></div>
    <aside className={styles.context}>
      <h2>Coordinate through the shared campaign tracker</h2>
      <p>Record the owner, next action, approved ask, and actual contact in the team’s shared workbook before approaching a business. This directory supplies research; it does not synchronize workbook changes.</p>
      <p>These are general band-program records. A listing or past sponsorship does not establish a Carnegie gift or approval to contact someone. Prior-sponsor flags are incomplete, and “not recorded” does not mean “never contacted.”</p>
    </aside>
    <form className={styles.search} onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(0); setRevision((value) => value + 1); }}>
      <label htmlFor="campaign-search">Business name<input id="campaign-search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} /></label>
      <button type="submit">Search</button>
    </form>
    {error && <p role="alert">{error} If your account needs campaign access, ask the director to review it.</p>}
    {busy && <p role="status">Loading businesses…</p>}
    {data && <>
      <p>{data.total} businesses match. Updated from the directory {new Date(data.observed_at).toLocaleString()}.</p>
      {!data.businesses.length && <p>No matching businesses. Try a shorter name.</p>}
      <div className={styles.grid}>{data.businesses.map((business) => <article key={business.id} className={styles.card}>
        <h2>{business.name}</h2><p>{business.city || "Locality not recorded"}</p>
        {business.prior_sponsor && <p><strong>Prior sponsor flagged in directory</strong></p>}
        {business.coordination_needed && <p className={styles.notice}>A family has a tracker entry for this business. Check with the director before starting another conversation.</p>}
        <dl><dt>Business contact</dt><dd>{[business.contact, business.contact_title].filter(Boolean).join(" · ") || "Not recorded"}</dd>
          <dt>Email</dt><dd>{business.email || "Not recorded"}</dd><dt>Phone</dt><dd>{business.phone || "Not recorded"}</dd>
          <dt>Last recorded outreach</dt><dd>{business.last_outreach_at ? new Date(business.last_outreach_at).toLocaleDateString() : "Not recorded"}</dd></dl>
        {business.website && <a href={business.website} target="_blank" rel="noopener noreferrer">Business website</a>}
      </article>)}</div>
      <nav className={styles.actions} aria-label="Business pages"><button disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={(page + 1) * data.page_size >= data.total || busy} onClick={() => setPage(page + 1)}>Next</button></nav>
    </>}
  </>;
}
export default function CampaignResearchPage() {
  return <main className={styles.main}><h1>Carnegie campaign research</h1><p>Business research for the campaign team.</p><StaffGate>{(_session, signOut) => <Directory signOut={signOut} />}</StaffGate></main>;
}
