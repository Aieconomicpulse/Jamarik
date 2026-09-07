"use client";

import { useMemo, useState } from "react";
import {
  Bar as RBar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { money, pct } from "@/lib/format";
import { groupBy, summary } from "@/lib/losses";
import { triage } from "@/lib/triage";
import { Bar, Chip, Metric, Panel, PanelHead } from "@/components/ui";

const AXIS = "#7c7563";
const GRID = "rgba(222,217,202,0.9)";

// Cover bands, low to high. Colour carries the reading; the label carries it too.
const BANDS = [
  { lo: 0.0, hi: 0.2, label: "0–20%", fill: "#1f6bc4", reading: "unrecorded" },
  { lo: 0.2, hi: 0.4, label: "20–40%", fill: "#1f6bc4", reading: "unrecorded" },
  { lo: 0.4, hi: 0.6, label: "40–60%", fill: "#a03636", reading: "under-declared" },
  { lo: 0.6, hi: 0.85, label: "60–85%", fill: "#a03636", reading: "under-declared" },
  { lo: 0.85, hi: 1.15, label: "85–115%", fill: "#a9a394", reading: "normal" },
  { lo: 1.15, hi: 1.6, label: "115–160%", fill: "#a9a394", reading: "normal" },
  { lo: 1.6, hi: 99, label: "> 160%", fill: "#6b6555", reading: "Lebanon more" },
];

const SIG_TONE = { under_invoicing: "burgundy", value_gap: "gold", over_invoicing: "neutral", normal: "cedar" };

export default function Analytics({ data, onOpenProducts, onOpenLedger }) {
  const { meta, corridors = [] } = data;
  // Partner names back to codes, so a click can open the product view.
  const partnerCode = useMemo(() => {
    const m = {};
    corridors.forEach((c) => { m[c.partnerName] = c.partner; });
    return m;
  }, [corridors]);
  const [measure, setMeasure] = useState("fiscal"); // fiscal | count
  const s = useMemo(() => summary(corridors), [corridors]);
  const t = useMemo(() => triage(corridors), [corridors]);

  const hist = useMemo(
    () => BANDS.map((b) => {
      const rows = corridors.filter((c) => c.cover >= b.lo && c.cover < b.hi);
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
  const top = useMemo(() => t.recoverable.slice(0, 10), [t]);

  const flaggedShare = s.corridors ? (s.under.count + s.unrecorded.count) / s.corridors : 0;
  const maxCh = Math.max(...chapters.map((c) => c.fiscal), 1);
  const maxP = Math.max(...partners.map((c) => c.fiscal), 1);

  return (
    <div className="fade-in">
      {/* Numbers first */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5 pb-6 mb-8 border-b border-rule">
        <Metric label="Revenue not collected" value={money(s.fiscal)} tone="gold" />
        <Metric label="of which VAT" value={money(s.vat)} />
        <Metric label="of which duty (indicative)" value={money(s.duty)} />
        <Metric label="Corridors flagged" value={`${s.under.count + s.unrecorded.count} · ${pct(flaggedShare * 100, 0)}`} />
        <Metric label="Under-declared" value={money(s.under.fiscal)} tone="burgundy" />
        <Metric label="Unrecorded · verify" value={money(s.unrecorded.fiscal)} />
      </div>

      {/* Shape of the problem */}
      <Panel className="mb-8">
        <PanelHead
          title="How much of what partners shipped did Lebanon record?"
          sub="Corridors by cover ratio · a healthy corridor sits near 100%"
          right={
            <div className="flex gap-1">
              {[["fiscal", "Revenue lost"], ["count", "Corridors"]].map(([k, l]) => (
                <button key={k} onClick={() => setMeasure(k)} aria-pressed={measure === k}
                  className={`px-2.5 py-1 text-[11px] num border ${measure === k ? "border-gold text-gold bg-gold/10" : "border-rule text-slate1 hover:text-ink"}`}>
                  {l}
                </button>
              ))}
            </div>
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
            <span><i className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: "#1f6bc4" }} />largely unrecorded</span>
            <span><i className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: "#a03636" }} />value under-declared</span>
            <span><i className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: "#a9a394" }} />within normal</span>
            <span><i className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: "#6b6555" }} />Lebanon declares more</span>
          </div>
        </div>
      </Panel>

      {/* Where */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Panel>
          <PanelHead title="By product" sub="HS chapter · revenue not collected" />
          <ul className="px-5 py-4 space-y-3.5">
            {chapters.map((r) => (
              <li key={r.key}>
                <button onClick={() => onOpenProducts?.({ partner: "all", chapter: r.key })}
                  className="w-full text-left group" title="Open every product in this chapter">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-[13px] text-ink2 group-hover:text-gold transition-colors">{r.label} <span className="text-slate2 num text-[11px] ml-1">{r.key}</span></span>
                    <span className="num text-[13px] text-ink">{money(r.fiscal)}</span>
                  </div>
                  <Bar value={r.fiscal / maxCh} tone="burgundy" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHead title="By partner" sub="Origin as declared · revenue not collected · click for products"
            right={onOpenProducts && (
              <button onClick={() => onOpenProducts({ partner: "all" })} className="text-[11px] uppercase tracking-wider num text-gold hover:text-gold2">
                All products →
              </button>
            )} />
          <ul className="px-5 py-4 space-y-3.5">
            {partners.map((r) => (
              <li key={r.key}>
                <button onClick={() => onOpenProducts?.({ partner: partnerCode[r.key] })}
                  className="w-full text-left group" title={`Open ${r.key} product by product`}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-[13px] text-ink2 group-hover:text-gold transition-colors">{r.key} <span className="text-slate2 num text-[11px] ml-1">{r.count} headings</span></span>
                    <span className="num text-[13px] text-ink">{money(r.fiscal)}</span>
                  </div>
                  <Bar value={r.fiscal / maxP} tone="burgundy" />
                  <div className="text-[11px] text-slate2 num mt-1">{money(r.trade)} trade · {pct(100 * r.fiscal / Math.max(r.trade, 1), 1)} of it</div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* What to open first */}
      <Panel>
        <PanelHead title="Open these first" sub="Ranked by revenue at stake × strength of signal · click a row for its products"
          right={onOpenLedger && (
            <button onClick={onOpenLedger} className="text-[11px] uppercase tracking-wider num text-slate1 hover:text-ink">
              Full ledger →
            </button>
          )} />
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>#</th><th>Partner</th><th>Heading</th><th>Product</th>
                <th className="text-right">Partner (CIF-adj.)</th><th className="text-right">Lebanon</th>
                <th className="text-right">Recorded</th><th>Reading</th>
                <th className="text-right">Revenue lost</th><th className="text-right">Signal</th>
                {meta.years?.length > 1 && <th>Repeat</th>}
              </tr>
            </thead>
            <tbody>
              {top.map((c) => (
                <tr key={`${c.partner}-${c.hs4}`} className="cursor-pointer"
                  onClick={() => onOpenProducts?.({ partner: c.partner, chapter: c.hs2, hs4: c.hs4 })}
                  title="Open this heading product by product">
                  <td className="num text-slate2">{String(c.rank).padStart(2, "0")}</td>
                  <td className="whitespace-nowrap">{c.partnerName}</td>
                  <td className="num text-[12px]">{c.label}</td>
                  <td className="text-[13px]">{c.chapter}</td>
                  <td className="text-right num">{money(c.x_cif)}</td>
                  <td className="text-right num">{money(c.m)}</td>
                  <td className="text-right num">{Math.round(c.cover * 100)}%</td>
                  <td><Chip tone={SIG_TONE[c.signature]}>{meta.signatures?.[c.signature] ?? c.signature}</Chip></td>
                  <td className="text-right num text-gold">{money(c.fiscal_loss)}</td>
                  <td className="text-right num">{c.signal}</td>
                  {meta.years?.length > 1 && (
                    <td>{c.persistent ? <Chip tone="burgundy">both years</Chip> : <span className="text-slate2 text-[12px]">—</span>}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-rule text-[11.5px] text-slate2">
          Under-declared corridors only — the strongest claim. Unrecorded ones are listed in the ledger under their own reading.
        </div>
      </Panel>
    </div>
  );
}
