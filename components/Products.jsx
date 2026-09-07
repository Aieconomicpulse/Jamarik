"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { LOSS_BY_KEY, REVENUE_READINGS, classifyCover } from "@/lib/losses";
import { Chip, Metric, Panel, Select } from "@/components/ui";

// Product by product. What the partner says it exported to Lebanon, what
// Lebanon registered, the difference, and the VAT that difference cost —
// at whichever level of the HS code the reader wants: chapter, HS-4 or HS-6.
//
// Everything here comes from /api/mirror, so the screen is unchanged when the
// route is backed by a live feed instead of a file. Refresh re-asks the API.

const READING = {
  under_invoicing: { label: "Under-declared", tone: "burgundy" },
  value_gap: { label: "Largely unrecorded", tone: "gold" },
  not_in_lebanon: { label: "Not registered", tone: "gold" },
  over_invoicing: { label: "Lebanon declares more", tone: "neutral" },
  normal: { label: "Matches", tone: "cedar" },
  not_in_partner: { label: "Only in Lebanon's books", tone: "neutral" },
};

const LEVELS = [["2", "Chapter"], ["4", "HS-4"], ["6", "HS-6"]];
const PAGE = 50;

/**
 * Roll HS-6 lines up to the requested level. The aggregate is read the way
 * the ledger reads an HS-4 corridor: gap on the summed figures, then the band.
 * VAT is counted only where the reading is a revenue reading, so the column
 * totals agree with the headline.
 */
function rollup(rows, level, vatRate) {
  const map = new Map();
  for (const r of rows) {
    const key = level === 2 ? r.hs2 : level === 4 ? r.hs4 : r.hs6;
    const cur = map.get(key) || {
      key, code: key, hs2: r.hs2, hs4: r.hs4,
      name: r.ch || (r.hs2 === "99" ? "Unclassified — confidential or unallocated" : `Chapter ${r.hs2}`),
      x: 0, xc: 0, m: 0, duty: 0, lines: 0, lvl: 6,
      partners: new Set(), editions: new Set(),
    };
    cur.x += r.x; cur.xc += r.xc; cur.m += r.m; cur.lines += 1;
    cur.partners.add(r.p);
    if (r.lv || r.pv) cur.editions.add(`${r.lv ?? "·"}/${r.pv ?? "·"}`);
    if (r.lvl && r.lvl < cur.lvl) cur.lvl = r.lvl;
    if (r.g > 0) cur.duty += r.duty;
    map.set(key, cur);
  }
  const out = [];
  for (const c of map.values()) {
    c.g = c.xc - c.m;
    c.cv = c.xc ? c.m / c.xc : null;
    c.rd = classifyCover(c.xc, c.m);
    const revenue = REVENUE_READINGS.has(c.rd) && c.g > 0;
    c.vat = revenue ? c.g * vatRate : 0;
    if (!revenue) c.duty = 0;
    out.push(c);
  }
  return out;
}

const SORT = {
  gap: (r) => -r.g,
  vat: (r) => -r.vat,
  partner: (r) => -r.xc,
  lebanon: (r) => -r.m,
  code: (r) => r.code,
};

