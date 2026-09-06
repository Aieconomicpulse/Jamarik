"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "@/lib/format";
import { Disclosure, Metric, Panel, PanelHead } from "@/components/ui";
import DemoBanner from "@/components/DemoBanner";

// Categorical series colours, in fixed slot order — validated for CVD
// separation and contrast against the white chart surface. Never cycle these:
// a seventh series folds into "Other" rather than reusing slot 1.
export const SERIES = [
  "#1f6bc4",
  "#b8431a",
  "#0f7550",
  "#8f6100",
  "#b23a68",
  "#2c6b2c",
];

const AXIS = "#7c7563";
const GRID = "rgba(222,217,202,0.9)";
const MAX_SERIES = 6;

export default function MonthlyMonitor({ data }) {
  const { meta, partners, groups, grand_total: grandTotal } = data;
  const months = meta.months;
  const topGroups = groups.slice(0, MAX_SERIES);

  // Recharts wants one row per month with a column per series, in $ millions.
  const chartRows = useMemo(
    () =>
      months.map((m, i) => {
        const row = { month: m.slice(2) };
        topGroups.forEach((g) => {
          row[g.label] = +(g.series[i] / 1e6).toFixed(1);
        });
        return row;
      }),
    [months, topGroups]
  );

  return (
    <div>
      {meta.demo && <DemoBanner />}

      <div className="pb-7 mb-7 border-b border-rule">
        <p className="text-[13px] text-slate1 leading-relaxed max-w-2xl mb-6">
          Lebanon&apos;s own submissions lag by a year or more, so this is the only current
          view of what is physically moving toward Lebanese ports — an early-warning line on
          corridors before they ever reach the mirror table.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5">
          <Metric label="Reported to Lebanon" value={money(grandTotal)} tone="gold" />
          <Metric label="Window" value={`${months[0]} → ${months[months.length - 1]}`} />
          <Metric label="Publishing partners" value={`${partners.length} of 16`} />
          <Metric label="Top corridor" value={groups[0]?.label ?? "—"} />
        </div>
      </div>

      <Panel className="mb-6">
        <PanelHead
          title="Monthly trade to Lebanon — by product group"
          sub="Partner-reported, $ millions · HS-2 product groups · 1–2 month lag"
        />
        <div className="px-3 py-5">
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartRows} margin={{ top: 6, right: 18, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="month"
                stroke={AXIS}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }}
              />
              <YAxis
                stroke={AXIS}
                tickLine={false}
                axisLine={false}
                width={54}
                tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }}
                tickFormatter={(v) => `$${v}M`}
              />
              <Tooltip
                cursor={{ stroke: "#7c7563", strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #ded9ca",
                  borderRadius: 0,
                  fontSize: 12,
                  fontFamily: "IBM Plex Mono, monospace",
                }}
                labelStyle={{ color: "#6b6555" }}
                itemStyle={{ color: "#16130d" }}
                formatter={(v, name) => [`$${v}M`, name]}
              />
              <Legend
                wrapperStyle={{
                  fontSize: 11,
                  fontFamily: "IBM Plex Mono, monospace",
                  color: "#6b6555",
                  paddingTop: 10,
                }}
              />
              {topGroups.map((g, i) => (
                <Line
                  key={g.hs2}
                  type="monotone"
                  dataKey={g.label}
                  stroke={SERIES[i]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="mb-6 text-[12.5px] text-slate1 leading-relaxed max-w-3xl">
        The heavyweight absentees — China, Türkiye, the UAE and Russia — have not published
        for this window. Ranks below describe who is <em className="not-italic text-ink2">
        reporting</em>, not who is shipping most.
      </div>

      <Disclosure summary="Monthly figures by product group and partner">
        <div className="grid lg:grid-cols-2 gap-6">
          <Panel>
            <PanelHead title="By product group" sub="HS-2 aggregates across publishing partners" />
            <SeriesTable
              months={months}
              rows={groups.map((g) => ({
                key: g.hs2,
                name: `${g.hs2} · ${g.label}`,
                series: g.series,
                total: g.total,
              }))}
            />
          </Panel>

          <Panel>
            <PanelHead title="By partner" sub="Reported exports to Lebanon, monthly" />
            <SeriesTable
              months={months}
              rows={partners.map((p) => ({
                key: p.code,
                name: p.name,
                series: p.series,
                total: p.total,
              }))}
            />
          </Panel>
        </div>
      </Disclosure>
    </div>
  );
}

/** The chart's table view — same numbers, readable without colour. */
function SeriesTable({ months, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="dt">
        <thead>
          <tr>
            <th />
            {months.map((m) => (
              <th key={m} className="text-right">
                {m.slice(2)}
              </th>
            ))}
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="whitespace-nowrap">{r.name}</td>
              {r.series.map((v, i) => (
                <td key={i} className="text-right num text-[12.5px]">
                  {v ? money(v) : "—"}
                </td>
              ))}
              <td className="text-right num text-ink">{money(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
