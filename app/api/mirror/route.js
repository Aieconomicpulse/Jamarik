import { loadHs6 } from "@/lib/data";

// The HS-6 mirror, served one partner-year at a time — or every mirrored
// partner at once with partner=all.
//
// This is the seam where live data plugs in. Today the route reads a JSON
// file built from Comtrade bulk downloads through lib/data.js; tomorrow
// lib/data.js reads the same shape from ASYCUDA extracts and partner feeds.
// The client never knows which, and never caches, so a refresh is a refresh.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function summarise(rows) {
  const s = {
    lines: rows.length, matched: 0, partner_only: 0, lebanon_only: 0,
    // How the partner's HS-2022 codes were placed on HS 2017 (partner-side lines only).
    by_map: { same: 0, recoded: 0, merged: 0, split: 0, unmapped: 0 },
    x_fob: 0, x_cif: 0, m: 0, gap: 0,
    vat_all: 0, vat_under: 0, vat_unrecorded: 0, vat_not_in_lebanon: 0,
    duty_under: 0,
    shortfall: 0, revenue_lines: 0,   // the lines where Lebanon registered less, and by how much
    by_reading: {},
  };
  for (const r of rows) {
    s[r.st] += 1;
    if (r.x > 0 && r.map) s.by_map[r.map] = (s.by_map[r.map] || 0) + 1;
    s.x_fob += r.x; s.x_cif += r.xc; s.m += r.m; s.gap += r.g;
    s.vat_all += r.vat;
    if (r.g > 0 && (r.rd === "under_invoicing" || r.rd === "value_gap" || r.rd === "not_in_lebanon")) {
      s.shortfall += r.g; s.revenue_lines += 1;
    }
    if (r.rd === "under_invoicing") { s.vat_under += r.vat; s.duty_under += r.duty; }
    if (r.rd === "value_gap") s.vat_unrecorded += r.vat;
    if (r.rd === "not_in_lebanon") s.vat_not_in_lebanon += r.vat;
    if (r.rd === "exempt" && r.g > 0) s.exempt_gap = (s.exempt_gap || 0) + r.g;
    if (r.rx) s.rx = (s.rx || 0) + r.rx;
    s.by_reading[r.rd] = (s.by_reading[r.rd] || 0) + 1;
  }
  s.cover = s.x_cif ? s.m / s.x_cif : null;
  s.vat_lost = s.vat_under + s.vat_unrecorded + s.vat_not_in_lebanon;
  return s;
}

export async function GET(req) {
  const hs6 = await loadHs6();
  const COUNTRIES = hs6.meta.countries;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const partnerParam = url.searchParams.get("partner");

  // No parameters: describe what is available, so the client can build its
  // selectors from the data rather than from a hardcoded list.
  if (!year || !partnerParam) {
    const avail = {};
    for (const r of hs6.rows) {
      avail[r.y] ??= new Set();
      avail[r.y].add(r.p);
    }
    return Response.json(
      {
        years: Object.keys(avail).map(Number).sort(),
        partners: Object.fromEntries(
          Object.entries(avail).map(([y, set]) => [
            y,
            [...set].sort().map((p) => ({ code: p, name: COUNTRIES[p] ?? String(p), basis: hs6.meta.basis?.[`${y}:${p}`] ?? null })),
          ])
        ),
        meta: { cif_factor: hs6.meta.cif_factor, vat_rate: hs6.meta.vat_rate, generated: hs6.meta.generated },
      },
      { headers: NO_STORE }
    );
  }

  const all = partnerParam === "all";
  const partner = all ? null : Number(partnerParam);
  const rows = hs6.rows.filter((r) => r.y === year && (all || r.p === partner));
  if (rows.length === 0) {
    return Response.json({ error: "No data for that partner and year." }, { status: 404, headers: NO_STORE });
  }

  const codes = all ? [...new Set(rows.map((r) => r.p))].sort() : [partner];
  const partners = codes.map((p) => ({ code: p, name: COUNTRIES[p] ?? String(p) }));

  return Response.json(
    {
      year,
      partner: all
        ? { code: "all", name: partners.length === 1 ? partners[0].name : `${partners.length} partners` }
        : partners[0],
      partners,
      // How the partner figure was built: domestic exports, total less re-exports, or total.
      basis: all ? "mixed" : (hs6.meta.basis?.[`${year}:${partner}`] ?? null),
      exempt_hs: hs6.meta.exempt_hs ?? [],
      summary: summarise(rows),
      rows,
      served_at: new Date().toISOString(),
    },
    { headers: NO_STORE }
  );
}