export default function Products({ defaultYear, focus, vatRate = 0.11 }) {
  const [avail, setAvail] = useState(null);
  const [year, setYear] = useState(String(defaultYear ?? ""));
  const [partner, setPartner] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);

  const [level, setLevel] = useState("4");
  const [scope, setScope] = useState("revenue"); // revenue | all
  const [chapter, setChapter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "gap", dir: 1 });
  const [open, setOpen] = useState(null);
  const [limit, setLimit] = useState(PAGE);

  // What is available drives the selectors — nothing is hardcoded.
  useEffect(() => {
    fetch("/api/mirror", { cache: "no-store" }).then((r) => r.json()).then((a) => {
      setAvail(a);
      const y = a.years.includes(Number(year)) ? year : String(a.years[a.years.length - 1]);
      setYear(y);
      const list = a.partners[y] || [];
      const china = list.find((p) => p.code === 156);
      // Functional update: if another screen already pointed at a partner
      // while this fetch was in flight, keep that, not the default.
      setPartner((cur) => cur || String((china ?? list[0])?.code ?? ""));
    }).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Another screen asked for a specific partner, chapter or heading.
  useEffect(() => {
    if (!focus) return;
    if (focus.year) setYear(String(focus.year));
    if (focus.partner != null) setPartner(String(focus.partner));
    setChapter(focus.chapter ?? "all");
    if (focus.hs4) { setLevel("6"); setSearch(focus.hs4); setScope("all"); } else { setSearch(""); setScope("revenue"); }
    setOpen(null);
    setLimit(PAGE);
  }, [focus]);

  const load = useCallback(() => {
    if (!year || !partner) return;
    setLoading(true); setError(null);
    fetch(`/api/mirror?year=${year}&partner=${partner}`, { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || r.statusText); return r.json(); })
      .then((d) => { setData(d); setFetchedAt(new Date()); setLimit(PAGE); setOpen(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, partner]);

  useEffect(() => { load(); }, [load]);

  const partnersForYear = avail?.partners?.[year] || [];
  useEffect(() => {
    if (!partnersForYear.length || partner === "all" || partnersForYear.some((p) => String(p.code) === partner)) return;
    // The partner is not mirrored in this year. Prefer following the partner
    // to a year that has it over silently switching to a different partner.
    const other = (avail?.years || []).find((y) => (avail.partners[y] || []).some((p) => String(p.code) === partner));
    if (other) setYear(String(other)); else setPartner(String(partnersForYear[0].code));
  }, [year, partnersForYear, partner, avail]);

  const rate = avail?.meta?.vat_rate ?? vatRate;
  const lvl = Number(level);

  const chapters = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    data.rows.forEach((r) => m.set(r.hs2, r.ch));
    return [...m.entries()].sort();
  }, [data]);

  const rolled = useMemo(() => (data ? rollup(data.rows, lvl, rate) : []), [data, lvl, rate]);

  const rows = useMemo(() => {
    let r = rolled;
    if (scope === "revenue") r = r.filter((x) => REVENUE_READINGS.has(x.rd) && x.g > 0);
    if (chapter !== "all") r = r.filter((x) => x.hs2 === chapter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((x) => x.code.startsWith(q) || x.name.toLowerCase().includes(q));
    }
    const key = SORT[sort.key] || SORT.gap;
    return [...r].sort((a, b) => {
      const ka = key(a), kb = key(b);
      return (ka > kb ? 1 : ka < kb ? -1 : 0) * sort.dir;
    });
  }, [rolled, scope, chapter, search, sort]);

  const s = data?.summary;
  const inView = rows.reduce((a, r) => ({ xc: a.xc + r.xc, m: a.m + r.m, vat: a.vat + r.vat }), { xc: 0, m: 0, vat: 0 });
  const name = data?.partner?.name ?? "the partner";
  const many = data?.partner?.code === "all";

  const onSort = (key) => setSort((cur) => (cur.key === key ? { key, dir: -cur.dir } : { key, dir: 1 }));
  const reset = (fn) => (v) => { fn(v); setLimit(PAGE); setOpen(null); };

  return (
    <div className="fade-in">
      {/* Who and when */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <div className="eyebrow mb-1.5">Partner</div>
          <Select label="Partner" value={partner} onChange={reset(setPartner)}
            options={[...partnersForYear.map((p) => [String(p.code), p.name]), ["all", "All mirrored partners"]]} />
        </div>
        <div>
          <div className="eyebrow mb-1.5">Year</div>
          <Select label="Year" value={year} onChange={reset(setYear)}
            options={(avail?.years || []).map((y) => [String(y), String(y)])} />
        </div>
        <div>
          <div className="eyebrow mb-1.5">Product level</div>
          <div className="flex">
            {LEVELS.map(([k, l]) => (
              <button key={k} onClick={() => reset(setLevel)(k)} aria-pressed={level === k}
                className={`px-3 py-2 text-[12px] num border -ml-px first:ml-0 transition-colors ${
                  level === k ? "border-gold bg-gold/10 text-gold relative z-10" : "border-rule text-slate1 hover:text-ink"
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11.5px] text-slate2 num">
          {fetchedAt && <span>as of {fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={load} disabled={loading}
            className="uppercase tracking-wider text-gold hover:text-gold2 disabled:opacity-40">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="border border-burgundy/40 bg-burgundy/5 p-4 text-sm text-burgundy mb-6">{error}</div>}
      {loading && !data && <div className="py-16 text-center eyebrow">Loading the mirror…</div>}

      {s && (
        <>
          {/* The sentence */}
          <p className="text-[15.5px] md:text-[17px] text-ink2 leading-relaxed max-w-4xl mb-6">
            In {data.year}, <span className="text-ink">{many ? `${data.partners.length} partners` : name}</span>{" "}
            {many ? "say they" : "says it"} exported <span className="num text-ink">{money(s.x_cif)}</span> to Lebanon.
            Lebanon registered <span className="num text-ink">{money(s.m)}</span>,{" "}
            <span className={`num ${s.gap > 0 ? "text-burgundy" : "text-ink"}`}>{money(Math.abs(s.gap))}</span>{" "}
            {s.gap > 0 ? "less" : "more"} in total.
            {s.gap <= 0 && " But "}{s.gap > 0 && " "}
            {s.gap <= 0 ? "on" : "On"} <span className="num text-ink">{s.revenue_lines.toLocaleString()}</span> products Lebanon
            registered <span className="num text-burgundy">{money(s.shortfall)}</span> less than {many ? "the partners" : name} reported,
            and the VAT not collected on those is <span className="num text-gold">{money(s.vat_lost)}</span>.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-5 pb-6 mb-6 border-b border-rule">
            <Metric size="lg" label={`${many ? "Partners" : name} exported`} value={money(s.x_cif)} sub={`${money(s.x_fob)} FOB, CIF-adjusted ×${avail?.meta?.cif_factor ?? 1.05}`} />
            <Metric size="lg" label="Lebanon registered" value={money(s.m)} sub={s.cover == null ? "—" : `${Math.round(s.cover * 100)}% of the partner figure`} />
            <Metric size="lg" label="Difference in total" value={money(s.gap)} tone={s.gap > 0 ? "burgundy" : "ink"} sub={s.gap > 0 ? "Lebanon registered less overall" : "Lebanon registered more overall"} />
            <Metric size="lg" label="VAT not collected" value={money(s.vat_lost)} tone="gold" sub={`${Math.round(rate * 100)}% of ${money(s.shortfall)} short on ${s.revenue_lines.toLocaleString()} products`} />
          </div>

          {/* Match quality — the honesty strip */}
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[11.5px] text-slate1 mb-6">
            <span><span className="text-ink num">{s.lines.toLocaleString()}</span> product lines</span>
            <span><span className="text-ink num">{s.matched.toLocaleString()}</span> paired at HS-6</span>
            <span><span className="text-ink num">{s.matched_hs5.toLocaleString()}</span> at HS-5</span>
            <span><span className="text-ink num">{s.matched_hs4.toLocaleString()}</span> at HS-4</span>
            <span><span className="text-ink num">{s.partner_only.toLocaleString()}</span> only in {many ? "partner" : `${name}'s`} records</span>
            <span><span className="text-ink num">{s.lebanon_only.toLocaleString()}</span> only in Lebanon&apos;s</span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex">
              {[["revenue", "Revenue lost"], ["all", "Every product"]].map(([k, l]) => (
                <button key={k} onClick={() => reset(setScope)(k)} aria-pressed={scope === k}
                  className={`px-3 py-2 text-[12px] num border -ml-px first:ml-0 ${
                    scope === k ? "border-gold bg-gold/10 text-gold relative z-10" : "border-rule text-slate1 hover:text-ink"
                  }`}>
                  {l}
                </button>
              ))}
            </div>
            <Select label="Chapter" value={chapter} onChange={reset(setChapter)}
              options={[["all", "All chapters"], ...chapters.map(([k, v]) => [k, `${k} · ${v}`])]} />
            <input
              value={search} onChange={(e) => reset(setSearch)(e.target.value)}
              placeholder="HS code or product…"
              className="bg-bone2 border border-rule text-ink text-[13px] px-3 py-2 num focus:outline-none focus:border-gold w-48"
            />
            <div className="ml-auto text-[11.5px] text-slate2 num">
              {rows.length} {lvl === 2 ? "chapters" : lvl === 4 ? "headings" : "codes"} · exported {money(inView.xc)} · registered {money(inView.m)} · VAT {money(inView.vat)}
            </div>
          </div>

          {/* The table */}
          <Panel>
            <div className="overflow-x-auto">
              <table className="dt">
                <thead className="sticky top-0 bg-bone z-10">
                  <tr>
                    <Th k="code" sort={sort} onSort={onSort}>Product</Th>
                    {many && <th>Partners</th>}
                    <Th k="partner" sort={sort} onSort={onSort} right>{many ? "Partners" : name} exported</Th>
                    <Th k="lebanon" sort={sort} onSort={onSort} right>Lebanon registered</Th>
                    <Th k="gap" sort={sort} onSort={onSort} right>Difference</Th>
                    <Th k="vat" sort={sort} onSort={onSort} right>VAT lost</Th>
                    <th>Reading</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((r) => {
                    const rd = READING[r.rd] || READING.normal;
                    const isOpen = open === r.key;
                    return [
                      <tr key={r.key} onClick={() => setOpen(isOpen ? null : r.key)}
                        className={`cursor-pointer ${isOpen ? "bg-bone2/60" : ""}`} aria-expanded={isOpen}>
                        <td>
                          <div className="flex items-baseline gap-2">
                            <span className="num text-[13px] text-ink">{r.code}</span>
                            {r.lvl < 6 && lvl === 6 && (
                              <span className="text-[10px] text-slate2 num" title={`Paired at HS-${r.lvl}: the two sides number it differently below this level`}>HS-{r.lvl}</span>
                            )}
                          </div>
                          <div className="text-[13px] text-ink2 leading-snug">{r.name}</div>
                        </td>
                        {many && <td className="num text-[12px] text-slate1">{[...r.partners].map((p) => avail?.partners?.[year]?.find((x) => x.code === p)?.name ?? p).join(", ")}</td>}
                        <td className="text-right num">{r.xc ? money(r.xc) : <span className="text-slate2">—</span>}</td>
                        <td className="text-right num">{r.m ? money(r.m) : <span className="text-slate2">—</span>}</td>
                        <td className={`text-right num ${r.g > 0 ? "text-burgundy" : "text-slate1"}`}>{money(r.g)}</td>
                        <td className="text-right num text-gold">{r.vat ? money(r.vat) : <span className="text-slate2">—</span>}</td>
                        <td><Chip tone={rd.tone}>{rd.label}</Chip></td>
                      </tr>,
                      isOpen && (
                        <tr key={`${r.key}-detail`} className="bg-bone2/40">
                          <td colSpan={many ? 7 : 6} className="!pt-2 !pb-5">
                            <Detail r={r} name={name} rate={rate} cif={avail?.meta?.cif_factor ?? 1.05} level={lvl} />
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={many ? 7 : 6} className="text-slate1">Nothing matches this filter.</td></tr>
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
            Exported = the partner&apos;s own export declaration, raised ×{avail?.meta?.cif_factor ?? 1.05} to put it on
            Lebanon&apos;s CIF footing. Difference = exported − registered; positive means Lebanon registered less.
            VAT lost = {Math.round(rate * 100)}% of the difference, counted only where the reading is under-declared,
            largely unrecorded, or not registered at all. Click a row for the working. Chapter and HS-4 figures
            are the HS-6 lines summed and then read, the same way the ledger reads a corridor.
          </p>
        </>
      )}
    </div>
  );
}

function Th({ k, sort, onSort, right, children }) {
  const active = sort.key === k;
  return (
    <th className={right ? "!text-right" : ""}>
      <button onClick={() => onSort(k)}
        className={`num text-[10.5px] tracking-[0.12em] uppercase transition-colors ${active ? "text-gold" : "hover:text-ink"}`}
        title="Sort by this column">
        {children}{active ? (sort.dir > 0 ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}

/** The working behind one row, in the order a challenge would come. */
function Detail({ r, name, rate, cif, level }) {
  const loss = LOSS_BY_KEY[r.rd];
  const editions = [...r.editions];
  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-10 gap-y-4 text-[12.5px] leading-relaxed">
      <dl className="grid grid-cols-[150px_1fr] gap-y-1.5">
        <dt className="eyebrow text-[10px] pt-0.5">{name} FOB</dt><dd className="num text-ink">{money(r.x)}</dd>
        <dt className="eyebrow text-[10px] pt-0.5">× {cif} CIF</dt><dd className="num text-ink">{money(r.xc)}</dd>
        <dt className="eyebrow text-[10px] pt-0.5">Lebanon CIF</dt><dd className="num text-ink">{money(r.m)}</dd>
        <dt className="eyebrow text-[10px] pt-0.5">Cover</dt><dd className="num text-ink">{r.cv == null ? "—" : `${Math.round(r.cv * 100)}%`} <span className="text-slate2">of the partner figure</span></dd>
        <dt className="eyebrow text-[10px] pt-0.5">VAT lost</dt><dd className="num text-gold">{r.vat ? `${money(r.vat)}` : "—"} <span className="text-slate2">= difference × {Math.round(rate * 100)}%</span></dd>
        <dt className="eyebrow text-[10px] pt-0.5">Duty (indicative)</dt><dd className="num text-ink">{r.duty ? money(r.duty) : "—"} <span className="text-slate2">flat band, verify against the tariff</span></dd>
        {level < 6 && <><dt className="eyebrow text-[10px] pt-0.5">Made of</dt><dd className="num text-ink">{r.lines} HS-6 line{r.lines === 1 ? "" : "s"}</dd></>}
        {editions.length > 0 && <><dt className="eyebrow text-[10px] pt-0.5">HS editions</dt><dd className="num text-ink">{editions.join(", ")} <span className="text-slate2">Lebanon / partner</span></dd></>}
      </dl>
      <div className="text-ink2 space-y-2">
        {loss ? (
          <>
            <p><span className="text-ink">{loss.label}.</span> {loss.what}</p>
            <p className="text-slate1"><span className="text-ink2">What to do:</span> {loss.remedy}</p>
          </>
        ) : r.rd === "not_in_lebanon" ? (
          <p><span className="text-ink">Not registered.</span> {name} reports exporting this and Lebanon has no import line for it at any level of the code. Check transit, re-export and the origin recorded at the port before treating it as revenue.</p>
        ) : r.rd === "not_in_partner" ? (
          <p><span className="text-ink">Only in Lebanon&apos;s books.</span> Lebanon registered this as coming from {name}; {name} reports no such export. Usually origin-versus-shipment: the goods came via a third country.</p>
        ) : (
          <p><span className="text-ink">Matches.</span> The two declarations agree within ordinary freight, timing and valuation differences. Nothing to open here.</p>
        )}
      </div>
    </div>
  );
}
