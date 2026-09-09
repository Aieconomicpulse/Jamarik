import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { STATUSES, upsertItem } from "@/lib/db";

// Change one corridor's status, recovered amount or note. Any signed-in user
// may do so today; roles (auditor / admin) come with the access-control
// follow-up, and the session user is recorded on every change.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const m = /^(\d{4})-(\d+)-([0-9A-Za-z]{4})$/.exec(id || "");
  if (!m) return Response.json({ error: "id must be <year>-<partner>-<hs4>" }, { status: 400 });

  const session = await verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!session) return Response.json({ error: "Sign in to change the worklist." }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const status = body?.status ?? "new";
  if (!STATUSES.includes(status)) return Response.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
  const amount = body?.recovered_usd == null || body.recovered_usd === "" ? null : Number(body.recovered_usd);
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return Response.json({ error: "recovered_usd must be a non-negative number" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : null;

  const item = await upsertItem({
    id, year: m[1], partner: m[2], hs4: m[3], hs6: body?.hs6 ?? null,
    status, recovered_usd: amount, note, updated_by: session.u,
  });
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}
