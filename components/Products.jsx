"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { LOSS_BY_KEY, REVENUE_READINGS, classifyCover } from "@/lib/losses";
import { Bar, Button, Chip, Icon, Input, Panel, Segmented, Select, Skeleton, Tile } from "@/components/ui";

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
  exempt: { label: "Exempt regime", tone: "neutral" },
  structural: { label: "Set aside · one-sided", tone: "sea" },
};

// How the partner's figure was built. Lebanon books by origin, so re-exports
// through the partner are not a gap; only some partners let us remove them.
const BASIS = {
  domestic: { label: "domestic exports", title: "The partner publishes domestic exports separately from re-exports; only goods of its own origin are compared — which is how Lebanon books them" },
  total_less_reexports: { label: "exports less re-exports", title: "The partner publishes re-exports; they are taken off its total, code by code" },
  total: { label: "total exports · no re-export split published", title: "The partner does not separate re-exports, so goods it merely shipped on may show as a gap" },
  mixed: { label: "per partner", title: "Each partner uses the best basis it publishes" },
};

const BAR_TONE = {
  under_invoicing: "burgundy", value_gap: "sea", not_in_lebanon: "sea",
  over_invoicing: "slate", normal: "cedar", not_in_partner: "slate", exempt: "slate", structural: "sea",
};

