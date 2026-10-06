"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Products from "@/components/Products";
import Analytics from "@/components/Analytics";
import GapForensics from "@/components/GapForensics";
import TradeDetective from "@/components/TradeDetective";
import Method from "@/components/Method";
import Worklist from "@/components/Worklist";
import LiveData from "@/components/LiveData";
import { sliceFor } from "@/lib/slice";
import { FEATURES } from "@/lib/features";
import { Icon, Segmented, Skeleton } from "@/components/ui";

// Products leads: one partner, one year, every product — exported, registered,
// difference, VAT. Analytics gives the shape; the ledger is the audit surface
// behind both. Any row on those screens opens the product view for that
// partner and heading, which is what "focus" carries.
// The Detective stays available behind a flag: NEXT_PUBLIC_DETECTIVE=off hides it.
const DETECTIVE = process.env.NEXT_PUBLIC_DETECTIVE !== "off";
const TABS = [
  ["analytics", "Corridors", "chart", "Shape of the shortfall by band"],
  ["products", "Products", "package", "Every product, partner by partner"],
  // Evidence and Method are switched off for now (lib/features.js, REWIRE.md).
  ...(FEATURES.evidenceTab ? [["ledger", "Evidence", "table", "Every corridor, unranked and complete"]] : []),
  ...(DETECTIVE ? [["detective", "Detective", "search", "Ask about the flagged corridors"]] : []),
  ...(FEATURES.methodTab ? [["method", "Method", "book", "How the figures are built and checked"]] : []),
  ["worklist", "Worklist", "tasks", "Open these first, tracked to close"],
  ["live", "Live data", "globe", "Retrieve partner data on demand"],
];

// Tailwind needs the class names written out, so the grid width is looked up.
const TAB_COLS = { 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6", 7: "lg:grid-cols-7" };

export default function CustomsGap({ gaps, stamp }) {
  const { meta } = gaps;
  const years = meta.years || [];
  const totalCorridors = years.reduce((s, y) => s + (gaps.years?.[y]?.corridors ?? 0), 0);
  const partnerCount = meta.comparable_partners?.length ?? 0;
  const [tab, setTab] = useState("products");
  const [year, setYear] = useState(String(meta.base_year ?? years[years.length - 1]));
  const [focus, setFocus] = useState(null);

  // The corridor rows come from /api/corridors, one year at a time, and are
  // kept once fetched so switching back is instant. The page HTML carries only
  // meta and the per-year summaries.
  const [corridors, setCorridors] = useState(null);
  const cache = useRef(new Map());
  useEffect(() => {
    const key = String(year);
    if (cache.current.has(key)) { setCorridors(cache.current.get(key)); return; }
    let live = true;
    setCorridors(null);
    fetch(`/api/corridors?year=${key}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { cache.current.set(key, d.corridors || []); if (live) setCorridors(d.corridors || []); })
      .catch(() => { if (live) setCorridors([]); });
    return () => { live = false; };
  }, [year]);
  const loadingCorridors = corridors === null;

  // One year (or both) of the corridor file, shaped for the tabs. The same
  // function builds the Detective's grounding on the server.
  const slice = useMemo(() => sliceFor({ ...gaps, corridors: corridors || [] }, year), [gaps, corridors, year]);

  const productYear = year === "all" ? meta.base_year : Number(year);

  // Products has its own year selector; the other tabs share this one.
  const yearControl = (
    <Segmented size="sm" label="Year" value={year} onChange={setYear}
      options={[...years.map((y) => [String(y), String(y)]), ["all", "Both"]]} />
  );

  // Open the product view on a partner, chapter or heading another screen pointed at.
  const openProducts = (f = {}) => {
    setFocus({ year: productYear, ...f, at: Date.now() });
    setTab("products");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="max-w-[1400px] mx-auto px-5 lg:px-10 py-8">
      <header className="mb-10 text-center fade-in">
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="hidden sm:inline-block w-8 h-[3px] rounded-full bg-gradient-to-r from-transparent to-gold" aria-hidden="true" />
          <div className="eyebrow text-gold">
            Trade-mirror forensics · Macro intelligence
          </div>
          <span className="hidden sm:inline-block w-8 h-[3px] rounded-full bg-gradient-to-l from-transparent to-gold" aria-hidden="true" />
        </div>
        <h1 className="display text-[34px] md:text-[46px] leading-[1.05] tracking-tightest text-gold2 mb-3">
          What customs is not collecting
        </h1>
        <div className="eyebrow text-slate2 mb-4">
          {totalCorridors.toLocaleString()} corridors examined · Lebanon · {years.join("–")} · {partnerCount} partners mirrored
        </div>
        <p className="text-[13.5px] text-slate1 leading-relaxed max-w-2xl mx-auto">
          What exporting countries say they sent to Lebanon, against what Lebanon registered.
          The difference is revenue not collected.
        </p>
      </header>

      {/* Sections, as a card grid: an icon, the name, and what it is for —
          the selected one lifts with a gold edge; the rest wait quietly. */}
      <nav aria-label="Sections" className="mb-10">
        <div role="tablist" className={`grid grid-cols-2 sm:grid-cols-3 ${TAB_COLS[TABS.length] || "lg:grid-cols-7"} gap-3 md:gap-4`}>
          {TABS.map(([key, label, icon, blurb]) => {
            const on = tab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(key)}
                className={`group flex flex-col items-center text-center gap-2 rounded-2xl border bg-bone px-4 py-6 cursor-pointer transition-all duration-200 ${
                  on
                    ? "border-gold border-b-[3px] shadow-md bg-gold/5"
                    : "border-rule shadow-sm hover:shadow-md hover:border-slate2 hover:-translate-y-0.5"
                }`}
              >
                <Icon name={icon} className={`w-7 h-7 transition-colors duration-200 ${on ? "text-gold" : "text-slate1 group-hover:text-ink"}`} strokeWidth={1.6} />
                <div className={`text-[13px] font-semibold tracking-wide ${on ? "text-ink" : "text-ink2"}`}>{label}</div>
                <div className="text-[10.5px] text-slate2 leading-snug">{blurb}</div>
              </button>
            );
          })}
        </div>
      </nav>

      {tab === "worklist" && <Worklist year={year} yearControl={yearControl} onOpenProducts={openProducts} />}
      {tab === "products" && <Products defaultYear={productYear} focus={focus} vatRate={meta.vat_rate} />}
      {!["products", "method", "worklist", "live"].includes(tab) && loadingCorridors && (
        <div aria-busy="true" aria-label="Loading corridors">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4 mb-8">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[92px]" />)}
          </div>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-12 mb-2" />)}
        </div>
      )}
      {tab === "analytics" && !loadingCorridors && (
        <Analytics data={slice} year={year} onOpenProducts={openProducts} yearControl={yearControl} />
      )}
      {FEATURES.evidenceTab && tab === "ledger" && !loadingCorridors && <GapForensics data={slice} year={year} onOpenProducts={openProducts} yearControl={yearControl} />}
      {tab === "detective" && !loadingCorridors && <TradeDetective data={slice} year={year} yearControl={yearControl} />}
      {FEATURES.methodTab && tab === "method" && <Method meta={meta} stamp={stamp} />}
      {tab === "live" && <LiveData />}
    </div>
  );
}
