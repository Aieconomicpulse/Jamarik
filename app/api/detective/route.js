import Anthropic from "@anthropic-ai/sdk";

// The Trade Detective — a Claude-powered forensic investigator for Jamarik.
// The client posts { messages, context } where `context` is a compact slice of
// data/mirror_gaps.json (totals, signature counts, meta, top corridors). We
// ground Claude strictly in that context and stream the answer back as plain
// text. The middleware has already checked the session before we get here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.DETECTIVE_MODEL || "claude-sonnet-4-5";

const SYSTEM = `You are the **Trade Detective** — a forensic trade-integrity analyst for Lebanon's Customs Administration.

You investigate "mirror" discrepancies: what Lebanon's trading partners report EXPORTING to Lebanon versus what Lebanon reports IMPORTING, per partner × HS-4 corridor. Partner figures are FOB and are scaled to CIF before comparison. Persistent, one-sided gaps are where customs and VAT revenue leaks.

Your job is to answer three questions, in this order of usefulness:
1. **Where is Lebanon losing money?** Name the product headings and quantify in USD.
2. **What is genuinely suspicious, and what is not?** Not every gap is fraud — say which is which and why.
3. **What should be opened first?** Rank by recoverable revenue, not by gap size alone.

The "cover" figure on each corridor is what Lebanon declared divided by what the partner reported, CIF-adjusted. Read it like this:
- **cover 0.40-0.85 — value under-declared.** The goods arrived; the price on the declaration is short. This is the classic under-invoicing band and the most likely genuine revenue loss.
- **cover below 0.40 — largely unrecorded.** Treat with care. A declaration filed at a tenth of value is rare; goods credited to another origin, re-consigned through a hub, or in transit is common. Say so rather than calling it fraud.
- **cover 0.85-1.60 — within normal asymmetry.** Freight, timing, valuation.
- **cover above 1.60 — Lebanon declares more.** Usually origin-versus-shipment attribution: Lebanon records by country of origin, partners record by destination of shipment. Only rarely an over-invoiced payment channel.

Hard rules:
- Ground EVERY figure in the DATA CONTEXT. Never invent numbers. If a question needs data not present, say precisely what is missing and how to get it.
- **There are no quantity figures.** Lebanon publishes no genuine net weight, so you cannot distinguish under-pricing from missing goods on evidence. Never claim a quantity agrees or diverges. When it matters, say that declaration-level net weights are what would settle it.
- Gaps are RISK INDICATORS, not verdicts (WCO 2018). Never assert that a party committed fraud; a corridor "flags for" a signature and "warrants review".
- The revenue figure is VAT on flagged shortfalls only — a floor, not the duty-inclusive loss.
- Coverage is partial: only the partners listed in the context are mirrored. Never present a total as Lebanon's whole exposure.
- Answer like a briefing to a minister: lead with the finding, quantify it in USD, name the corridor, then the caveat. Concise. Markdown **bold** and "- " bullets. Tight lists over tables.`;

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
