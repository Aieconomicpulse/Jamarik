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
 * Signal strength, 0–100. Three named factors, so an analyst can say *why* a
 * corridor scored where it did rather than pointing at a black box.
 *
 *  magnitude  — is the gap big enough to survive data noise?
 *  divergence — how far past ordinary ±15% asymmetry does it sit?
 *  pattern    — do quantity and value corroborate one fraud mechanism?
 */
export function signal(c) {
  const magnitude = clamp(Math.abs(c.gap) / NOISE_FLOOR);
  const divergence = clamp((Math.abs(c.gap_pct) - NORMAL_BAND) / 45);

  // Quantity evidence is what separates a mechanism from a guess. Corridors with
  // no quantity data can never score as highly — that is the honest outcome.
  const hasQty = c.qty_gap_pct != null;
  let pattern;
  if (!hasQty) pattern = 0.35;
  else if (c.signature === "smuggling_risk") pattern = 1;
  else if (c.signature === "under_invoicing") pattern = 0.85;
  else if (c.signature === "over_invoicing") pattern = 0.6;
  else pattern = 0.45;

  const score = 0.3 * magnitude + 0.25 * divergence + 0.45 * pattern;
  return {
    score: Math.round(score * 100),
    factors: [
      { key: "magnitude", label: "Magnitude", value: magnitude },
      { key: "divergence", label: "Divergence", value: divergence },
      { key: "pattern", label: "Pattern", value: pattern },
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
        mechanism: "Value understated",
        reading: `Quantity matches (${q}% apart) while declared value falls ${v}% short — the goods arrived, the price on the declaration did not.`,
        next: "Pull declaration-level values (NAJM) and test against partner unit prices for the same HS line.",
      };
    case "over_invoicing":
      return {
        mechanism: "Over-declaration / attribution",
        reading: `Lebanon records ${v}% more than any partner reports shipping — either an over-invoiced payment channel or goods credited to a different origin at the hub.`,
        next: "Trace payment against origin; check whether UAE or Türkiye transit explains the attribution before treating it as capital flight.",
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
 * Rank by what can actually be recovered, discounted by how strong the evidence
 * is — a large gap resting on weak corroboration is worth less officer time than
 * a slightly smaller one that is airtight.
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

  // Over-invoicing yields no VAT to reclaim, so a revenue ranking would bury it.
  // It is tracked separately because it answers a different question — where
  // value is leaving the country, not where duty went uncollected.
  const revenue = scored
    .filter((c) => c.vat_floor > 0)
    .sort((a, b) => b.expected - a.expected)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  const outflow = scored
    .filter((c) => c.vat_floor <= 0)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  return { revenue, outflow, flaggedCount: flagged.length };
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
