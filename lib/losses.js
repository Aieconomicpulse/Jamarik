// The loss taxonomy — what kind of money each gap represents, and what to do
// about it.
//
// Three gaps can carry identical arithmetic and mean entirely different things.
// Keeping them apart is what lets a figure survive being challenged, so the
// separation lives here rather than in any one screen.

/** Loss types, in the order a briefing should present them. */
export const LOSS_TYPES = [
  {
    key: "under_invoicing",
    label: "Value under-declared",
    short: "Under-declared",
    color: "#a03636",
    kind: "fiscal",
    claim: "Strongest claim",
    what: "The goods arrived. The price written on the declaration did not match what the supplier says it charged.",
    band: "Lebanon recorded 40–85% of the partner's figure",
    remedy: "Valuation control: a reference-price check at declaration, and post-clearance audit of the importers behind these headings.",
  },
  {
    key: "value_gap",
    label: "Largely unrecorded",
    short: "Unrecorded",
    color: "#1f6bc4",
    kind: "fiscal",
    claim: "Verify first",
    what: "The partner reports shipping goods that barely appear in Lebanese records at all.",
    band: "Lebanon recorded under 40% of the partner's figure",
    remedy: "Trace the routing before treating it as revenue. A declaration filed at a twentieth of value is rare; goods credited to another origin at a hub is not.",
  },
  {
    key: "over_invoicing",
    label: "Lebanon declares more",
    short: "Over-declared",
    color: "#6b6555",
    kind: "outflow",
    claim: "Different question",
    what: "Lebanon records importing more than any partner reports shipping. No duty was lost — if anything, more was collected.",
    band: "Lebanon recorded over 160% of the partner's figure",
    remedy: "This is a payments question, not a customs one: over-invoiced imports are a classic channel for moving money out. Refer to the financial authorities, not the inspection queue.",
  },
];

export const LOSS_BY_KEY = Object.fromEntries(LOSS_TYPES.map((t) => [t.key, t]));

/** The cover bands the pipeline uses, so screens that roll HS-6 lines up to
 *  HS-4 or chapter read the aggregate exactly the way the ledger does. */
export const BANDS = { under_lo: 0.4, under_hi: 0.85, over: 1.6 };

/** Reading for one product line or aggregate, from what each side reported. */
export function classifyCover(partnerCif, lebanon) {
  if (lebanon > 0 && partnerCif === 0) return "not_in_partner";
  if (lebanon === 0 && partnerCif > 0) return "not_in_lebanon";
  if (partnerCif === 0) return "normal";
  const cover = lebanon / partnerCif;
  if (cover >= BANDS.over) return "over_invoicing";
  if (cover < BANDS.under_lo) return "value_gap";
  if (cover < BANDS.under_hi) return "under_invoicing";
  return "normal";
}

/** Readings that represent customs revenue not collected. */
export const REVENUE_READINGS = new Set(["under_invoicing", "value_gap", "not_in_lebanon"]);

/** Corridors for one year. Pass "all" to keep every year. */
export function forYear(corridors, year) {
  return year === "all" ? corridors : corridors.filter((c) => c.year === Number(year));
}

/** Restrict to the partners present in every year, so a trend is like-for-like. */
export function comparableOnly(corridors, meta) {
  const codes = new Set((meta.comparable_partners || []).map((p) => p.code));
  return corridors.filter((c) => codes.has(c.partner));
}

const add = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);

/** Totals for one loss type over a set of corridors. */
export function lossTotals(corridors, key) {
  const rows = corridors.filter((c) => c.signature === key);
  return {
    key,
    count: rows.length,
    shortfall: add(rows, "shortfall"),
    outflow: add(rows, "outflow"),
    vat: add(rows, "vat_floor"),
    duty: add(rows, "duty_loss"),
    fiscal: add(rows, "fiscal_loss"),
  };
}

/** The headline block: fiscal loss, its split, and the outflow beside it. */
export function summary(corridors) {
  const under = lossTotals(corridors, "under_invoicing");
  const unrecorded = lossTotals(corridors, "value_gap");
  const over = lossTotals(corridors, "over_invoicing");
  const normal = corridors.filter((c) => c.signature === "normal").length;
  return {
    under,
    unrecorded,
    over,
    normal,
    corridors: corridors.length,
    flagged: under.count + unrecorded.count + over.count,
    fiscal: under.fiscal + unrecorded.fiscal,
    vat: under.vat + unrecorded.vat,
    duty: under.duty + unrecorded.duty,
    shortfall: under.shortfall + unrecorded.shortfall,
    outflow: over.outflow,
    tradeValue: add(corridors, "x_cif"),
    declared: add(corridors, "m"),
  };
}

/** Group by a field, summing what matters, largest fiscal loss first. */
export function groupBy(corridors, field, limit = 8) {
  const map = new Map();
  corridors.forEach((c) => {
    const k = c[field];
    const cur = map.get(k) || {
      key: k, label: c[field === "hs2" ? "chapter" : field] ?? k,
      count: 0, fiscal: 0, vat: 0, duty: 0, outflow: 0, shortfall: 0, trade: 0,
    };
    cur.count += 1;
    cur.fiscal += c.fiscal_loss || 0;
    cur.vat += c.vat_floor || 0;
    cur.duty += c.duty_loss || 0;
    cur.outflow += c.outflow || 0;
    cur.shortfall += c.shortfall || 0;
    cur.trade += c.x_cif || 0;
    map.set(k, cur);
  });
  return [...map.values()].sort((a, b) => b.fiscal - a.fiscal).slice(0, limit);
}

/**
 * Headings flagged in more than one year, ranked by their total fiscal loss.
 *
 * This is the strongest evidence the dataset can produce. A heading that gaps
 * once may be a reclassification, a timing difference, or a single misfiled
 * consignment. One that gaps year after year is a standing arrangement.
 */
export function persistent(corridors, limit = 12) {
  const map = new Map();
  corridors
    .filter((c) => c.persistent && c.signature !== "normal" && c.signature !== "over_invoicing")
    .forEach((c) => {
      const k = `${c.partner}-${c.hs4}`;
      const cur = map.get(k) || {
        key: k, partnerName: c.partnerName, hs4: c.hs4, chapter: c.chapter,
        label: c.label, years: [], fiscal: 0, shortfall: 0, covers: [],
      };
      cur.years.push(c.year);
      cur.fiscal += c.fiscal_loss || 0;
      cur.shortfall += c.shortfall || 0;
      cur.covers.push({ year: c.year, cover: c.cover, signature: c.signature });
      map.set(k, cur);
    });
  return [...map.values()]
    .map((r) => ({ ...r, years: r.years.sort(), covers: r.covers.sort((a, b) => a.year - b.year) }))
    .sort((a, b) => b.fiscal - a.fiscal)
    .slice(0, limit);
}

/** Year-on-year series for the fiscal loss, split by type. */
export function byYear(corridors, years) {
  return years.map((y) => {
    const s = summary(corridors.filter((c) => c.year === y));
    return {
      year: String(y),
      under: +(s.under.fiscal / 1e6).toFixed(1),
      unrecorded: +(s.unrecorded.fiscal / 1e6).toFixed(1),
      fiscal: s.fiscal,
      outflow: s.outflow,
      vat: s.vat,
      duty: s.duty,
    };
  });
}
