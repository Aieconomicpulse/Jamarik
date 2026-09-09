import { loadGaps } from "@/lib/data";
import { sliceFor } from "@/lib/slice";
import { triage } from "@/lib/triage";
import { itemId, statusesFor } from "@/lib/db";

// The worklist: flagged corridors for one year, ranked by expected recoverable,
// each joined with whatever status an officer has given it. Corridors without
// a stored row are "new".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || null;
  const limit = Math.min(200, Number(url.searchParams.get("limit")) || 60);
  if (!year) return Response.json({ error: "year is required" }, { status: 400 });

  const gaps = await loadGaps();
  const t = triage(sliceFor(gaps, year).corridors);
  const ranked = [...t.recoverable, ...t.checkOrigin].sort((a, b) => b.expected - a.expected).slice(0, limit);
  const status = await statusesFor(year);

  const items = ranked.map((c, i) => {
    const id = itemId(c.year, c.partner, c.hs4);
    const row = status[id];
    return {
      id, rank: i + 1,
      year: c.year, partner: c.partner, partnerName: c.partnerName, hs4: c.hs4, chapter: c.chapter, label: c.label,
      x_fob: c.x_fob, x_cif: c.x_cif, m: c.m, cover: c.cover, gap: c.gap, partner_kg: c.partner_kg,
      unit_value: c.partner_kg ? c.x_fob / c.partner_kg : null,
      signature: c.signature, p_real: c.p_real ?? null, fiscal_loss: c.fiscal_loss,
      estimated: c.fiscal_loss * (c.p_real ?? 0), expected: c.expected,
      rung: c.rung.level, tests: c.rung.tests, evidence: c.evidence, preference: c.preference, persistent: c.persistent, absent: c.absent,
      status: row?.status ?? "new", recovered_usd: row?.recovered_usd ?? null, note: row?.note ?? null,
      updated_by: row?.updated_by ?? null, updated_at: row?.updated_at ?? null,
    };
  });
  return Response.json({ year, items, signatures: gaps.meta.signatures }, { headers: { "Cache-Control": "no-store" } });
}
