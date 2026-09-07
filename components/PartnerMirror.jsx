"use client";

import { useEffect, useMemo, useState } from "react";
import { money, pct } from "@/lib/format";
import { Chip, Metric, Panel, PanelHead, Select } from "@/components/ui";

// One partner, one year, every HS-6 code — the partner's export declarations
// beside Lebanon's import declarations. Fetched from /api/mirror so the same
// screen works unchanged when the API is backed by live feeds.

const READING = {
  under_invoicing: { label: "Value under-declared", tone: "burgundy" },
  value_gap: { label: "Largely unrecorded", tone: "gold" },
  over_invoicing: { label: "Lebanon declares more", tone: "neutral" },
  normal: { label: "Within normal", tone: "cedar" },
  not_in_lebanon: { label: "Not in Lebanese records", tone: "gold" },
  not_in_partner: { label: "Not in partner records", tone: "neutral" },
};

const PAGE = 50;

export default function PartnerMirror({ defaultYear }) {
  const [avail, setAvail] = useState(null);
  const [year, setYear] = useState(String(defaultYear ?? ""));
  const [partner, setPartner] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [reading, setReading] = useState("all");
  const [chapter, setChapter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("gap");
  const [limit, setLimit] = useState(PAGE);

  // What is available drives the selectors — nothing is hardcoded.
  useEffect(() => {
    fetch("/api/mirror").then((r) => r.json()).then((a) => {
      setAvail(a);
      const y = a.years.includes(Number(year)) ? year : String(a.years[a.years.length - 1]);
      setYear(y);
      const list = a.partners[y] || [];
      const china = list.find((p) => p.code === 156);
      setPartner(String((china ?? list[0])?.code ?? ""));
    }).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!year || !partner) return;
    setLoading(true); setError(null);
    fetch(`/api/mirror?year=${year}&partner=${partner}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || r.statusText); return r.json(); })
      .then((d) => { setData(d); setLimit(PAGE); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, partner]);

  const partnersForYear = avail?.partners?.[year] || [];
  useEffect(() => {
    if (partnersForYear.length && !partnersForYear.some((p) => String(p.code) === partner)) {
      setPartner(String(partnersForYear[0].code));
    }
  }, [year, partnersForYear, partner]);

  const chapters = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    data.rows.forEach((r) => m.set(r.hs2, r.ch));
    return [...m.entries()].sort();
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.rows;
    if (reading === "flagged") r = r.filter((x) => ["under_invoicing", "value_gap", "not_in_lebanon"].includes(x.rd));
    else if (reading !== "all") r = r.filter((x) => x.rd === reading);
    if (chapter !== "all") r = r.filter((x) => x.hs2 === chapter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((x) => x.hs6.startsWith(q) || x.ch.toLowerCase().includes(q));
    }
    const key = { gap: (x) => -x.g, vat: (x) => -x.vat, partner: (x) => -x.x, lebanon: (x) => -x.m, hs: (x) => x.hs6 }[sort];
    return [...r].sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0));
  }, [data, reading, chapter, search, sort]);

  const s = data?.summary;
  const shownVat = rows.reduce((a, r) => a + r.vat, 0);

  return (
    <div className="fade-in">
      {/* Selectors */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <div className="eyebrow mb-1.5">Partner</div>
          <Select label="Partner" value={partner} onChange={setPartner}
            options={partnersForYear.map((p) => [String(p.code), p.name])} />
        </div>
        <div>
          <div className="eyebrow mb-1.5">Year</div>
          <Select label="Year" value={year} onChange={setYear}
            options={(avail?.years || []).map((y) => [String(y), String(y)])} />
        </div>
        <div className="ml-auto text-[12px] text-slate1 leading-relaxed max-w-md">
          What <span className="text-ink">{data?.partner?.name ?? "the partner"}</span> says it
          shipped to Lebanon, beside what Lebanon says it received — every product code.
        </div>
      </div>

      {error && <div className="border border-burgundy/40 bg-burgundy/5 p-4 text-sm text-burgundy mb-6">{error}</div>}
      {loading && !data && <div className="py-16 text-center eyebrow">Loading the mirror…</div>}

      {s && (
        <>
          {/* The numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-x-6 gap-y-5 pb-6 mb-6 border-b border-rule">
            <Metric label={`${data.partner.name} says shipped`} value={money(s.x_cif)} />
            <Metric label="Lebanon says received" value={money(s.m)} />
            <Metric label="Gap" value={money(s.gap)} tone={s.gap > 0 ? "burgundy" : "ink"} />
            <Metric label="Cover" value={s.cover == null ? "—" : s.cover.toFixed(2)} />
            <Metric label="VAT forgone · under-declared" value={money(s.vat_under)} tone="gold" />
            <Metric label="VAT forgone · unrecorded" value={money(s.vat_unrecorded)} tone="gold" />
            <Metric label="Product codes" value={`${s.lines} · ${s.matched + s.matched_hs5 + s.matched_hs4} paired`} />
          </div>

          {/* Match quality — the honesty strip */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-[12px] text-slate1 mb-6">
            <span><span className="text-ink num">{s.matched}</span> matched at HS-6</span>
            <span><span className="text-ink num">{s.matched_hs5}</span> at HS-5</span>
            <span><span className="text-ink num">{s.matched_hs4}</span> at HS-4</span>
            <span><span className="text-ink num">{s.partner_only}</span> only in {data.partner.name}&apos;s records</span>
            <span><span className="text-ink num">{s.lebanon_only}</span> only in Lebanon&apos;s records</span>
            <span className="text-slate2">Lebanon reports HS 2017, partners HS 2022. Codes that fail to pair at HS-6 are rolled up and paired at HS-5, then HS-4; only what survives all three is one-sided.</span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Select label="Reading" value={reading} onChange={(v) => { setReading(v); setLimit(PAGE); }}
              options={[
                ["all", `All codes (${s.lines})`],
                ["flagged", "Flagged — revenue relevant"],
                ["under_invoicing", `Value under-declared (${s.by_reading.under_invoicing || 0})`],
                ["value_gap", `Largely unrecorded (${s.by_reading.value_gap || 0})`],
                ["not_in_lebanon", `Not in Lebanese records (${s.by_reading.not_in_lebanon || 0})`],
                ["over_invoicing", `Lebanon declares more (${s.by_reading.over_invoicing || 0})`],
                ["normal", `Within normal (${s.by_reading.normal || 0})`],
                ["not_in_partner", `Not in partner records (${s.by_reading.not_in_partner || 0})`],
              ]} />
            <Select label="Chapter" value={chapter} onChange={(v) => { setChapter(v); setLimit(PAGE); }}
              options={[["all", "All chapters"], ...chapters.map(([k, v]) => [k, `${k} · ${v}`])]} />
            <input
              value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
              placeholder="HS code or chapter…"
              className="bg-bone2 border border-rule text-ink text-[13px] px-3 py-2 num focus:outline-none focus:border-gold w-44"
            />
            <Select label="Sort" value={sort} onChange={setSort}
              options={[["gap", "Sort: gap"], ["vat", "Sort: VAT forgone"], ["partner", `Sort: ${data.partner.name} value`], ["lebanon", "Sort: Lebanon value"], ["hs", "Sort: HS code"]]} />
            <div className="ml-auto text-[11.5px] text-slate2 num">
              {rows.length} codes · {money(shownVat)} VAT forgone in view
            </div>
          </div>

          {/* The table */}
          <Panel>
            <div className="overflow-x-auto">
              <table className="dt">
                <thead className="sticky top-0 bg-bone z-10">
                  <tr>
                    <th>Code</th>
                    <th>Chapter</th>
                    <th className="text-right">{data.partner.name} FOB</th>
                    <th className="text-right">CIF-adj.</th>
                    <th className="text-right">Lebanon CIF</th>
                    <th className="text-right">Gap</th>
                    <th className="text-right">Cover</th>
                    <th>Reading</th>
                    <th className="text-right">VAT forgone</th>
                    <th className="text-right">HS ver.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((r) => {
                    const rd = READING[r.rd] || READING.normal;
                    return (
                      <tr key={r.hs6}>
                        <td className="num whitespace-nowrap">
                          {r.hs6}
                          {r.lvl && r.lvl < 6 && (
                            <span className="ml-1.5 text-[10px] text-slate2" title={`Paired at HS-${r.lvl}: the two sides use different codes below this level`}>
                              HS-{r.lvl}
                            </span>
                          )}
                        </td>
                        <td className="text-[13px]">{r.ch}</td>
                        <td className="text-right num">{r.x ? money(r.x) : <span className="text-slate2">—</span>}</td>
                        <td className="text-right num">{r.xc ? money(r.xc) : <span className="text-slate2">—</span>}</td>
                        <td className="text-right num">{r.m ? money(r.m) : <span className="text-slate2">—</span>}</td>
                        <td className={`text-right num ${r.g > 0 ? "text-burgundy" : "text-slate1"}`}>{money(r.g)}</td>
                        <td className="text-right num">{r.cv == null ? "—" : r.cv.toFixed(2)}</td>
                        <td><Chip tone={rd.tone}>{rd.label}</Chip></td>
                        <td className="text-right num text-gold">{r.vat ? money(r.vat) : <span className="text-slate2">—</span>}</td>
                        <td className="text-right num text-[11px] text-slate2">{r.lv ?? "·"}/{r.pv ?? "·"}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={10} className="text-slate1">No codes match this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {rows.length > limit && (
              <div className="px-5 py-3 border-t border-rule flex items-center gap-4">
                <button onClick={() => setLimit((n) => n + PAGE)}
                  className="text-[11px] uppercase tracking-wider num text-gold hover:text-gold2">
                  Show {Math.min(PAGE, rows.length - limit)} more
                </button>
                <span className="text-[11px] text-slate2 num">{rows.length - limit} remaining</span>
                <button onClick={() => setLimit(rows.length)}
                  className="text-[11px] uppercase tracking-wider num text-slate1 hover:text-ink ml-auto">
                  Show all
                </button>
              </div>
            )}
          </Panel>

          <p className="text-[11.5px] text-slate2 leading-relaxed mt-4 max-w-3xl">
            Gap = CIF-adjusted partner exports minus Lebanon&apos;s declared imports; positive means
            Lebanon declared less. VAT forgone is 11% of any positive gap. Cover is Lebanon ÷
            CIF-adjusted partner — 0.40–0.85 reads as under-declaration, below 0.40 as largely
            unrecorded, above 1.60 as Lebanon declaring more. HS ver. shows Lebanon&apos;s / the
            partner&apos;s classification edition. A code tagged HS-5 or HS-4 was paired at that
            level because the two sides number it differently below it.
          </p>
        </>
      )}
    </div>
  );
}
