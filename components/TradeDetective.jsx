"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelHead, Eyebrow } from "@/components/ui";

const STARTERS = [
  "Which products are losing Lebanon the most customs revenue?",
  "Which of these gaps look genuinely suspicious, and which have an innocent explanation?",
  "Which headings gap in both years, and why does that matter?",
  "What is the total VAT at risk — and how solid is that number?",
];

/**
 * Compact slice of the mirror dataset sent to the model. Keeping this small and
 * explicit is what stops the Detective from inventing figures — it may only cite
 * what appears here.
 */
function buildContext(data) {
  if (!data) return null;
  const { meta, totals, sig_counts, corridors = [] } = data;
  return {
    meta: {
      demo: meta.demo,
      year: meta.year,
      cif_factor: meta.cif_factor,
      vat_rate: meta.vat_rate,
      reporters: meta.reporters,
      signatures: meta.signatures,
      source: meta.source,
      coverage: meta.coverage,
      quantity_available: meta.quantity_available,
      quantity_note: meta.quantity_note,
      diagnostics: meta.diagnostics,
    },
    totals,
    sig_counts,
    corridors: corridors.slice(0, 60).map((c) => ({
      partner: c.partnerName,
      hs4: c.hs4,
      chapter: c.chapter,
      label: c.label,
      partner_cif: c.x_cif,
      lebanon: c.m,
      gap: c.gap,
      gap_pct: c.gap_pct,
      qty_gap_pct: c.qty_gap_pct,
      year: c.year,
      cover: c.cover,
      signature: c.signature,
      shortfall: c.shortfall,
      vat_floor: c.vat_floor,
      duty_loss: c.duty_loss,
      fiscal_loss: c.fiscal_loss,
      outflow: c.outflow,
      persistent: c.persistent,
      confidence: c.confidence,
    })),
  };
}

/** Minimal markdown: **bold** and line breaks. Nothing else is trusted through. */
function MessageText({ text }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i} className="block">
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j} className="text-ink font-semibold">
                {part.slice(2, -2)}
              </strong>
            ) : (
              <span key={j}>{part}</span>
            )
          )}
        </span>
      ))}
    </>
  );
}

export default function TradeDetective({ data }) {
  const context = useMemo(() => buildContext(data), [data]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scroller = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text) {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    setDraft("");
    setBusy(true);

    try {
      const res = await fetch("/api/detective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || ct.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "The Detective could not answer.");
      }
      if (!res.body) throw new Error("The Detective returned no response body.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <Panel className="flex flex-col min-h-[520px]">
        <PanelHead
          title="Trade Detective"
          sub="Ask about the flagged corridors, signatures and revenue at risk · powered by Claude"
        />

        <div ref={scroller} className="flex-1 overflow-y-auto thin-scroll px-5 py-5 space-y-4 max-h-[52vh]">
          {empty && (
            <div className="text-[13px] text-slate1 leading-relaxed max-w-xl">
              I read Lebanon&apos;s mirror gaps — partner-reported exports against Lebanon&apos;s
              declared imports — and investigate where the numbers don&apos;t reconcile. Ask me
              which products are losing the most revenue, which corridors are worth an
              inspection, and which gaps have an innocent explanation.
              {data?.meta?.demo && (
                <span className="block mt-2 text-gold">
                  Demonstration data: the partner side is synthetic — figures are illustrative
                  and must not be cited.
                </span>
              )}
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="bg-bone2 border border-rule px-4 py-2.5 text-[13.5px] text-ink max-w-[80%] leading-relaxed">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <div className="text-[13.5px] text-ink2 leading-relaxed max-w-[85%] space-y-1">
                  <MessageText text={m.content} />
                </div>
              </div>
            )
          )}

          {busy && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-3 items-center text-slate1">
              <Eyebrow className="animate-pulse">Investigating…</Eyebrow>
            </div>
          )}

          {error && (
            <div className="border border-burgundy/40 bg-burgundy/5 px-3 py-2.5 text-[13px] text-burgundy">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-rule p-3 flex items-end gap-2">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder="Ask the Trade Detective…"
            className="flex-1 resize-none bg-bone2 border border-rule text-ink text-[13.5px] px-3 py-2.5 leading-relaxed focus:outline-none focus:border-gold placeholder:text-slate2"
          />
          <button
            onClick={() => send(draft)}
            disabled={busy || !draft.trim()}
            className="shrink-0 bg-ink text-bone px-4 py-2.5 text-[12px] uppercase tracking-wide num disabled:opacity-40 hover:bg-cedar transition-colors"
          >
            Ask
          </button>
        </div>
      </Panel>

      <div className="space-y-3">
        <Eyebrow>Start an investigation</Eyebrow>
        {STARTERS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={busy}
            className="w-full text-left border border-rule bg-bone hover:bg-bone2/40 hover:border-gold/50 transition-colors px-4 py-3 text-[13px] text-ink2 leading-snug disabled:opacity-50"
          >
            {s}
          </button>
        ))}
        <p className="text-[11px] text-slate2 leading-relaxed pt-2">
          The Detective answers only from the loaded mirror dataset and treats every gap as a
          risk indicator — not a verdict. It never names a party as fraudulent.
        </p>
      </div>
    </div>
  );
}
