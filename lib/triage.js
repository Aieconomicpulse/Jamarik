// Triage logic — turns the mirror table into a ranked worklist.
//
// The ledger tells you *that* corridors diverge. Triage answers the question an
// officer actually has: which one do I open first, and what am I alleging when I
// do? Nothing here is a score. Each corridor sits on a rung of an evidence
// ladder, and the rung is the list of named tests it passed, so a finding can
// be defended in words in a review.

/** Share of an assessed shortfall that is actually collected; calibrate from Worklist outcomes (Ticket 10). */
export const COLLECTABILITY = 0.5;

/** The evidence rung, with the named tests behind it. */
export function rung(c) {
  const under = c.signature === "under_invoicing";
  const tests = [];
  if (c.absent) tests.push("absent from Lebanon's books under any origin");
  if (c.persistent) tests.push(`flagged in ${c.years_flagged} of ${c.years_seen} years`);
  if (under) tests.push("cover in the under-declaration band (0.40–0.85)");
  if (c.p_real != null) tests.push(`${Math.round(c.p_real * 100)}% survives the noise correction`);
  if (c.hub) tests.push("hub partner — attribution risk");
  if (c.preference && c.preference !== "mfn") tests.push(`${c.preference.toUpperCase()} preference — duty not at stake`);
  const level = c.absent && c.persistent && under ? "strong"
    : (c.persistent && under) || (c.absent && under) ? "probable"
    : "verify";
  return { level, tests };
}

/** Corrected loss × collectability: what opening the corridor can be expected to return. */
export const expectedRecoverable = (c) => (c.p_real ?? 0.5) * (c.fiscal_loss || 0) * COLLECTABILITY;

/**
 * What the two records actually say, in a sentence an officer can put in a file.
 * The distinction that matters: quantity agreeing while value diverges is a
 * pricing problem; both diverging together is a goods problem. Lebanon publishes
 * no weights today, so the quantity readings wait for declaration-level data.
 */
export function evidence(c) {
  const v = Math.abs(c.gap_pct ?? 0).toFixed(1);
  const q = c.qty_gap_pct == null ? null : Math.abs(c.qty_gap_pct).toFixed(1);

  switch (c.signature) {
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
  const flagged = corridors.filter((c) => ["under_invoicing", "value_gap", "over_invoicing"].includes(c.signature));

  const scored = flagged.map((c) => ({
    ...c,
    rung: rung(c),
    evidence: evidence(c),
    expected: expectedRecoverable(c),
  }));

  const byExpected = (a, b) => b.expected - a.expected;
  const byGap = (a, b) => Math.abs(b.gap) - Math.abs(a.gap);

  // Defensible revenue: the shortfall sits in a range where a mis-priced
  // declaration is the leading explanation.
  const recoverable = scored
    .filter((c) => c.signature === "under_invoicing")
    .sort(byExpected)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Same arithmetic, weaker claim: verify the origin before calling it revenue.
  const checkOrigin = scored
    .filter((c) => c.signature === "value_gap")
    .sort(byExpected)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Lebanon records more than anyone reports shipping — no VAT to reclaim, and a
  // different question entirely: where value is leaving, not where duty went.
  const outflow = scored.filter((c) => c.signature === "over_invoicing").sort(byGap);

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
