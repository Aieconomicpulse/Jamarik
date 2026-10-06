"use client";

import { useMemo, useState } from "react";
import {
  Bar as RBar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { money, pct } from "@/lib/format";
import { estimateFor, groupBy, summary } from "@/lib/losses";
import { Bar, Panel, PanelHead, Segmented, Tile } from "@/components/ui";

const AXIS = "#7c7563";
const GRID = "rgba(222,217,202,0.9)";

// Cover bands, low to high. A five-colour sequence, deepest where Lebanon
// recorded far less than the partner (the harmful end) and calmer as the record
// improves: maroon, red, orange, terracotta, blush. Labels and the tooltip
// carry the reading too.
const BANDS = [
  { lo: 0.0, hi: 0.2, label: "0–20%", fill: "#7b0000", reading: "unrecorded" },
  { lo: 0.2, hi: 0.4, label: "20–40%", fill: "#c41c04", reading: "unrecorded" },
  { lo: 0.4, hi: 0.6, label: "40–60%", fill: "#e8731a", reading: "under-declared" },
  { lo: 0.6, hi: 0.85, label: "60–85%", fill: "#e8731a", reading: "under-declared" },
  { lo: 0.85, hi: 1.15, label: "85–115%", fill: "#d08068", reading: "normal" },
  { lo: 1.15, hi: 1.6, label: "115–160%", fill: "#d08068", reading: "normal" },
  { lo: 1.6, hi: 99, label: "> 160%", fill: "#eaccbf", reading: "Lebanon more" },
];

export default function Analytics({ data, year, onOpenProducts, yearControl }) {
  const { meta, corridors = [] } = data;
  // Partner names back to codes, so a click can open the product view.
  const partnerCode = useMemo(() => {
    const m = {};
    corridors.forEach((c) => { m[c.partnerName] = c.partner; });
    return m;
  }, [corridors]);
  const [measure, setMeasure] = useState("count"); // count | fiscal
  const s = useMemo(() => summary(corridors), [corridors]);

  const hist = useMemo(
    () => BANDS.map((b) => {
      const rows = corridors.filter((c) => c.signature !== "exempt" && c.signature !== "structural" && c.cover >= b.lo && c.cover < b.hi);
      return {
        ...b,
        count: rows.length,
        fiscal: +(rows.reduce((a, c) => a + (c.fiscal_loss || 0), 0) / 1e6).toFixed(1),
        trade: rows.reduce((a, c) => a + (c.x_cif || 0), 0),
      };
    }),
    [corridors]
  );

  const chapters = useMemo(() => groupBy(corridors, "hs2", 10), [corridors]);
  const partners = useMemo(() => groupBy(corridors, "partnerName", 8), [corridors]);

  const flaggedShare = s.corridors ? (s.under.count + s.unrecorded.count) / s.corridors : 0;
  // The headline is the noise-corrected estimate; gross sums are shown as bounds.
  const est = estimateFor(meta, year);
  const val = (r) => (est ? r.corrected : r.fiscal);
  const maxCh = Math.max(...chapters.map(val), 1);
  const maxP = Math.max(...partners.map(val), 1);

  return (
    <div className="fade-in">
      {yearControl && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-5">
          <div className="flex items-center gap-3"><span className="eyebrow">Year</span>{yearControl}</div>
          <div className="text-[12.5px] text-slate1 num">{meta.reporters?.map((p) => p.name).join(" · ")}</div>
        </div>
      )}
      {/* Numbers first */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-8">
        {est ? (
          <>
            <Tile label="Revenue at stake (estimate)" value={money(est.central)} tone="gold" sub={`range ${money(est.lo)}–${money(est.hi)} · gross ${money(s.fiscal)}`} />
            <Tile label="of which VAT" value={money(s.fiscal ? s.vat * est.central / s.fiscal : 0)} sub="scaled to the estimate" />
            <Tile label="of which duty (indicative)" value={money(s.fiscal ? s.duty * est.central / s.fiscal : 0)} sub="scaled to the estimate" />
            <Tile label="Corridors flagged" value={`${s.under.count + s.unrecorded.count} · ${pct(flaggedShare * 100, 0)}`} />
            <Tile label="Under-declared" value={money(s.under.corrected)} tone="amber" sub={`gross ${money(s.under.fiscal)}`} />
            <Tile label="Unrecorded · verify" value={money(s.unrecorded.corrected)} tone="crimson" sub={`gross ${money(s.unrecorded.fiscal)}`} />
          </>
        ) : (
          <>
            <Tile label="Revenue not collected" value={money(s.fiscal)} tone="gold" />
            <Tile label="of which VAT" value={money(s.vat)} />
            <Tile label="of which duty (indicative)" value={money(s.duty)} />
            <Tile label="Corridors flagged" value={`${s.under.count + s.unrecorded.count} · ${pct(flaggedShare * 100, 0)}`} />
            <Tile label="Under-declared" value={money(s.under.fiscal)} tone="amber" />
            <Tile label="Unrecorded · verify" value={money(s.unrecorded.fiscal)} tone="crimson" />
          </>
        )}
      </div>

      {/* Shape of the problem */}
      <Panel className="mb-8">
        <PanelHead
          title="How much of what partners shipped did Lebanon record?"
          sub="Corridors by cover ratio · a healthy corridor sits near 100%"
          right={
            <Segmented size="sm" label="Measure" value={measure} onChange={setMeasure}
              options={[["fiscal", "Revenue lost"], ["count", "Corridors"]]} />
          }
        />
        <div className="px-4 pt-5 pb-3">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hist} margin={{ top: 6, right: 12, bottom: 4, left: 4 }} barCategoryGap="18%">
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
                tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }} />
              <YAxis stroke={AXIS} tickLine={false} axisLine={false} width={52}
                tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }}
                tickFormatter={(v) => (measure === "fiscal" ? `$${v}M` : v)} />
              <Tooltip cursor={{ fill: "rgba(22,19,13,0.04)" }}
                contentStyle={{ background: "#fff", border: "1px solid #ded9ca", borderRadius: 0, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }}
                formatter={(v, n, p) => [measure === "fiscal" ? `$${v}M` : v, `${p.payload.reading} · ${p.payload.count} corridors · ${money(p.payload.trade)} trade`]}
                labelFormatter={(l) => `Lebanon recorded ${l} of partner figure`} />
              <RBar dataKey={measure} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {hist.map((b) => <Cell key={b.label} fill={b.fill} />)}
              </RBar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-2 mt-1 text-[11px] num">
            <span><i className="inline-block w-2.5 h-2.5 align-middle" style={{ background: "#7b0000" }} /><i className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: "#c41c04" }} />largely unrecorded</span>
            <span><i className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: "#e8731a" }} />value under-declared</span>
            <span><i className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: "#d08068" }} />within normal</span>
            <span><i className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: "#eaccbf" }} />Lebanon declares more</span>
          </div>
          {measure === "fiscal" && (
            <div className="text-[11.5px] text-slate2 mt-2">Normal and over-declared bands carry no fiscal loss by definition; switch to Corridors to see their size.</div>
          )}
        </div>
      </Panel>

      {/* Where */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Panel>
          <PanelHead title="By product" sub={est ? "HS chapter · revenue at stake (estimate) · gross in small print" : "HS chapter · revenue not collected"} />
          <ul className="px-5 py-4 space-y-3.5">
            {chapters.map((r) => (
              <li key={r.key}>
                <button onClick={() => onOpenProducts?.({ partner: "all", chapter: r.key })}
                  className="w-full text-left group cursor-pointer rounded-md -mx-2 px-2 py-1 transition-colors hover:bg-gold/5" title="Open every product in this chapter">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-[13.5px] text-ink2 group-hover:text-gold transition-colors">{r.label} <span className="text-slate2 num text-[11px] ml-1">{r.key}</span></span>
                    <span className="num text-[13px] text-ink">{money(val(r))}</span>
                  </div>
                  <Bar value={val(r) / maxCh} tone="burgundy" />
                  {est && <div className="text-[11px] text-slate2 num mt-1">gross {money(r.fiscal)}</div>}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHead title="By partner" sub={est ? "Origin as declared · revenue at stake (estimate) · click for products" : "Origin as declared · revenue not collected · click for products"}
            right={onOpenProducts && (
              <button onClick={() => onOpenProducts({ partner: "all" })} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] uppercase tracking-wider num text-gold hover:text-gold2 hover:bg-gold/5 cursor-pointer transition-colors">
                All products →
              </button>
            )} />
          <ul className="px-5 py-4 space-y-3.5">
            {partners.map((r) => (
              <li key={r.key}>
                <button onClick={() => onOpenProducts?.({ partner: partnerCode[r.key] })}
                  className="w-full text-left group cursor-pointer rounded-md -mx-2 px-2 py-1 transition-colors hover:bg-gold/5" title={`Open ${r.key} product by product`}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-[13.5px] text-ink2 group-hover:text-gold transition-colors">{r.key} <span className="text-slate2 num text-[11px] ml-1">{r.count} headings</span></span>
                    <span className="num text-[13px] text-ink">{money(val(r))}</span>
                  </div>
                  <Bar value={val(r) / maxP} tone="burgundy" />
                  <div className="text-[11px] text-slate2 num mt-1">{money(r.trade)} trade · {pct(100 * val(r) / Math.max(r.trade, 1), 1)} of it{est && ` · gross ${money(r.fiscal)}`}</div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

    </div>
  );
}
