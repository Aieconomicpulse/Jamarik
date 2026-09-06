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
import { Panel, PanelHead, Stat, Eyebrow } from "@/components/ui";
import DemoBanner from "@/components/DemoBanner";

// Categorical series colours, in fixed slot order — validated for CVD
// separation and contrast against the #16130d chart surface. Never cycle these:
// a seventh series folds into "Other" rather than reusing slot 1.
export const SERIES = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
];

const AXIS = "#7c7563";
const GRID = "rgba(57,52,42,0.9)";
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat
          label="Reported to Lebanon"
          value={money(grandTotal)}
          sub={`${months[0]} → ${months[months.length - 1]} · fast publishers only`}
        />
        <Stat
          label="Publishing partners"
          value={String(partners.length)}
          sub="China, Türkiye, UAE, Russia not yet published"
        />
        <Stat
          label="Top corridor"
          value={groups[0]?.label ?? "—"}
          sub={`${money(groups[0]?.total)} over the window`}
        />
        <Stat
          label="Top partner"
          value={partners[0]?.name ?? "—"}
          sub={`${money(partners[0]?.total)} reported shipped`}
        />
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
                cursor={{ stroke: "#a59e8c", strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "#211d15",
                  border: "1px solid #39342a",
                  borderRadius: 0,
                  fontSize: 12,
                  fontFamily: "IBM Plex Mono, monospace",
                }}
                labelStyle={{ color: "#a59e8c" }}
                itemStyle={{ color: "#f3eee2" }}
                formatter={(v, name) => [`$${v}M`, name]}
              />
              <Legend
                wrapperStyle={{
                  fontSize: 11,
                  fontFamily: "IBM Plex Mono, monospace",
                  color: "#a59e8c",
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
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#16130d" }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel>
          <PanelHead title="By product group" sub="HS-2 product aggregates across publishing partners" />
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

      <div className="mt-6 text-[12px] text-slate1 leading-relaxed max-w-3xl">
        <Eyebrow className="mb-1">Why this view exists</Eyebrow>
        Lebanon&apos;s own annual submissions lag by a year or more. Partner-side monthly
        filings are the only current view of what is physically flowing toward Lebanese
        ports — which is why the heavyweight absentees (China, Türkiye, the UAE, Russia)
        must be kept in mind when reading ranks.
      </div>
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
