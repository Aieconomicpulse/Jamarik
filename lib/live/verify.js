// The no-hallucination gate for extracted figures.
//
// Claude reads unstructured documents and proposes records, but it never gets
// the last word on a number. Every record must carry a quote copied from the
// source, the quote must actually be in the source, and every figure must be
// copied character for character from that quote. Anything that fails is
// rejected with the reason, not repaired. The numeric value shown on screen is
// then parsed here, deterministically, from the copied text — the model never
// computes, converts or rounds a figure. Rejection reasons never repeat the
// rejected figure, so an unverified number cannot reach the screen that way.

/** Collapse whitespace and unify the quote and dash variants a model may retype. */
export function normalize(s) {
  return String(s ?? "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Figures: must appear verbatim in the record's own quote, or the record is rejected. */
export const FIGURE_FIELDS = ["value_text", "quantity_text"];
/**
 * Context: a document often states the period or the HS code once, in a
 * heading, rather than on every line. These may come from anywhere in the
 * same document — the record is flagged when they do — and are removed if
 * the document does not contain them at all. They never carry a value.
 */
export const CONTEXT_FIELDS = ["hs_code", "period"];

const SCALE = [
  [/\b(billion|bn)\b/i, 1e9],
  [/\b(million|mn|mln|m)\b/i, 1e6],
  [/\b(thousand|k)\b/i, 1e3],
];

/**
 * The number written in a piece of copied text, or null. "1,234.5" → 1234.5;
 * "USD 3.4 million" → 3400000; "1.234.567" (dot thousands) → 1234567;
 * "1 234,5" (comma decimal) → 1234.5. Returns null when the text holds no
 * number or more than one, rather than guessing which was meant.
 */
export function parseAmount(text) {
  if (text == null) return null;
  const t = normalize(text);
  // Grouped thousands ("1,234,567", "1 234 567", "1.234.567") or a plain number.
  const nums = t.match(/-?\d{1,3}(?:[ ,.']\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g);
  if (!nums || nums.length !== 1) return null;
  let n = nums[0].replace(/[\s']/g, "");
  const dots = (n.match(/\./g) || []).length;
  const commas = (n.match(/,/g) || []).length;
  if (dots && commas) {
    // The later separator is the decimal one.
    n = n.lastIndexOf(".") > n.lastIndexOf(",") ? n.replace(/,/g, "") : n.replace(/\./g, "").replace(",", ".");
  } else if (commas) {
    // "1,234" and "1,234,567" are thousands; "12,5" is a decimal comma.
    n = commas === 1 && !/,\d{3}$/.test(n) ? n.replace(",", ".") : n.replace(/,/g, "");
  } else if (dots > 1) {
    n = n.replace(/\./g, "");
  }
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const rest = t.replace(nums[0], " ");
  const scale = SCALE.find(([re]) => re.test(rest));
  return scale ? v * scale[1] : v;
}

/**
 * Check one proposed record against the document it claims to come from.
 * Returns { ok: true, record } with the parsed figures attached, or
 * { ok: false, reason } naming the first test it failed.
 */
export function verifyRecord(rec, sourceText) {
  if (!rec || typeof rec !== "object") return { ok: false, reason: "not a record" };
  const quote = normalize(rec.quote);
  if (!quote) return { ok: false, reason: "no source quote" };
  const source = normalize(sourceText);
  if (!source.includes(quote)) return { ok: false, reason: "quote not found in the source" };

  for (const f of FIGURE_FIELDS) {
    const v = rec[f];
    if (v == null || v === "") continue;
    if (!quote.includes(normalize(v))) return { ok: false, reason: `the ${f.replace("_text", "")} is not in the quoted text` };
  }
  if (!rec.value_text && !rec.quantity_text) return { ok: false, reason: "no figure in the record" };

  const out = { ...rec };
  const fromDocument = [];
  const removed = [];
  for (const f of CONTEXT_FIELDS) {
    const v = rec[f];
    if (v == null || v === "") continue;
    const n = normalize(v);
    if (quote.includes(n)) continue;
    if (source.includes(n)) fromDocument.push(f);
    else { delete out[f]; removed.push(f); }
  }

  const value = rec.value_text ? parseAmount(rec.value_text) : null;
  const quantity = rec.quantity_text ? parseAmount(rec.quantity_text) : null;
  if (rec.value_text && value == null) return { ok: false, reason: "the value is not a single readable number" };
  if (rec.quantity_text && quantity == null) return { ok: false, reason: "the quantity is not a single readable number" };

  return { ok: true, record: { ...out, quote, value, quantity, context_from_document: fromDocument, context_removed: removed } };
}

/** Split records into verified and rejected, keeping the reason for each rejection. */
export function verifyAll(records, sourceText) {
  const verified = [];
  const rejected = [];
  for (const r of Array.isArray(records) ? records : []) {
    const res = verifyRecord(r, sourceText);
    if (res.ok) verified.push(res.record);
    else rejected.push({ ...r, reason: res.reason });
  }
  return { verified, rejected };
}
