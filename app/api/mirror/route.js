import hs6 from "@/data/mirror_hs6.json";

// The HS-6 mirror, served one partner-year at a time.
//
// This is the seam where live data will plug in. Today the route reads a JSON
// file built from Comtrade bulk downloads; tomorrow it reads the same shape
// from ASYCUDA extracts and partner ACI feeds. The client never knows which.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUNTRIES = hs6.meta.countries;

function summarise(rows) {
  const s = {
    lines: rows.length, matched: 0, matched_hs5: 0, matched_hs4: 0, partner_only: 0, lebanon_only: 0,
    x_fob: 0, x_cif: 0, m: 0, gap: 0,
    vat_all: 0, vat_under: 0, vat_unrecorded: 0, vat_not_in_lebanon: 0,
    duty_under: 0,
    by_reading: {},
  };
  for (const r of rows) {
    s[r.st] += 1;
    s.x_fob += r.x; s.x_cif += r.xc; s.m += r.m; s.gap += r.g;
    s.vat_all += r.vat;
    if (r.rd === "under_invoicing") { s.vat_under += r.vat; s.duty_under += r.duty; }
    if (r.rd === "value_gap") s.vat_unrecorded += r.vat;
    if (r.rd === "not_in_lebanon") s.vat_not_in_lebanon += r.vat;
    s.by_reading[r.rd] = (s.by_reading[r.rd] || 0) + 1;
  }
  s.cover = s.x_cif ? s.m / s.x_cif : null;
  return s;
}

export async function GET(req) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const partner = Number(url.searchParams.get("partner"));

  // No parameters: describe what is available, so the client can build its
  // selectors from the data rather than from a hardcoded list.
  if (!year || !partner) {
    const avail = {};
    for (const r of hs6.rows) {
      avail[r.y] ??= new Set();
      avail[r.y].add(r.p);
    }
    return Response.json({
      years: Object.keys(avail).map(Number).sort(),
      partners: Object.fromEntries(
        Object.entries(avail).map(([y, set]) => [
          y,
          [...set].sort().map((p) => ({ code: p, name: COUNTRIES[p] ?? String(p) })),
        ])
      ),
      meta: { cif_factor: hs6.meta.cif_factor, vat_rate: hs6.meta.vat_rate, generated: hs6.meta.generated },
    });
  }

  const rows = hs6.rows.filter((r) => r.y === year && r.p === partner);
  if (rows.length === 0) {
    return Response.json({ error: "No data for that partner and year." }, { status: 404 });
  }

  return Response.json(
    {
      year,
      partner: { code: partner, name: COUNTRIES[partner] ?? String(partner) },
      summary: summarise(rows),
      rows,
    },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
