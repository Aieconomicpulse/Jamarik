// Turning a retrieved document into either a table or plain text.
//
// A table — CSV, TSV, Excel, or JSON that is a list of flat records — is shown
// as received: same columns, same cell text, nothing re-typed. Only what is
// not a table goes on to the extraction step, where Claude proposes records
// and lib/live/verify.js holds every figure to the source.

import * as XLSX from "xlsx";

const TABLE_EXT = [".csv", ".tsv", ".xlsx", ".xls"];
const TEXT_EXT = [".txt", ".md", ".html", ".htm", ".xml"];
export const SUPPORTED_EXT = [...TABLE_EXT, ".json", ...TEXT_EXT];

const MAX_ROWS = 5000;

const isScalar = (v) => v == null || ["string", "number", "boolean"].includes(typeof v);

/** A list of flat objects → { columns, rows }, or null if it is not one. */
function tableFromObjects(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  if (!list.every((r) => r && typeof r === "object" && !Array.isArray(r) && Object.values(r).every(isScalar))) return null;
  const columns = [];
  for (const r of list) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  const rows = list.slice(0, MAX_ROWS).map((r) => columns.map((c) => (r[c] == null ? "" : String(r[c]))));
  return { preamble: [], columns, rows, truncated: list.length > MAX_ROWS, total: list.length };
}

/** JSON that holds a table at the top level or under a usual key. */
function tableFromJson(data) {
  const direct = tableFromObjects(data);
  if (direct) return direct;
  if (data && typeof data === "object") {
    for (const k of ["data", "records", "rows", "items", "results", "dataset"]) {
      const t = tableFromObjects(data[k]);
      if (t) return t;
    }
  }
  return null;
}

const filled = (row) => row.filter((c) => String(c ?? "").trim() !== "").length;

/**
 * The header row of a sheet. Exports often open with a title line ("Exported
 * 10 records in total") before the real column names, so the header is the
 * first row that is about as full as the widest row, not simply row one.
 */
export function headerIndex(grid) {
  const widest = Math.max(0, ...grid.slice(0, 50).map(filled));
  const i = grid.slice(0, 20).findIndex((r) => filled(r) >= Math.max(2, Math.ceil(widest * 0.6)));
  return i < 0 ? 0 : i;
}

/**
 * A grid of cell text → { columns, rows, preamble }. Lines above the header
 * are kept, verbatim, as the preamble; blank rows and columns that are empty
 * in the header and every row are dropped.
 */
export function tableFromGrid(grid) {
  const g = grid.map((r) => r.map((c) => String(c ?? ""))).filter((r) => filled(r) > 0);
  if (g.length < 2) return null;
  const h = headerIndex(g);
  const header = g[h];
  const body = g.slice(h + 1);
  if (!body.length) return null;
  const width = Math.max(header.length, ...body.map((r) => r.length));
  const keep = [];
  for (let i = 0; i < width; i++) {
    if (String(header[i] ?? "").trim() || body.some((r) => String(r[i] ?? "").trim())) keep.push(i);
  }
  return {
    preamble: g.slice(0, h).map((r) => r.filter((c) => c.trim()).join(" ")),
    columns: keep.map((i) => String(header[i] ?? "").trim() || `column ${i + 1}`),
    rows: body.slice(0, MAX_ROWS).map((r) => keep.map((i) => r[i] ?? "")),
    truncated: body.length > MAX_ROWS,
    total: body.length,
  };
}

/** A sheet → { columns, rows } with the cell text as displayed in the file. */
function tableFromSheet(buf, ext) {
  const wb = XLSX.read(buf, { type: "buffer", raw: true, FS: ext === ".tsv" ? "	" : undefined });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return null;
  return tableFromGrid(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false }));
}

const AMOUNT_COL = /amount|value|usd|fob|cif|price|total/i;
const HS_COL = /hs|hs ?code|hs6|hs4|commodity code|tariff/i;

/**
 * Plain counts from a table, done by code: rows, a total for each money
 * column (only cells that hold one readable number count, and the screen
 * says how many did), and the distinct HS codes. No model is involved.
 */
export function summarize(table, parseAmount) {
  const totals = [];
  table.columns.forEach((c, i) => {
    if (!AMOUNT_COL.test(c)) return;
    let sum = 0, n = 0;
    for (const r of table.rows) {
      const v = parseAmount(r[i]);
      if (v != null) { sum += v; n += 1; }
    }
    if (n > 0) totals.push({ column: c, total: sum, counted: n, of: table.rows.length });
  });
  const hsAt = table.columns.findIndex((c) => HS_COL.test(c));
  const hs = hsAt < 0 ? [] : [...new Set(table.rows.map((r) => r[hsAt].trim()).filter(Boolean))].sort();
  return { rows: table.total, totals, hs_column: hsAt < 0 ? null : table.columns[hsAt], hs };
}

/** HTML to readable text: drop scripts and styles, keep table cells apart. */
export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(p|div|tr|li|h\d|br)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Guess the extension from a content type when a feed does not name a file. */
export function extFromContentType(ct = "") {
  const t = ct.toLowerCase();
  if (t.includes("json")) return ".json";
  if (t.includes("csv")) return ".csv";
  if (t.includes("tab-separated")) return ".tsv";
  if (t.includes("spreadsheetml") || t.includes("ms-excel")) return ".xlsx";
  if (t.includes("html")) return ".html";
  if (t.includes("xml")) return ".xml";
  return ".txt";
}

/**
 * Classify one document. Returns
 *   { kind: "table", columns, rows, total, truncated }  — show as received, or
 *   { kind: "text", text }                               — needs extraction.
 */
export function classify(buf, ext) {
  ext = ext.toLowerCase();
  if (TABLE_EXT.includes(ext)) {
    const t = tableFromSheet(buf, ext);
    if (t) return { kind: "table", ...t };
    return { kind: "text", text: buf.toString("utf8") };
  }
  const raw = buf.toString("utf8");
  if (ext === ".json") {
    try {
      const data = JSON.parse(raw);
      const t = tableFromJson(data);
      if (t) return { kind: "table", ...t };
      return { kind: "text", text: JSON.stringify(data, null, 1) };
    } catch {
      return { kind: "text", text: raw };
    }
  }
  if (ext === ".html" || ext === ".htm" || ext === ".xml") return { kind: "text", text: htmlToText(raw) };
  return { kind: "text", text: raw };
}
