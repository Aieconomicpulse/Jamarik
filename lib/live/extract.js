// Reading figures out of a document that is not a table.
//
// Claude is asked for records through a forced tool call, so the answer is
// always structured. It is told to copy, never to compute — but that is a
// request, not a guarantee. The guarantee is lib/live/verify.js, which every
// record passes through before it reaches the screen.

import Anthropic from "@anthropic-ai/sdk";
import { verifyAll } from "@/lib/live/verify";

const MODEL = process.env.LIVE_MODEL || process.env.DETECTIVE_MODEL || "claude-sonnet-4-5";
const CHUNK = 30000;
const MAX_CHUNKS = 6;

const SYSTEM = `You extract trade figures from documents sent by Lebanon's trading partners (customs releases, statistical bulletins, letters, web pages).

Rules — these are absolute:
- Copy, never compute. Every figure you return must be typed exactly as it appears in the document: same digits, same separators, same unit words. Do not convert currencies or units, round, sum, average or infer a figure that is not written.
- Every record carries "quote": the exact span of the document (one sentence, line or table row) the figures come from, copied character for character.
- value_text, quantity_text, hs_code and period must each appear inside that quote.
- If the document states no figure for something, leave the field out. Never fill a gap with an estimate or with general knowledge.
- Only trade between the sending country and Lebanon, or figures the document itself ties to Lebanon, unless the document has no Lebanon figures at all — then return nothing.
- If there is nothing to extract, call the tool with an empty list.`;

const TOOL = {
  name: "record_figures",
  description: "Return every trade figure the document states, each with the verbatim quote it was copied from.",
  input_schema: {
    type: "object",
    properties: {
      records: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quote: { type: "string", description: "Exact span of the document the figures come from." },
            product: { type: "string", description: "Product as the document names it." },
            hs_code: { type: "string", description: "HS code exactly as written, if any." },
            flow: { type: "string", enum: ["export_to_lebanon", "import_from_lebanon", "other", "unclear"] },
            period: { type: "string", description: "Year, month or period exactly as written." },
            value_text: { type: "string", description: "The value figure exactly as written, with its unit words (e.g. \"USD 1,234,500\" or \"3.4 million euros\")." },
            currency: { type: "string", description: "Currency as written, if stated." },
            quantity_text: { type: "string", description: "The quantity figure exactly as written." },
            quantity_unit: { type: "string", description: "Quantity unit as written (kg, tonnes, units…)." },
          },
          required: ["quote"],
        },
      },
      note: { type: "string", description: "One line on what the document is. No figures." },
    },
    required: ["records"],
  },
};

function chunks(text) {
  const out = [];
  for (let i = 0; i < text.length && out.length < MAX_CHUNKS; i += CHUNK) out.push(text.slice(i, i + CHUNK));
  return out;
}

/**
 * Extract and verify. Returns { verified, rejected, note, truncated }.
 * Throws when the API key is missing so the caller can say so plainly.
 */
export async function extractFigures({ text, countryName, docName }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error("Reading unstructured documents needs ANTHROPIC_API_KEY.");
    e.code = "NO_KEY";
    throw e;
  }
  const client = new Anthropic();
  const parts = chunks(text);
  const verified = [];
  const rejected = [];
  let note = "";

  for (const [i, part] of parts.entries()) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      temperature: 0,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{
        role: "user",
        content: `Sending country: ${countryName}\nDocument: ${docName}${parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : ""}\n\n<document>\n${part}\n</document>`,
      }],
    });
    const call = res.content.find((b) => b.type === "tool_use");
    const out = call?.input || {};
    // The note is unverified prose, so it is shown only when it holds no figure at all.
    if (!note && typeof out.note === "string" && !/\d/.test(out.note)) note = out.note.slice(0, 200);
    // Each part is checked against itself, so a quote cannot borrow from another part.
    const v = verifyAll(out.records, part);
    verified.push(...v.verified);
    // Only the label and the reason travel on; a rejected figure never leaves the server.
    rejected.push(...v.rejected.map((r) => ({ product: r.product, hs_code: r.hs_code, reason: r.reason })));
  }
  return { verified, rejected, note, truncated: text.length > CHUNK * MAX_CHUNKS };
}
