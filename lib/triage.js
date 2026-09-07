// Triage logic — turns the mirror table into a ranked worklist.
//
// The ledger tells you *that* corridors diverge. Triage answers the question an
// officer actually has: which one do I open first, and what am I alleging when I
// do? Every number here is derived from the mirror dataset — nothing is invented,
// and each factor is nameable so a finding can be defended in a review.

const NORMAL_BAND = 15; // ±% of ordinary asymmetry (transit, valuation, hub attribution)
const NOISE_FLOOR = 50e6; // gap size above which sampling noise stops mattering

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/**
 * How much of what the partner shipped did Lebanon actually record? Coverage is
 * the honest discriminator when there are no quantities: a declaration filed at
 * half value is the classic pricing fraud, but one filed at a twentieth is far
 * more often a hub re-consignment or an origin-attribution artefact than a
 * customs officer waving through goods at 5% of their worth.
 */
export function plausibility(c) {
  const cv = c.cover;
  if (cv == null) return 0.4;
  if (cv >= 0.4 && cv < 0.85) return 1; // the pricing band — genuine under-declaration
  if (cv >= 0.85 && cv < 1) return 0.5; // mild, shades into ordinary asymmetry
  if (cv >= 0.15) return 0.35; // wide — attribution competes with under-pricing
  if (cv >= 0) return 0.15; // near-zero — rarely a declaration at all
  return 0.3;
}

/**
 * Signal strength, 0–100. Three named factors, so an analyst can say *why* a
 * corridor scored where it did rather than pointing at a black box.
 *
 *  magnitude  — is the gap big enough to survive data noise?
 *  divergence — how far past ordinary ±15% asymmetry does it sit?
 *  evidence   — with quantities, whether they corroborate one mechanism; without
 *               them, how well coverage fits a pricing fraud rather than a hub
 *               artefact. Lebanon publishes no genuine net weight, so on public
 *               data this is always the coverage reading.
 */
export function signal(c) {
  const magnitude = clamp(Math.abs(c.gap) / NOISE_FLOOR);
  const divergence = clamp((Math.abs(c.gap_pct) - NORMAL_BAND) / 45);

  const hasQty = c.qty_gap_pct != null;
  let quality, label;
  if (hasQty) {
    label = "Pattern";
    if (c.signature === "smuggling_risk") quality = 1;
    else if (c.signature === "under_invoicing") quality = 0.85;
    else if (c.signature === "over_invoicing") quality = 0.6;
    else quality = 0.45;
  } else {
    label = "Coverage fit";
    quality = plausibility(c);
  }

  // A corridor the source itself rates "low" cannot lead a worklist.
  const conf = c.confidence === "low" ? 0.75 : 1;

  const score = (0.3 * magnitude + 0.25 * divergence + 0.45 * quality) * conf;
  return {
    score: Math.round(score * 100),
    factors: [
      { key: "magnitude", label: "Magnitude", value: magnitude },
      { key: "divergence", label: "Divergence", value: divergence },
      { key: "quality", label, value: quality },
    ],
  };
}

/**
 * What the two records actually say, in a sentence an officer can put in a file.
 * The distinction that matters: quantity agreeing while value diverges is a
 * pricing problem; both diverging together is a goods problem.
 */
export function evidence(c) {
  const v = Math.abs(c.gap_pct).toFixed(1);
  const q = c.qty_gap_pct == null ? null : Math.abs(c.qty_gap_pct).toFixed(1);

  switch (c.signature) {
    case "smuggling_risk":
      return {
        mechanism: "Goods not presented",
        reading: `Quantity short ${q}% and value short ${v}% — the two move together, so volume itself is missing from the declarations rather than being mispriced.`,
        next: "Reconcile manifests and transit records against declared entries for this corridor.",
      };
    case "under_invoicing":
      return {
        mechanism: "Value under-declared",
        reading: q
          ? `Quantity matches (${q}% apart) while declared value falls ${v}% short — the goods arrived, the price on the declaration did not.`
          : `Lebanon declares ${v}% less than the partner reports shipping, after the CIF adjustment. The shortfall is in the plausible range for mis-pricing, but without net weights the mechanism cannot be confirmed.`,
        next: "Pull declaration-level values and net weights (NAJM) and test against partner unit prices for the same HS line.",
      };
    case "over_invoicing":
      return {
        mechanism: "Over-declaration / attribution",
        reading: `Lebanon records ${v}% more than any partner reports shipping — either an over-invoiced payment channel or goods credited to a different origin at the hub.`,
        next: "Trace payment against origin; check whether UAE or Türkiye transit explains the attribution before treating it as capital flight.",
      };
    case "value_gap":
      return {
        mechanism: "Largely unrecorded",
        reading: `Lebanon records only a small fraction of what the partner reports shipping — a ${v}% shortfall. A gap this wide is more often re-consignment or hub attribution than under-pricing; a declaration filed at a tenth of value is rare, goods credited to another origin is not.`,
        next: "Check whether this heading is routed via a hub before treating it as a revenue loss.",
      };
    default:
      return {
        mechanism: "Unclassified divergence",
        reading: `Value diverges ${v}% with no quantity data to corroborate a mechanism — the gap is real but its cause is not yet separable.`,
        next: "Obtain quantity fields for this line before assigning a mechanism.",
      };
  }
}

