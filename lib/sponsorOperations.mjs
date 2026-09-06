// Derived operating state only. Gift settlement remains in the sponsor ledger.
export function manualGiftConfirmationError(gift) {
  if (!gift) return "Gift not found.";
  if (gift.status !== "pending") return "Only a pending offline gift can be confirmed here.";
  if (!["check", "cash", "other"].includes(gift.method)) {
    return "Online gifts are confirmed by the payment processor. Check payment settlement before taking any action.";
  }
  return null;
}

export function sponsorshipSummary(gifts = [], outreach = []) {
  const confirmed = gifts.filter((gift) => gift.status === "confirmed");
  const pending = gifts.filter((gift) => gift.status === "pending");
  return {
    confirmedCount: confirmed.length,
    confirmedCents: confirmed.reduce((sum, gift) => sum + Number(gift.amount_cents || 0), 0),
    offlinePending: pending.filter((gift) => gift.method !== "online").length,
    onlinePending: pending.filter((gift) => gift.method === "online").length,
    recognitionReview: confirmed.filter((gift) => !gift.listed_on_site).length,
    receiptAttention: confirmed.filter((gift) => gift.recognition_status !== "sent").length,
    badgeFollowUp: confirmed.filter((gift) => gift.listed_on_site && !gift.badge_sent_at).length,
    introductionsQueued: outreach.filter((row) => row.campaign === "family-warm-request" && row.send_status === "queued").length,
    introductionsFailed: outreach.filter((row) => row.campaign === "family-warm-request" && row.send_status === "failed").length,
    outreachQueued: outreach.filter((row) => row.send_status === "queued").length,
  };
}

export function warmRequestLabel(status) {
  switch (status) {
    case "queued": return "Introduction requested. Waiting for staff review and send.";
    case "sent": return "Introduction email sent. This does not mean the business has replied.";
    case "failed": return "The introduction email could not be sent. Staff follow-up is needed.";
    default: return "No introduction email has been queued. Add a business email, then request an introduction.";
  }
}

export function recognitionDraft(gift) {
  if (!gift || gift.status !== "confirmed" || gift.listed_on_site !== true) return null;
  const badge = `https://ashleybands.com/api/sponsors/badge?id=${encodeURIComponent(gift.id)}`;
  return {
    to: gift.payer_email || "",
    subject: "Your Ashley Bands sponsor recognition is ready",
    text: [
      `Thank you for supporting the Bands of Ashley.`,
      "",
      `Sponsor recognition name: ${gift.business_name}`,
      "Your recognition is now listed at https://ashleybands.com/sponsors.",
      `Your Proud Sponsor badge: ${badge}`,
      "",
      "This is a recognition follow-up, not an additional payment request or tax receipt.",
      "Ashley Bands Sponsorships"
    ].join("\n"),
    badgeUrl: badge
  };
}

export function sameOutreachQueue(previewIds, currentIds) {
  if (!Array.isArray(previewIds) || previewIds.length !== currentIds.length) return false;
  const preview = new Set(previewIds);
  return preview.size === currentIds.length && currentIds.every((id) => preview.has(id));
}