// How the partner's HS-2022 code was placed on Lebanon's HS 2017.
const MAP = {
  same: null,
  recoded: { label: "Recoded", title: "Renumbered between HS 2017 and HS 2022 — converted with the official UNSD table" },
  merged: { label: "Merged", title: "Several HS 2022 codes pool into this HS 2017 code — summed" },
  split: { label: "Split", title: "This HS 2022 code can sit under more than one HS 2017 code — the UNSD convention was applied" },
  unmapped: { label: "Unmapped", title: "Not in the UNSD table — compared on the code as reported" },
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
    const own = r.rd === "exempt" || r.rd === "structural" ? r.rd : null;
    // An exempt or set-aside heading never dissolves into its chapter: it would count there.
    const code = own && level < 6 ? r.hs4 : level === 2 ? r.hs2 : level === 4 ? r.hs4 : r.hs6;
    const key = own && level < 6 ? `${r.hs4}·${own}` : code;
    const cur = map.get(key) || {
      key, code, hs2: r.hs2, hs4: r.hs4, own,
      name: (r.ch || (r.hs2 === "99" ? "Unclassified — confidential or unallocated" : `Chapter ${r.hs2}`)) + (own && level < 6 ? (own === "exempt" ? " — exempt regime" : " — set aside") : ""),
      x: 0, xc: 0, m: 0, duty: 0, lines: 0, mapped: 0, rx: 0, lwBy: new Map(),
      partners: new Set(), editions: new Set(), maps: new Set(), pcs: new Set(),
    };
    cur.x += r.x; cur.xc += r.xc; cur.m += r.m; cur.lines += 1;
    if (r.rx) cur.rx += r.rx;
    if (r.sx) cur.sx = r.sx;
    cur.lwBy.set(r.hs4, r.lw ?? 0);
    cur.partners.add(r.p);
    if (r.lv || r.pv) cur.editions.add(`${r.lv ?? "·"}/${r.pv ?? "·"}`);
    if (r.map && r.map !== "same") { cur.mapped += 1; cur.maps.add(r.map); }
    if (r.pc && r.pc !== r.hs6) cur.pcs.add(r.pc);
    if (r.g > 0) cur.duty += r.duty;
    map.set(key, cur);
  }
  const out = [];
  for (const c of map.values()) {
    c.g = c.xc - c.m;
    c.cv = c.xc ? c.m / c.xc : null;
    c.rd = c.own || classifyCover(c.xc, c.m);
    c.lw = [...c.lwBy.values()].reduce((a, b) => a + b, 0);
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

  // The chapter view of the same lines. A heading that gaps while its chapter
  // balances is the two customs services coding the same goods differently —
  // the tag says so, and the conservative figure nets within chapter first.
  const byChapter = useMemo(() => {
    const m = new Map();
    (data ? rollup(data.rows, 2, rate) : []).forEach((c) => m.set(c.hs2, c));
    return m;
  }, [data, rate]);
  const conservative = useMemo(() => {
    let short = 0, vat = 0;
    byChapter.forEach((c) => { if (c.vat > 0) { short += c.g; vat += c.vat; } });
    return { short, vat };
  }, [byChapter]);
  const chapterBalances = (r) => lvl !== 2 && r.g > 0 && REVENUE_READINGS.has(r.rd) && (byChapter.get(r.hs2)?.g ?? 1) <= 0;
  // Lebanon books less of this heading from the whole world than this partner
  // alone says it sent: the goods are not in Lebanon's records under any origin.
  const absent = (r) => r.g > 0 && REVENUE_READINGS.has(r.rd) && r.lw < 0.85 * r.xc;
  const basis = BASIS[data?.basis] || null;

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
          <Segmented label="Product level" value={level} onChange={reset(setLevel)} options={LEVELS} />
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11.5px] text-slate2 num">
          {fetchedAt && <span className="hidden sm:inline">as of {fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          <Button variant="ghost" icon="refresh" onClick={load} disabled={loading} title="Ask the data source again">
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && <div className="border border-burgundy/40 bg-burgundy/5 p-4 text-sm text-burgundy mb-6">{error}</div>}
      {loading && !data && (
        <div aria-busy="true" aria-label="Loading the mirror">
          <Skeleton className="h-6 w-3/4 mb-3" /><Skeleton className="h-6 w-1/2 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px]" />)}
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 mb-2" />)}
        </div>
      )}

      {s && (
        <>
          {/* The sentence */}
          <p className="text-[15.5px] md:text-[17px] text-ink2 leading-relaxed max-w-4xl mb-6">
            In {data.year}, <span className="text-ink">{many ? `${data.partners.length} partners` : name}</span>{" "}
            {many ? "say they" : "says it"} exported <span className="num text-ink">{money(s.x_cif)}</span> to Lebanon.
            Lebanon registered <span className="num text-ink">{money(s.m)}</span>,{" "}
            <span className={`num ${s.gap > 0 ? "text-burgundy" : "text-ink"}`}>{money(Math.abs(s.gap))}</span>{" "}
            {s.gap > 0 ? "less" : "more"} in total{s.structural?.value > 0 && (
              <> — after setting aside <span className="num text-sea">{money(s.structural.value)}</span> in one-sided {s.structural.headings.map((h) => `HS ${h.hs4}`).join(", ")}</>
            )}.
            {s.gap <= 0 && " But "}{s.gap > 0 && " "}
            {s.gap <= 0 ? "on" : "On"} <span className="num text-ink">{s.revenue_lines.toLocaleString()}</span> products Lebanon
            registered <span className="num text-burgundy">{money(s.shortfall)}</span> less than {many ? "the partners" : name} reported,
            and the VAT not collected on those is <span className="num text-gold">{money(s.vat_lost)}</span>.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
            <Tile label={`${many ? "Partners" : name} exported`} value={money(s.x_cif)} sub={`${money(s.x_fob)} FOB, CIF-adjusted ×${avail?.meta?.cif_factor ?? 1.05}`} />
            <Tile label="Lebanon registered" value={money(s.m)} sub={`${s.cover == null ? "—" : `${Math.round(s.cover * 100)}% of the partner figure`}${s.structural?.value ? ` · ${money(s.structural.value)} set aside` : ""}`} />
            <Tile label="Difference in total" value={money(s.gap)} tone={s.gap > 0 ? "burgundy" : "ink"} sub={s.gap > 0 ? "Lebanon registered less overall" : "Lebanon registered more overall"} />
            <Tile label="VAT not collected" value={money(s.vat_lost)} tone="gold" sub={`${Math.round(rate * 100)}% of ${money(s.shortfall)} short on ${s.revenue_lines.toLocaleString()} products · netted within chapter: ${money(conservative.vat)}`} />
          </div>

          {/* One-sided headings that would dominate the corridor, set aside and said out loud. */}
          {s.structural?.headings?.length > 0 && (
            <div className="rounded-lg border border-sea/40 bg-sea/5 border-l-[3px] border-l-sea px-4 py-3.5 mb-6 flex gap-3">
              <Icon name="info" className="w-4 h-4 text-sea mt-0.5" />
              <div className="text-[13px] text-ink2 leading-relaxed">
                <span className="text-ink">Set aside from this analysis.</span>{" "}
                {s.structural.headings.map((h) => (
                  <span key={h.hs4}>
                    HS {h.hs4} {h.ch}: <span className="num text-ink">{money(h.m || h.x)}</span>, {Math.round(h.share * 100)}% of everything{" "}
                    {h.m > h.x ? `Lebanon registers from ${name}, and absent from ${name}'s own-origin exports` : `${name} reports sending, and absent from Lebanon's records`}.{" "}
                    {h.m > h.x && h.rx > 0.5 * h.m
                      ? <>{name} re-exported <span className="num text-ink">{money(h.rx)}</span> of it — goods of another origin passing through, which Lebanon booked as {name}-origin.{" "}</>
                      : h.m > h.x
                        ? <>{name} does not report this trade by destination.{" "}</>
                        : <>Lebanon has no record of it under any origin.{" "}</>}
                  </span>
                ))}
                A heading that large on one side only is a reporting-practice question, not a customs gap. It is counted in neither the figures above nor the VAT, and it is listed under &quot;Every product&quot; with a set-aside tag.
              </div>
            </div>
          )}

          {/* How to read the two figures — the part people trip on. */}
          <details className="group rounded-lg border border-rule bg-bone/70 mb-6 open:bg-bone open:shadow-card transition-colors">
            <summary className="flex items-center gap-2.5 px-4 h-11 cursor-pointer list-none text-[13px] text-ink2 hover:text-ink select-none">
              <Icon name="info" className="w-4 h-4 text-gold" />
              <span>How to read these figures — why the total and the VAT can point in different directions</span>
              <Icon name="chevronDown" className="w-4 h-4 ml-auto text-slate2 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 pt-1 text-[12.5px] text-ink2 leading-relaxed grid md:grid-cols-3 gap-x-8 gap-y-3">
              <p><span className="text-ink">Total difference</span> is a net: products where Lebanon registered less, minus products where it registered more. VAT is charged declaration by declaration, so registering more on one product never refunds the VAT missed on another. <span className="text-ink">VAT not collected</span> counts only the products where Lebanon registered less — {s.revenue_lines.toLocaleString()} of them here, {money(s.shortfall)} short.</p>
              <p><span className="text-ink">Same goods, different code.</span> Both sides are put on HS 2017 with the official UNSD table before pairing, so edition changes are handled. What the table cannot fix is practice: one customs service files a product under one heading, the other under a neighbour (medicaments 3004 vs immunologicals 3002). When a chapter balances but its headings gap in opposite directions, the line is tagged <Chip tone="neutral">chapter balances</Chip> and should be read as coding, not revenue.</p>
              <p><span className="text-ink">Two figures, deliberately.</span> Line by line: <span className="num text-gold">{money(s.vat_lost)}</span>. Netted within each chapter first: <span className="num text-gold">{money(conservative.vat)}</span> on {money(conservative.short)} short. The truth sits between them; the first is what a declaration-level audit would test, the second is what survives every classification argument. Switch to the <span className="text-ink">Chapter</span> level to see the netted view directly.</p>
            </div>
          </details>

          {/* Match quality — the honesty strip */}
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[11.5px] text-slate1 mb-6">
            <span><span className="text-ink num">{s.lines.toLocaleString()}</span> product lines</span>
            <span><span className="text-ink num">{s.matched.toLocaleString()}</span> paired on HS 2017</span>
            {basis && <span title={basis.title}>partner figure: <span className="text-ink">{basis.label}</span>{s.rx > 0 && <span className="text-slate2"> · {money(s.rx)} re-exports set aside</span>}</span>}
            <span title="Partner codes renumbered between HS editions, converted with the official UNSD table"><span className="text-ink num">{(s.by_map?.recoded ?? 0) + (s.by_map?.merged ?? 0)}</span> recoded by the HS table</span>
            <span title="Partner codes that could sit under more than one HS 2017 code"><span className="text-ink num">{s.by_map?.split ?? 0}</span> split</span>
            {(s.by_map?.unmapped ?? 0) > 0 && <span><span className="text-burgundy num">{s.by_map.unmapped}</span> unmapped</span>}
            <span><span className="text-ink num">{s.partner_only.toLocaleString()}</span> only in {many ? "partner" : `${name}'s`} records</span>
            <span><span className="text-ink num">{s.lebanon_only.toLocaleString()}</span> only in Lebanon&apos;s</span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Segmented label="Scope" value={scope} onChange={reset(setScope)}
              options={[["revenue", "Revenue lost"], ["all", "Every product"]]} />
            <Select label="Chapter" value={chapter} onChange={reset(setChapter)}
              options={[["all", "All chapters"], ...chapters.map(([k, v]) => [k, `${k} · ${v}`])]} />
            <Input value={search} onChange={reset(setSearch)} placeholder="HS code or product…" className="w-52" />
            <div className="ml-auto text-[11.5px] text-slate2 num">
              {rows.length} {lvl === 2 ? "chapters" : lvl === 4 ? "headings" : "codes"} · exported {money(inView.xc)} · registered {money(inView.m)} · VAT {money(inView.vat)}
            </div>
          </div>

          {/* The table */}
          <Panel>
            <div className="overflow-x-auto">
              <table className="dt">
                <thead>
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
                        className={`cursor-pointer ${isOpen ? "[&>td]:bg-gold/5 [&>td:first-child]:shadow-[inset_3px_0_0_#8a6714]" : ""}`} aria-expanded={isOpen}>
                        <td>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="num text-[13px] text-ink">{r.code}</span>
                            {lvl === 6 && [...r.maps].map((k) => MAP[k] && (
                              <span key={k} className="text-[10px] uppercase tracking-wider num text-slate2 border border-rule rounded px-1" title={MAP[k].title}>{MAP[k].label}</span>
                            ))}
                            {lvl < 6 && r.mapped > 0 && (
                              <span className="text-[10px] uppercase tracking-wider num text-slate2 border border-rule rounded px-1" title={`${r.mapped} of ${r.lines} lines were recoded between HS editions with the official table`}>{r.mapped} recoded</span>
                            )}
                            {r.rd === "structural" && (
                              <span className="text-[10px] uppercase tracking-wider num text-sea border border-sea/40 rounded px-1" title={`${Math.round((r.sx ?? 0) * 100)}% of this corridor sits in this one heading, on one side only — a reporting-practice question, not a customs gap. Counted in no total.`}>set aside · {Math.round((r.sx ?? 0) * 100)}% of corridor</span>
                            )}
                            {r.rd === "exempt" && (
                              <span className="text-[10px] uppercase tracking-wider num text-slate2 border border-rule rounded px-1" title="Enters under an exemption regime (military, aircraft): no VAT is booked on entry, so this gap is not revenue">exempt regime</span>
                            )}
                            {absent(r) && (
                              <span className="text-[10px] uppercase tracking-wider num text-burgundy border border-burgundy/40 rounded px-1" title={`Lebanon registers ${money(r.lw)} of this heading from every origin combined — less than ${name} alone says it sent. The goods are not in Lebanon's books under any origin.`}>absent from all origins</span>
                            )}
                            {chapterBalances(r) && (
                              <span className="text-[10px] uppercase tracking-wider num text-cedar border border-cedar/40 rounded px-1" title="This chapter balances overall — the gap here is offset by a neighbouring heading. Read as a coding difference, not revenue.">chapter balances</span>
                            )}
                          </div>
                          <div className="text-[13px] text-ink2 leading-snug">{r.name}</div>
                        </td>
                        {many && <td className="num text-[12px] text-slate1">{[...r.partners].map((p) => avail?.partners?.[year]?.find((x) => x.code === p)?.name ?? p).join(", ")}</td>}
                        <td className="text-right num">{r.xc ? money(r.xc) : <span className="text-slate2">—</span>}</td>
                        <td className="text-right num">
                          {r.m ? money(r.m) : <span className="text-slate2">—</span>}
                          <Bar value={r.cv ?? 0} tone={BAR_TONE[r.rd] || "slate"} className="!w-20 ml-auto mt-1.5"
                            title={r.cv == null ? "" : `${Math.round(r.cv * 100)}% of the partner figure`} />
                        </td>
                        <td className={`text-right num ${r.g > 0 ? "text-burgundy" : "text-slate1"}`}>{money(r.g)}</td>
                        <td className="text-right num text-gold">{r.vat ? money(r.vat) : <span className="text-slate2">—</span>}</td>
                        <td><Chip tone={rd.tone}>{rd.label}</Chip></td>
                      </tr>,
                      isOpen && (
                        <tr key={`${r.key}-detail`} className="[&>td]:bg-bone2/50 [&>td]:shadow-[inset_3px_0_0_#8a6714]">
                          <td colSpan={many ? 7 : 6} className="!pt-3 !pb-5">
                            <Detail r={r} name={name} rate={rate} cif={avail?.meta?.cif_factor ?? 1.05} level={lvl} chapter={byChapter.get(r.hs2)} balances={chapterBalances(r)} absent={absent(r)} />
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
                <Button variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
                  Show {Math.min(PAGE, rows.length - limit)} more
                </Button>
                <span className="text-[11px] text-slate2 num">{rows.length - limit} remaining</span>
                <Button variant="quiet" onClick={() => setLimit(rows.length)} className="ml-auto">
                  Show all
                </Button>
              </div>
            )}
          </Panel>

          <p className="text-[11.5px] text-slate2 leading-relaxed mt-4 max-w-3xl">
            Exported = the partner&apos;s own export declaration, raised ×{avail?.meta?.cif_factor ?? 1.05} to put it on
            Lebanon&apos;s CIF footing. Difference = exported − registered; positive means Lebanon registered less.
            VAT lost = {Math.round(rate * 100)}% of the difference, counted only where the reading is under-declared,
            largely unrecorded, or not registered at all. Partner codes (HS 2022) are converted to Lebanon&apos;s
            HS 2017 with the official UNSD table before pairing; nothing is paired by prefix. Click a row for the
            working, including the code the partner actually reported. Chapter and HS-4 figures are the HS-6
            lines summed and then read, the same way the ledger reads a corridor.
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
function Detail({ r, name, rate, cif, level, chapter, balances, absent }) {
  const loss = LOSS_BY_KEY[r.rd];
  const editions = [...r.editions];
  const maps = [...r.maps];
  const pcs = [...r.pcs];
  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-10 gap-y-4 text-[12.5px] leading-relaxed">
      <dl className="grid grid-cols-[150px_1fr] gap-y-1.5">
        <dt className="eyebrow text-[10px] pt-0.5">{name} FOB</dt><dd className="num text-ink">{money(r.x)}</dd>
        <dt className="eyebrow text-[10px] pt-0.5">× {cif} CIF</dt><dd className="num text-ink">{money(r.xc)}</dd>
        <dt className="eyebrow text-[10px] pt-0.5">Lebanon CIF</dt><dd className="num text-ink">{money(r.m)}</dd>
        <dt className="eyebrow text-[10px] pt-0.5">Cover</dt><dd className="num text-ink">{r.cv == null ? "—" : `${Math.round(r.cv * 100)}%`} <span className="text-slate2">of the partner figure</span></dd>
        <dt className="eyebrow text-[10px] pt-0.5">VAT lost</dt><dd className="num text-gold">{r.vat ? `${money(r.vat)}` : "—"} <span className="text-slate2">= difference × {Math.round(rate * 100)}%</span></dd>
        <dt className="eyebrow text-[10px] pt-0.5">Duty (indicative)</dt><dd className="num text-ink">{r.duty ? money(r.duty) : "—"} <span className="text-slate2">flat band, verify against the tariff</span></dd>
        {level < 6 && <><dt className="eyebrow text-[10px] pt-0.5">Made of</dt><dd className="num text-ink">{r.lines} HS-6 line{r.lines === 1 ? "" : "s"}{r.mapped > 0 && <span className="text-slate2"> · {r.mapped} recoded between editions</span>}</dd></>}
        {editions.length > 0 && <><dt className="eyebrow text-[10px] pt-0.5">HS editions</dt><dd className="num text-ink">{editions.join(", ")} <span className="text-slate2">Lebanon / partner</span></dd></>}
        {level === 6 && (
          <><dt className="eyebrow text-[10px] pt-0.5">{name} reported as</dt>
          <dd className="num text-ink">{pcs.length ? pcs.join(", ") : r.code}{" "}
            <span className="text-slate2">{maps.length ? `— ${maps.map((k) => MAP[k]?.title ?? k).join("; ")}` : "— same code in both HS editions"}</span></dd></>
        )}
        {chapter && level !== 2 && (
          <><dt className="eyebrow text-[10px] pt-0.5">Chapter {r.hs2}</dt>
          <dd className="num text-ink">{money(chapter.xc)} exported · {money(chapter.m)} registered{" "}
            <span className={balances ? "text-cedar" : "text-slate2"}>{balances ? "— balances: this gap is offset within the chapter, read as a coding difference" : chapter.g > 0 ? "— the chapter as a whole is also short" : ""}</span></dd></>
        )}
        {r.rx > 0 && (
          <><dt className="eyebrow text-[10px] pt-0.5">Re-exported via {name}</dt>
          <dd className="num text-ink">{money(r.rx)} <span className="text-slate2">— goods of another origin shipped on; Lebanon books them under that origin, so they are set aside</span></dd></>
        )}
        {r.xc > 0 && (
          <><dt className="eyebrow text-[10px] pt-0.5">All origins{level === 6 ? `, heading ${r.hs4}` : ""}</dt>
          <dd className="num text-ink">{money(r.lw)} registered from every origin{" "}
            <span className={absent ? "text-burgundy" : "text-slate2"}>
              {absent ? `— less than ${name} alone says it sent: not in Lebanon's books under any origin`
                : r.g > 0 && REVENUE_READINGS.has(r.rd) ? "— Lebanon does book this much from other origins; the gap may be attribution" : ""}
            </span></dd></>
        )}
      </dl>
      <div className="text-ink2 space-y-2">
        {loss ? (
          <>
            <p><span className="text-ink">{loss.label}.</span> {loss.what}</p>
            <p className="text-slate1"><span className="text-ink2">What to do:</span> {loss.remedy}</p>
          </>
        ) : r.rd === "structural" ? (
          <p className="text-[13px] text-ink2 leading-relaxed"><span className="text-ink">Set aside.</span> This one heading is {Math.round((r.sx ?? 0) * 100)}% of everything on its side of the corridor and appears on that side only. A gap of that shape is a reporting-practice question — one customs service does not report this trade by destination — not a customs gap. It is counted in neither the totals above nor the VAT.</p>
        ) : r.rd === "exempt" ? (
          <p className="text-[13px] text-ink2 leading-relaxed"><span className="text-ink">Exempt regime.</span> Military equipment and aircraft enter under exemptions: {name} reports the export, Lebanese customs books no VAT on the entry. The gap is shown for completeness and carries no revenue.</p>
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
