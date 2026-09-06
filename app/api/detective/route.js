import Anthropic from "@anthropic-ai/sdk";

// The Trade Detective — a Claude-powered forensic investigator for Jamarik.
// The client posts { messages, context } where `context` is a compact slice of
// data/mirror_gaps.json (totals, signature counts, meta, top corridors). We
// ground Claude strictly in that context and stream the answer back as plain
// text. The middleware has already checked the session before we get here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.DETECTIVE_MODEL || "claude-sonnet-4-5";

const SYSTEM = `You are the **Trade Detective** — a forensic trade-integrity analyst for Lebanon's Ministry of Finance / Customs Administration.

You investigate "mirror" discrepancies: what Lebanon's trading partners report EXPORTING to Lebanon (scaled from FOB to CIF) versus what Lebanon reports IMPORTING, per partner × HS-4 corridor. Persistent gaps are statistical fingerprints of customs fraud.

Signature taxonomy you reason with:
- **Under-invoicing**: quantities roughly agree but Lebanon's declared VALUE is far lower → value understated at customs to dodge duty/VAT.
- **Smuggling / non-declaration**: partner ships significant quantity, Lebanon records little or none → goods entering off-book.
- **Over-invoicing / attribution**: Lebanon reports MORE than any partner shipped → capital-flight channel or a hub/re-export attribution artefact.
- **Within normal asymmetry**: gaps under ~10–15%, explained by transit timing, valuation, and hub attribution (UAE/Türkiye re-exports).

Hard rules:
- Ground EVERY figure in the DATA CONTEXT provided. Never invent numbers. If a question needs data not present, say precisely what's missing and how to get it.
- Gaps are RISK INDICATORS, not verdicts (WCO 2018). Never assert that a specific party committed fraud; say a corridor "flags for" a signature and "warrants investigation."
- If the context is in DEMO mode, remind the reader once that partner-side figures are synthetic and must not be cited.
- The revenue floor is VAT on flagged positive gaps — a conservative floor, not the full duty-inclusive loss.
- Answer like a briefing to a minister: lead with the finding, quantify it in USD, name the corridor(s), then the caveat. Be concise. Use markdown: **bold**, "- " bullets, short paragraphs. Prefer tight lists over tables.`;

function contextToText(ctx) {
  if (!ctx || typeof ctx !== "object") {
    return "DATA CONTEXT: (none supplied — tell the user the mirror dataset failed to load and no analysis is possible.)";
  }
  return "DATA CONTEXT (JSON — the only figures you may cite):\n" + JSON.stringify(ctx);
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, context } = body || {};
  const clean = (Array.isArray(messages) ? messages : [])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (clean.length === 0 || clean[0].role !== "user") {
    return Response.json({ error: "A user message is required." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "The Trade Detective isn't configured — add ANTHROPIC_API_KEY in your Vercel project settings." },
      { status: 503 }
    );
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const aiStream = client.messages.stream({
          model: MODEL,
          max_tokens: 2500,
          system: [
            { type: "text", text: SYSTEM },
            { type: "text", text: contextToText(context), cache_control: { type: "ephemeral" } },
          ],
          messages: clean,
        });

        for await (const event of aiStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const msg =
          err?.status === 429
            ? "Rate limit — please wait a moment and try again."
            : err?.message || "The Trade Detective hit an error.";
        controller.enqueue(encoder.encode(`\n\n⚠ ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
