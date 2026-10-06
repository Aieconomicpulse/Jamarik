"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Panel, PanelHead, Eyebrow } from "@/components/ui";

const STARTERS = [
  "Which products are losing Lebanon the most customs revenue?",
  "Which of these gaps look genuinely suspicious, and which have an innocent explanation?",
  "Which headings gap in both years, and why does that matter?",
  "What is the total VAT at risk — and how solid is that number?",
  "What is the total customs revenue at risk for pharmaceuticals (HS 30) — and are there any duties exemptions applied in Lebanon?",
];

/** Inline markdown: **bold**, *italic*, `code`. Rendered as React nodes, never as HTML. */
function Inline({ text }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*\s][^*]*\*(?!\w))/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i} className="text-ink font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={i} className="num text-[12.5px] bg-bone2 px-1 rounded">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^(\s*)[-*+•]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** Small markdown subset: headings, rules, bullets, numbered lists, quotes, tables, inline emphasis. */
function MessageText({ text }) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (!line.trim()) continue;
    if (RULE.test(line)) {
      out.push(<hr key={i} className="border-rule my-3" />);
    } else if ((m = line.match(HEADING))) {
      const level = m[1].length;
      out.push(
        <div key={i} className={
          level <= 2
            ? "text-[19px] font-semibold text-ink leading-snug mt-4 mb-1"
            : level === 3
            ? "text-[16.5px] font-semibold text-ink leading-snug mt-3 mb-0.5"
            : "text-[15px] font-semibold text-ink mt-3 mb-0.5"
        }>
          <Inline text={m[2]} />
        </div>
      );
    } else if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && TABLE_ROW.test(lines[j])) rows.push(cells(lines[j++]));
      out.push(
        <div key={i} className="overflow-x-auto my-2">
          <table className="text-[12.5px] border-collapse">
            <thead>
              <tr>{head.map((h, k) => (
                <th key={k} className="text-left font-semibold text-ink border-b border-rule px-2.5 py-1.5"><Inline text={h} /></th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k}>{r.map((c, n) => (
                  <td key={n} className="border-b border-rule/60 px-2.5 py-1.5 align-top"><Inline text={c} /></td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j - 1;
    } else if ((m = line.match(BULLET))) {
      const depth = Math.min(Math.floor(m[1].length / 2), 3);
      out.push(
        <div key={i} className="flex gap-2" style={{ paddingLeft: depth * 18 }}>
          <span aria-hidden className="text-slate2 select-none">•</span>
          <span className="flex-1"><Inline text={m[2]} /></span>
        </div>
      );
    } else if ((m = line.match(NUMBERED))) {
      const depth = Math.min(Math.floor(m[1].length / 2), 3);
      out.push(
        <div key={i} className="flex gap-2" style={{ paddingLeft: depth * 18 }}>
          <span aria-hidden className="num text-slate2 select-none min-w-[1.25rem]">{m[2]}.</span>
          <span className="flex-1"><Inline text={m[3]} /></span>
        </div>
      );
    } else if ((m = line.match(QUOTE))) {
      out.push(
        <div key={i} className="border-l-2 border-rule pl-3 text-slate1"><Inline text={m[1]} /></div>
      );
    } else {
      out.push(<div key={i}><Inline text={line} /></div>);
    }
  }
  return <>{out}</>;
}

export default function TradeDetective({ data, year, yearControl }) {
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
        body: JSON.stringify({ messages: next, year }),
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
          title="Customs Detective"
          sub="Ask about the flagged corridors, signatures and revenue at risk · powered by Claude"
          right={yearControl}
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
                <div className="bg-gold/10 border border-gold/20 rounded-lg rounded-br-sm px-4 py-2.5 text-[13.5px] text-ink max-w-[80%] leading-relaxed">
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
            <div role="alert" className="rounded-md border border-burgundy/40 bg-burgundy/5 px-3 py-2.5 text-[13px] text-burgundy">
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
            placeholder="Ask the Customs Detective…"
            className="flex-1 resize-none min-h-[40px] rounded-md bg-bone border border-rule text-ink text-[13.5px] px-3 py-2.5 leading-relaxed transition-colors hover:border-slate2 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 placeholder:text-slate2"
          />
          <Button icon="send" onClick={() => send(draft)} disabled={busy || !draft.trim()} className="shrink-0">
            {busy ? "Working…" : "Ask"}
          </Button>
        </div>
      </Panel>

      <div className="space-y-3">
        <Eyebrow>Start an investigation</Eyebrow>
        {STARTERS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={busy}
            className="w-full text-left rounded-lg border border-rule bg-bone shadow-card hover:bg-gold/5 hover:border-gold/50 cursor-pointer transition-colors px-4 py-3 text-[13px] text-ink2 leading-snug disabled:opacity-50 disabled:cursor-not-allowed"
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
