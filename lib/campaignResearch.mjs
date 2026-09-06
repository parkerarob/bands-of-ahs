export const CAMPAIGN_BUSINESS_FIELDS = "id,name_display,city,website,email,phone,contact_person,contact_title,prior_sponsor,last_outreach_at";
export function campaignResearchRows(businesses, prospects) {
  const active = new Set(prospects.map((row) => row.business_id));
  return businesses.map((row) => ({
    id: row.id, name: row.name_display, city: row.city || "",
    website: safeBusinessWebsite(row.website), email: row.email || "", phone: row.phone || "",
    contact: row.contact_person || "", contact_title: row.contact_title || "",
    prior_sponsor: row.prior_sponsor === true,
    last_outreach_at: row.last_outreach_at || null,
    coordination_needed: active.has(row.id),
  }));
}
export function safeBusinessWebsite(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}
export function campaignResearchQuery(url) {
  const search = String(url.searchParams.get("q") || "").trim().slice(0, 100);
  const rawPage = Number(url.searchParams.get("page") || 0);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? Math.min(rawPage, 2000) : 0;
  return { search, page, size: 50 };
}
