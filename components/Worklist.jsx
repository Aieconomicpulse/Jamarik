"use client";

import { useCallback, useEffect, useState } from "react";
import { money } from "@/lib/format";
import { Button, Chip, Panel, PanelHead, Skeleton } from "@/components/ui";

// The action surface: the corridors to open first, each with its evidence
// rung, the tests behind it, and a status an officer can set. Statuses live
// in the worklist database, so they survive a reload and are shared.

const RUNG_TONE = { strong: "burgundy", probable: "gold", verify: "neutral" };
const SIG_TONE = { under_invoicing: "burgundy", value_gap: "gold" };
const STATUSES = [["new", "New"], ["review", "In review"], ["audited", "Audited"], ["recovered", "Recovered"]];

export default function Worklist({ year, yearControl, onOpenProducts }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});

  const load = useCallback(() => {
    if (!year || year === "all") return;
    setData(null); setError(null);
    fetch(`/api/worklist?year=${year}`, { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || r.statusText); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  async function save(item, patch) {
    const next = { status: item.status, recovered_usd: item.recovered_usd, note: item.note, ...patch };
    setSaving((s) => ({ ...s, [item.id]: "saving" }));
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, ...next } : x)) }));
    try {
      const r = await fetch(`/api/worklist/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      const { item: stored } = await r.json();
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, ...stored, id: x.id } : x)) }));
      setSaving((s) => ({ ...s, [item.id]: "saved" }));
      setTimeout(() => setSaving((s) => ({ ...s, [item.id]: null })), 1500);
    } catch (e) {
      setSaving((s) => ({ ...s, [item.id]: `error: ${e.message}` }));
    }
  }

  async function exportXlsx() {
    const XLSX = await import("xlsx");
    const rows = data.items.map((c) => ({
      Rank: c.rank, Year: c.year, Partner: c.partnerName, "HS-4": c.hs4, Product: c.chapter,
      "Partner FOB": c.x_fob, "Partner CIF (x1.05)": c.x_cif, "Lebanon CIF": c.m,
      "Cover": c.cover, "Gap": c.gap, "Partner kg": c.partner_kg, "Partner unit value $/kg": c.unit_value,
      Reading: data.signatures?.[c.signature] ?? c.signature, "Survives noise correction": c.p_real,
      "Gross fiscal loss": c.fiscal_loss, "Estimated": c.estimated, "Expected recoverable": c.expected,
      Rung: c.rung, Why: c.tests.join(" · "), Preference: c.preference,
      Status: c.status, "Recovered USD": c.recovered_usd, Note: c.note, "Updated by": c.updated_by, "Updated at": c.updated_at,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Worklist ${data.year}`);
    XLSX.writeFile(wb, `jamarik-worklist-${data.year}.xlsx`);
  }

  const recovered = data ? data.items.reduce((s, c) => s + (c.recovered_usd || 0), 0) : 0;
  const counts = data ? data.items.reduce((a, c) => ({ ...a, [c.status]: (a[c.status] || 0) + 1 }), {}) : {};

  return (
    <div className="fade-in">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-5">
        {yearControl && <div className="flex items-center gap-3"><span className="eyebrow">Year</span>{yearControl}</div>}
        {data && (
          <div className="text-[12.5px] text-slate1 num">
            {data.items.length} corridors · {counts.review || 0} in review · {counts.audited || 0} audited · {counts.recovered || 0} recovered · <span className="text-ink">{money(recovered)}</span> recovered so far
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" icon="refresh" onClick={load} disabled={!data}>Refresh</Button>
          <Button variant="primary" onClick={exportXlsx} disabled={!data} title="One sheet, the working per row">Export to Excel</Button>
        </div>
      </div>

      {year === "all" && (
        <div className="text-[13px] text-slate1 mb-4">Pick one year — the worklist is worked a year at a time.</div>
      )}
      {error && <div role="alert" className="rounded-md border border-burgundy/40 bg-burgundy/5 p-4 text-sm text-burgundy mb-4">{error}</div>}
      {!data && !error && year !== "all" && (
        <div aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 mb-2" />)}</div>
      )}

      {data && (
        <Panel>
          <PanelHead title="Open these first" sub="Flagged corridors ranked by expected recoverable = corrected loss × collectability (0.5 until calibrated) · click a heading for its products" />
          <div className="overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th>#</th><th>Partner</th><th>Heading</th>
                  <th className="text-right">Partner (CIF)</th><th className="text-right">Lebanon</th>
                  <th className="text-right" title="Partner FOB ÷ partner net weight">Unit value</th>
                  <th>Reading</th><th className="text-right">Estimated</th><th className="text-right">Expected</th>
                  <th>Rung</th><th>Why</th><th>Status</th><th className="text-right">Recovered</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td className="num text-slate2">{String(c.rank).padStart(2, "0")}</td>
                    <td className="whitespace-nowrap">{c.partnerName}</td>
                    <td>
                      <button onClick={() => onOpenProducts?.({ partner: c.partner, chapter: c.hs4.slice(0, 2), hs4: c.hs4 })}
                        className="text-left cursor-pointer group" title="Open this heading product by product">
                        <div className="num text-[12px] text-slate1 group-hover:text-gold transition-colors">HS {c.hs4}</div>
                        <div className="text-[13px] leading-snug max-w-[200px]">{c.chapter}</div>
                      </button>
                    </td>
                    <td className="text-right num">{money(c.x_cif)}</td>
                    <td className="text-right num">{money(c.m)} <span className="text-slate2 text-[11px]">{c.cover == null ? "" : `${Math.round(c.cover * 100)}%`}</span></td>
                    <td className="text-right num">{c.unit_value ? `$${c.unit_value.toFixed(2)}/kg` : <span className="text-slate2">—</span>}</td>
                    <td><Chip tone={SIG_TONE[c.signature] || "neutral"}>{data.signatures?.[c.signature] ?? c.signature}</Chip></td>
                    <td className="text-right num text-gold" title={`gross ${money(c.fiscal_loss)}`}>{money(c.estimated)}</td>
                    <td className="text-right num">{money(c.expected)}</td>
                    <td><Chip tone={RUNG_TONE[c.rung]}>{c.rung}</Chip></td>
                    <td className="text-[11.5px] text-slate1 leading-snug max-w-[260px]">{c.tests.join(" · ")}</td>
                    <td>
                      <select value={c.status} onChange={(e) => save(c, { status: e.target.value })} aria-label={`Status for HS ${c.hs4}`}
                        className="h-9 pl-2 pr-7 rounded-md bg-bone border border-rule text-[12.5px] num cursor-pointer focus:outline-none focus:border-gold">
                        {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      {saving[c.id] && <div className={`text-[10.5px] num mt-1 ${String(saving[c.id]).startsWith("error") ? "text-burgundy" : "text-cedar"}`}>{saving[c.id]}</div>}
                    </td>
                    <td className="text-right">
                      <input type="number" min="0" step="1000" defaultValue={c.recovered_usd ?? ""} placeholder="$"
                        aria-label={`Recovered for HS ${c.hs4}`}
                        onBlur={(e) => { const v = e.target.value; if ((v === "" ? null : Number(v)) !== (c.recovered_usd ?? null)) save(c, { recovered_usd: v === "" ? null : Number(v) }); }}
                        className="h-9 w-28 px-2 rounded-md bg-bone border border-rule text-[12.5px] num text-right focus:outline-none focus:border-gold" />
                    </td>
                    <td>
                      <input type="text" defaultValue={c.note ?? ""} placeholder="note" aria-label={`Note for HS ${c.hs4}`}
                        onBlur={(e) => { if (e.target.value !== (c.note ?? "")) save(c, { note: e.target.value }); }}
                        className="h-9 w-40 px-2 rounded-md bg-bone border border-rule text-[12.5px] focus:outline-none focus:border-gold" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-rule text-[11.5px] text-slate2">
            Under-declared corridors carry the strongest claim; largely unrecorded ones are listed for origin checks. Statuses are shared and recorded with the user who set them.
          </div>
        </Panel>
      )}
    </div>
  );
}
