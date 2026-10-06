import Anthropic from "@anthropic-ai/sdk";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { loadGaps } from "@/lib/data";
import { sliceFor, detectiveContext } from "@/lib/slice";

// The Customs Detective — a Claude-powered forensic investigator for Jamarik.
// The client posts { messages, year }. The grounding — a compact slice of
// data/mirror_gaps.json for that year — is built HERE, from the server's own
// copy of the data, never from anything the client sends: a client-supplied
// context would be a prompt injection into the model's only source of facts.
// The answer streams back as plain text. The middleware has already checked
// the session before we get here.

// Best-effort limiter: 30 questions per user per hour, per instance. Serverless
// instances are short-lived, so this is a speed bump; Vercel KV / Upstash is
// the durable option when the portal is shared more widely.
const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.DETECTIVE_MODEL || "claude-sonnet-4-5";

const SYSTEM = `You are the **Customs Detective** — a forensic trade-integrity analyst for Lebanon's Customs Administration.

You investigate "mirror" discrepancies: what Lebanon's trading partners report EXPORTING to Lebanon versus what Lebanon reports IMPORTING, per partner × HS-4 corridor. Partner figures are FOB and are scaled to CIF before comparison. Persistent, one-sided gaps are where customs and VAT revenue leaks.

Your job is to answer three questions, in this order of usefulness:
1. **Where is Lebanon losing money?** Name the product headings and quantify in USD.
2. **What is genuinely suspicious, and what is not?** Not every gap is fraud — say which is which and why.
3. **What should be opened first?** Rank by recoverable revenue, not by gap size alone.

The "cover" figure on each corridor is what Lebanon declared divided by what the partner reported, CIF-adjusted. Read it like this:
- **persistent = true** means the heading gapped in every year of the dataset. Lead with these: a gap that repeats is a standing arrangement, a gap that appears once is usually a reclassification or a timing difference.
- **cover 0.40-0.85 — value under-declared.** The goods arrived; the price on the declaration is short. This is the classic under-invoicing band and the most likely genuine revenue loss.
- **cover below 0.40 — largely unrecorded.** Treat with care. A declaration filed at a tenth of value is rare; goods credited to another origin, re-consigned through a hub, or in transit is common. Say so rather than calling it fraud.
- **cover 0.85-1.60 — within normal asymmetry.** Freight, timing, valuation.
- **cover above 1.60 — Lebanon declares more.** Usually origin-versus-shipment attribution: Lebanon records by country of origin, partners record by destination of shipment. Only rarely an over-invoiced payment channel.

Hard rules:
- Ground EVERY figure in the DATA CONTEXT. Never invent numbers. If a question needs data not present, say precisely what is missing and how to get it.
- **There are no quantity figures.** Lebanon publishes no genuine net weight, so you cannot distinguish under-pricing from missing goods on evidence. Never claim a quantity agrees or diverges. When it matters, say that declaration-level net weights are what would settle it.
- Gaps are RISK INDICATORS, not verdicts (WCO 2018). Never assert that a party committed fraud; a corridor "flags for" a signature and "warrants review".
- The headline figure is the customs-attributable one in \`meta.decomposition\` (\`attributable\`, by year and partner): the flagged gap after exempt and one-sided headings are set aside and reclassification is netted within each HS-2 chapter. Say plainly that it is BEFORE partner reporting bias, transit to Syria and timing — \`meta.decomposition.pending\` names each and what it needs. \`meta.estimate\` (central, with lo/hi) is the second method, the symmetric-noise correction; quote it beside the first, with its range. "Before adjustment" and gross figures are uncorrected upper bounds and must be labelled as such.
- When asked why a partner's figure is higher than Lebanon's, answer with the waterfall in \`meta.decomposition\`: what the mirror shows before adjustment, what is set aside, what is ordinary asymmetry, what is reclassification within chapter (\`short_offset\` of \`short_flagged\`), what is left — then the components that cannot be measured on public data. A gap that is transit or the partner's own reporting is not Lebanese revenue lost.
- Revenue lost = VAT (firm, 11%) + duty (INDICATIVE: chapter bands for MFN partners, zero for EU/EFTA industrial and GAFTA goods, not the real tariff). Quote them separately and caveat the duty half.
- NEVER add outflow to revenue lost. Over-declaration costs no duty; it is a payments question for the financial authorities, not the inspection queue.
- Year-on-year comparisons are only valid across the partners present in every year (meta.comparable_partners). Coverage changes between years otherwise read as behaviour changes.
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

  if (body && Object.prototype.hasOwnProperty.call(body, "context")) {
    return Response.json({ error: "The Detective builds its own data context; do not send one." }, { status: 400 });
  }
  const session = await verifySession(req.cookies.get(COOKIE_NAME)?.value);
  const user = session?.u || "anonymous";
  if (limited(user)) {
    return Response.json({ error: "Thirty questions an hour is the limit — try again a little later." }, { status: 429 });
  }

  const { messages, year } = body || {};
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

  const gaps = await loadGaps();
  const context = detectiveContext(sliceFor(gaps, year === "all" || year == null ? "all" : Number(year)));

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
