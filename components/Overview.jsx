"use client";

import { useMemo } from "react";
import { Bar as RBar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";
import { byYear, comparableOnly, groupBy, persistent, summary } from "@/lib/losses";
import { Bar, KeyFigure, Panel, PanelHead } from "@/components/ui";

const AXIS = "#7c7563";
const GRID = "rgba(222,217,202,0.9)";

/**
 * The first screen. Numbers, not paragraphs — the explanation lives under
 * "Method". A minister should get the size, the split and the trend in one look.
 */
export default function Overview({ data, year, onGo }) {
  const { meta, corridors } = data;
  const years = meta.years || [];
  const scope = useMemo(
    () => (year === "all" ? corridors : corridors.filter((c) => c.year === Number(year))),
    [corridors, year]
  );
  const s = useMemo(() => summary(scope), [scope]);
  const trend = useMemo(() => byYear(comparableOnly(corridors, meta), years), [corridors, meta, years]);
  const chapters = useMemo(() => groupBy(scope, "hs2", 6), [scope]);
  const partners = useMemo(() => groupBy(scope, "partnerName", 6), [scope]);
  const repeat = useMemo(() => persistent(corridors, 6), [corridors]);
  const label = year === "all" ? `${years[0]}–${years[years.length - 1]}` : year;
  const cmp = (meta.comparable_partners || []).map((p) => p.name).join(", ");

  return (
    <div className="fade-in">
      {/* 1 · Size */}
      <section className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10 items-end pb-8 mb-8 border-b border-rule">
        <KeyFigure
          label={`Customs revenue not collected · ${label}`}
          value={money(s.fiscal)}
          sub={`VAT ${money(s.vat)} + duty ${money(s.duty)} · on ${money(s.tradeValue)} of partner-reported trade`}
        />
        <div className="grid grid-cols-3 gap-4">
          <Tile color="#a03636" label="Under-declared" value={money(s.under.fiscal)} sub={`${s.under.count} corridors · act`} onClick={() => onGo?.("analytics")} />
          <Tile color="#1f6bc4" label="Unrecorded" value={money(s.unrecorded.fiscal)} sub={`${s.unrecorded.count} corridors · verify`} onClick={() => onGo?.("analytics")} />
          <Tile color="#6b6555" label="Money leaving" value={money(s.outflow)} sub={`${s.over.count} corridors · not revenue`} muted />
        </div>
      </section>

      {/* 2 · Trend + where */}
      <section className="grid lg:grid-cols-3 gap-6 mb-8">
        {years.length > 1 && (
          <Panel>
            <PanelHead title="Year on year" sub={`Same partners both years: ${cmp}`} />
            <div className="px-3 pt-4 pb-2">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="year" stroke={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }} />
                  <YAxis stroke={AXIS} tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }} tickFormatter={(v) => `$${v}M`} />
                  <Tooltip cursor={{ fill: "rgba(22,19,13,0.04)" }} contentStyle={{ background: "#fff", border: "1px solid #ded9ca", borderRadius: 0, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }} formatter={(v, n) => [`$${v}M`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: "#6b6555" }} />
                  <RBar dataKey="under" name="Under-declared" stackId="f" fill="#a03636" isAnimationActive={false} />
                  <RBar dataKey="unrecorded" name="Unrecorded" stackId="f" fill="#1f6bc4" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {trend.length === 2 && (
              <div className="px-5 pb-4 text-[12.5px] text-slate1">
                {(() => {
                  const [a, b] = trend; const d = b.fiscal - a.fiscal;
                  const p = a.fiscal ? Math.abs(100 * d / a.fiscal).toFixed(0) : 0;
                  return <><span className="text-ink num">{money(a.fiscal)}</span> → <span className="text-ink num">{money(b.fiscal)}</span> · {d < 0 ? "down" : "up"} {p}%</>;
                })()}
              </div>
            )}
          </Panel>
        )}

        <RankPanel title="Products" sub="Revenue not collected" rows={chapters} nameOf={(r) => r.label} onMore={() => onGo?.("analytics")} />
        <RankPanel title="Partners" sub="Origin as declared" rows={partners} nameOf={(r) => r.key} onMore={() => onGo?.("mirror")} />
      </section>

      {/* 3 · The repeat offenders */}
      {repeat.length > 0 && years.length > 1 && (
        <Panel>
          <PanelHead title="Same gap, both years" sub="A gap that repeats is a practice, not an accident"
            right={<button onClick={() => onGo?.("analytics")} className="text-[11px] uppercase tracking-wider num text-gold hover:text-gold2">All analytics →</button>} />
          <div className="overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th>Partner</th><th>Heading</th><th>Product</th>
                  {years.map((y) => <th key={y} className="text-right">{y}</th>)}
                  <th className="text-right">Revenue lost</th>
                </tr>
              </thead>
              <tbody>
                {repeat.map((r) => (
                  <tr key={r.key}>
                    <td>{r.partnerName}</td>
                    <td className="num text-[12px]">{r.label}</td>
                    <td className="text-[13px]">{r.chapter}</td>
                    {years.map((y) => {
                      const h = r.covers.find((c) => c.year === y);
                      return <td key={y} className="text-right num" style={{ color: h ? (h.signature === "value_gap" ? "#1f6bc4" : "#a03636") : "#7c7563" }}>{h ? `${Math.round(h.cover * 100)}%` : "—"}</td>;
                    })}
                    <td className="text-right num text-ink">{money(r.fiscal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 border-t border-rule text-[11px] text-slate2">Percent = share of the partner&apos;s shipment that Lebanon recorded.</div>
        </Panel>
      )}
    </div>
  );
}

function Tile({ color, label, value, sub, onClick, muted }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={`text-left border border-rule p-4 ${onClick ? "hover:border-gold/60 transition-colors" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2" style={{ background: color }} />
        <span className="eyebrow text-[10px]">{label}</span>
      </div>
      <div className={`display text-[24px] leading-none ${muted ? "text-slate1" : "text-ink"}`}>{value}</div>
      <div className="text-[11px] text-slate2 num mt-1.5">{sub}</div>
    </Comp>
  );
}

function RankPanel({ title, sub, rows, nameOf, onMore }) {
  const max = Math.max(...rows.map((r) => r.fiscal), 1);
  return (
    <Panel>
      <PanelHead title={title} sub={sub}
        right={onMore && <button onClick={onMore} className="text-[11px] uppercase tracking-wider num text-gold hover:text-gold2">More →</button>} />
      <ul className="px-5 py-4 space-y-3">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[13px] text-ink2 truncate">{nameOf(r)}</span>
              <span className="num text-[12.5px] text-ink shrink-0">{money(r.fiscal)}</span>
            </div>
            <Bar value={r.fiscal / max} tone="burgundy" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
