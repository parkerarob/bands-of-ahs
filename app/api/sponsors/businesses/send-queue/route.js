import { authorizeStaffRequest, STAFF_CAPABILITIES } from "@/lib/staffAuthorization";
import { logAudit, logAuditRequired, staffActor } from "@/lib/auditLog";
import { privateJson, privateServerError } from "@/lib/privateResponse";
import { sameOutreachQueue } from "@/lib/sponsorOperations.mjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { countQueued, dispatchOutreachQueue } from "@/lib/businessOutreachSend";

export const runtime = "nodejs";
// Allow time for a real send loop (Resend per recipient). Vercel Pro honors this.
export const maxDuration = 300;

// How many are staged to send. Drives the dashboard "Send queued (N)" button.
export async function GET(req) {
  const authorization = await authorizeStaffRequest(req, STAFF_CAPABILITIES.SPONSORSHIP_READ);
  if (!authorization.ok) return privateJson({ error: authorization.error }, authorization.status);
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from("business_outreach")
      .select("id, campaign, sent_to_email, send_status, queued_at, business:businesses(name_display)")
      .in("send_status", ["queued", "failed"]).order("queued_at").order("id").range(offset, offset + 499);
    if (error) return privateServerError("sponsor-queue-preview", error, "The outreach queue could not be loaded.");
    rows.push(...(data || []));
    if ((data || []).length < 500) break;
  }
  await logAudit({ actor: staffActor(authorization.staff), action: "view", table: "business_outreach", recordId: "queue-preview", route: "/api/sponsors/businesses/send-queue" });
  return privateJson({ queued: rows.filter((row) => row.send_status === "queued").length, rows });
}

// L2 BOUNDARY: only runs on a staff member's authenticated click, and only when
// the client affirms `confirm: true` after seeing the count. No schedule, no cron,
// no auto-send. Mirrors the parent-broadcast send gate.
export async function POST(req) {
  const authorization = await authorizeStaffRequest(req, STAFF_CAPABILITIES.SPONSORSHIP_OUTREACH_SEND);
  if (!authorization.ok) return privateJson({ error: authorization.error }, authorization.status);

  const body = await req.json().catch(() => ({}));
  const queued = await countQueued();
  if (!queued) return privateJson({ error: "Nothing is queued to send." }, 400);

  if (body.confirm !== true) {
    // Confirmation gate: tell the client the count, don't send yet.
    return privateJson({ needsConfirm: true, queued });
  }

  const currentIds = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from("business_outreach")
      .select("id").eq("send_status", "queued").order("id").range(offset, offset + 499);
    if (error) return privateServerError("sponsor-queue-check", error, "The queue could not be verified.");
    currentIds.push(...(data || []).map((row) => row.id));
    if ((data || []).length < 500) break;
  }
  if (!sameOutreachQueue(body.previewIds, currentIds)) {
    return privateJson({ error: "The outreach queue changed. Refresh and review the recipients before sending." }, 409);
  }

  const limit = Number.isFinite(body.limit) && body.limit > 0 ? Math.floor(body.limit) : 0;
  try {
    await logAuditRequired({ actor: staffActor(authorization.staff), action: "send_requested", table: "business_outreach", recordId: "queued-sponsorship-outreach", route: "/api/sponsors/businesses/send-queue", changes: { queued, limit } });
    const result = await dispatchOutreachQueue({ limit, ids: currentIds });
    return privateJson({ ok: true, ...result });
  } catch (err) {
    return privateServerError("sponsor-send-queue", err, "Sponsor outreach could not be sent.");
  }
}