/**
 * Split the flagged set into three tracks that answer three different questions,
 * then rank each by what it can actually return.
 *
 * The split matters more than the ranking. A "largely unrecorded" corridor and an
 * under-declared one can carry identical VAT arithmetic while meaning entirely
 * different things — one is a price on a declaration, the other is usually goods
 * credited to another origin. Summing them into a single recoverable figure would
 * roughly double the number a minister is handed, which is the one error this
 * tool cannot afford.
 */
export function triage(corridors) {
  const flagged = corridors.filter((c) => c.signature !== "normal");

  const scored = flagged.map((c) => {
    const sig = signal(c);
    return {
      ...c,
      signal: sig.score,
      factors: sig.factors,
      evidence: evidence(c),
      expected: c.vat_floor * (sig.score / 100),
    };
  });

  const byExpected = (a, b) => b.expected - a.expected;
  const byGap = (a, b) => Math.abs(b.gap) - Math.abs(a.gap);

  // Defensible revenue: the shortfall sits in a range where a mis-priced
  // declaration is the leading explanation.
  const recoverable = scored
    .filter((c) => c.vat_floor > 0 && c.signature !== "value_gap")
    .sort(byExpected)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Same arithmetic, weaker claim: verify the origin before calling it revenue.
  const checkOrigin = scored
    .filter((c) => c.vat_floor > 0 && c.signature === "value_gap")
    .sort(byExpected)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Lebanon records more than anyone reports shipping — no VAT to reclaim, and a
  // different question entirely: where value is leaving, not where duty went.
  const outflow = scored.filter((c) => c.vat_floor <= 0).sort(byGap);

  const sum = (rows) => rows.reduce((s, r) => s + r.vat_floor, 0);

  return {
    recoverable,
    checkOrigin,
    outflow,
    flaggedCount: flagged.length,
    recoverableVat: sum(recoverable),
    checkOriginVat: sum(checkOrigin),
  };
}

/** Share of total exposure sitting in the top n corridors. */
export function concentration(rows, n = 5) {
  const total = rows.reduce((s, r) => s + r.vat_floor, 0);
  if (!total) return { share: 0, n: 0, total: 0, head: 0 };
  const head = rows.slice(0, n).reduce((s, r) => s + r.vat_floor, 0);
  return { share: head / total, n: Math.min(n, rows.length), total, head };
}

/** Exposure grouped by mechanism, largest first — the "how is it failing" view. */
export function byMechanism(rows, labels) {
  const m = new Map();
  rows.forEach((r) => {
    const cur = m.get(r.signature) || { key: r.signature, count: 0, vat: 0, gap: 0 };
    cur.count += 1;
    cur.vat += r.vat_floor;
    cur.gap += Math.abs(r.gap);
    m.set(r.signature, cur);
  });
  return [...m.values()]
    .map((x) => ({ ...x, label: labels?.[x.key] ?? x.key }))
    .sort((a, b) => b.vat - a.vat || b.gap - a.gap);
}

/** Exposure grouped by partner — the "who" view, for corridor-level targeting. */
export function byPartner(rows, n = 6) {
  const m = new Map();
  rows.forEach((r) => {
    const cur = m.get(r.partnerName) || { name: r.partnerName, count: 0, vat: 0 };
    cur.count += 1;
    cur.vat += r.vat_floor;
    m.set(r.partnerName, cur);
  });
  return [...m.values()].sort((a, b) => b.vat - a.vat).slice(0, n);
}
