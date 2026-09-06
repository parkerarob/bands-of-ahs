export const STEWARDSHIP_KINDS = Object.freeze({
  receipt: "Receipt follow-up", recognition: "Recognition review", badge: "Sponsor badge",
  program_listing: "Concert program listing", social_post: "Social spotlight",
  personal_thanks: "Personal thank-you", recognition_event: "Recognition event",
  renewal: "Renewal review", custom: "Other follow-up"
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function normalizeStewardship(body) {
  if (!body || typeof body !== "object") throw new Error("Missing follow-up.");
  for (const key of ["id", "request_id", "gift_id"]) if (!UUID.test(body[key] || "")) throw new Error("Invalid record reference. Reload and try again.");
  if (!Number.isInteger(body.version) || body.version < 0) throw new Error("Invalid record version.");
  if (!Object.hasOwn(STEWARDSHIP_KINDS, body.kind)) throw new Error("Choose a follow-up type.");
  if (!["open", "done", "waived"].includes(body.status)) throw new Error("Choose a valid status.");
  const text = (key, max, required = false) => {
    if (typeof body[key] !== "string" || body[key].trim().length > max || (required && !body[key].trim())) throw new Error(`Check ${key.replaceAll("_", " ")}.`);
    return body[key].trim();
  };
  const result = { id: body.id, request_id: body.request_id, gift_id: body.gift_id, version: body.version,
    kind: body.kind, status: body.status, title: text("title",160,true), owner_name: text("owner_name",100), evidence: text("evidence",2000) };
  if (body.due_on && !validDay(body.due_on)) throw new Error("Choose a valid due date.");
  result.due_on = body.due_on || null;
  if (result.status !== "open" && !result.evidence) throw new Error("Record completion evidence or the reason this is not needed.");
  return result;
}
export function anniversary(day) {
  if (!validDay(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const next = `${year + 1}-${String(month).padStart(2,"0")}-${String(date).padStart(2,"0")}`;
  return validDay(next) ? next : `${year + 1}-02-28`;
}
export function stewardshipView(gifts, items, today) {
  if (!validDay(today)) throw new Error("Invalid digest date.");
  const confirmed = gifts.filter(g => g.status === "confirmed");
  const activeIds = new Set(confirmed.map(g => g.id));
  const activeItems = items.filter(i => activeIds.has(i.gift_id));
  const open = activeItems.filter(i => i.status === "open");
  const through = new Date(`${today}T12:00:00Z`); through.setUTCDate(through.getUTCDate()+30);
  const throughDay = through.toISOString().slice(0,10);
  const sponsors = new Map();
  const suggestions = [];
  for (const gift of confirmed) {
    const key = gift.business_id || `gift:${gift.id}`;
    const prior = sponsors.get(key);
    if (!prior || (gift.confirmed_at || "") > (prior.confirmed_at || "")) sponsors.set(key,gift);
    const suggest = (kind,title) => {
      if (!activeItems.some(i=>i.gift_id===gift.id && i.kind===kind)) suggestions.push({ gift_id:gift.id, kind,title,due_on:null });
    };
    if (gift.recognition_status !== "sent") suggest("receipt","Review receipt delivery");
    if (!gift.listed_on_site) suggest("recognition","Verify sponsor recognition identity");
    if (gift.listed_on_site && !gift.badge_sent_at) suggest("badge","Prepare and deliver sponsor badge");
  }
  for (const [key,gift] of sponsors) {
    const related = confirmed.filter(g=>(g.business_id || `gift:${g.id}`)===key).map(g=>g.id);
    if (!activeItems.some(i=>i.kind==="renewal" && (i.status==="open" ? related.includes(i.gift_id) : i.gift_id===gift.id))) {
      suggestions.push({gift_id:gift.id,kind:"renewal",title:"Review annual sponsorship renewal",due_on:anniversary((gift.confirmed_at||"").slice(0,10))});
    }
  }
  const stats = { confirmedCents:confirmed.reduce((sum,g)=>sum+Number(g.amount_cents||0),0), confirmedGifts:confirmed.length,
    open:open.length, overdue:open.filter(i=>i.due_on && i.due_on<today).length,
    dueSoon:open.filter(i=>i.due_on && i.due_on>=today && i.due_on<=throughDay).length,
    unscheduled:open.filter(i=>!i.due_on).length, unassigned:open.filter(i=>!i.owner_name).length,
    inactiveHistory:items.filter(i=>!activeIds.has(i.gift_id)).length };
  const names=new Map(gifts.map(g=>[g.id,g.business_name || "Sponsor"]));
  const digest = [`Ashley Bands sponsorship check-in · ${today}`,
    `${stats.confirmedGifts} confirmed gifts · $${(stats.confirmedCents/100).toFixed(2)} in the sponsor ledger. Bank settlement is separate.`,
    `${stats.open} open follow-ups: ${stats.overdue} overdue, ${stats.dueSoon} due within 30 days, ${stats.unscheduled} without dates, ${stats.unassigned} without owners.`,
    "",...open.slice().sort((a,b)=>(a.due_on||"9999").localeCompare(b.due_on||"9999")).map(i=>`${names.get(i.gift_id)}: ${i.title} · ${i.due_on||"date not set"} · ${i.owner_name||"owner not set"}`),
    "",`${suggestions.length} suggestions await review. Suggestions do not send messages or create commitments.`].join("\n");
  return { stats, suggestions, digest, today };
}
