import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { countryByCode, retrieveDocuments } from "@/lib/live/sources";
import { classify, summarize } from "@/lib/live/parse";
import { parseAmount } from "@/lib/live/verify";
import { extractFigures } from "@/lib/live/extract";
import { FEATURES } from "@/lib/features";

// Retrieve one country's live data. Tables come back as received; anything
// else is read by Claude and only the figures that survive lib/live/verify.js
// are returned, with the rejected ones listed beside them and the reason.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Best-effort, per instance — the same speed bump the Detective uses.
const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 40;

function limited(user) {
  const now = Date.now();
  const rec = hits.get(user);
  if (!rec || now - rec.first > WINDOW_MS) {
    hits.set(user, { first: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_PER_WINDOW;
}

export async function POST(req, { params }) {
  const { code } = await params;
  // Example mode reads only samples/live; it is labelled as such end to end.
  const mode = new URL(req.url).searchParams.get("mode") === "example" && FEATURES.liveExample ? "example" : "live";
  const country = countryByCode(code, mode);
  if (!country) return Response.json({ error: "Unknown country." }, { status: 404 });

  const session = await verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (limited(session?.u || "anonymous")) {
    return Response.json({ error: "Forty retrievals an hour is the limit — try again a little later." }, { status: 429 });
  }

  try {
    const docs = await retrieveDocuments(country.code, mode);
    const sources = [];
    for (const d of docs) {
      const base = { name: d.name, origin: d.origin, modified: d.modified ?? null };
      if (d.error) { sources.push({ ...base, kind: "error", error: d.error }); continue; }

      const c = classify(d.buf, d.ext);
      if (c.kind === "table") {
        sources.push({
          ...base, kind: "table", preamble: c.preamble, columns: c.columns, rows: c.rows, total: c.total, truncated: c.truncated,
          summary: summarize(c, parseAmount),
        });
        continue;
      }
      if (!c.text.trim()) { sources.push({ ...base, kind: "error", error: "the document is empty" }); continue; }
      try {
        const x = await extractFigures({ text: c.text, countryName: country.name, docName: d.name });
        sources.push({ ...base, kind: "extracted", records: x.verified, rejected: x.rejected, note: x.note, truncated: x.truncated });
      } catch (err) {
        sources.push({
          ...base,
          kind: "error",
          error: err.code === "NO_KEY"
            ? "This document is not a table and needs Claude to read it — add ANTHROPIC_API_KEY to enable that."
            : `Claude could not read this document: ${err.message}`,
        });
      }
    }
    return Response.json(
      { mode, example: mode === "example", code: country.code, name: country.name, retrieved_at: new Date().toISOString(), connected: docs.length > 0, sources },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error(`POST /api/live/${code}:`, err);
    return Response.json({ error: err.message || "Retrieval failed." }, { status: 500 });
  }
}
