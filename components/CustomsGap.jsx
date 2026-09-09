"use client";

import { useMemo, useState } from "react";
import Products from "@/components/Products";
import Analytics from "@/components/Analytics";
import GapForensics from "@/components/GapForensics";
import TradeDetective from "@/components/TradeDetective";
import Method from "@/components/Method";
import { sliceFor } from "@/lib/slice";
import { Icon, Segmented } from "@/components/ui";

// Products leads: one partner, one year, every product — exported, registered,
// difference, VAT. Analytics gives the shape; the ledger is the audit surface
// behind both. Any row on those screens opens the product view for that
// partner and heading, which is what "focus" carries.
const TABS = [
  ["products", "Products", "package"],
  ["analytics", "Analytics", "chart"],
  ["ledger", "Ledger", "table"],
  ["detective", "Detective", "search"],
  ["method", "Method", "book"],
];

export default function CustomsGap({ gaps, stamp }) {
  const { meta, corridors } = gaps;
  const years = meta.years || [];
  const [tab, setTab] = useState("products");
  const [year, setYear] = useState(String(meta.base_year ?? years[years.length - 1]));
  const [focus, setFocus] = useState(null);

  // One year (or both) of the corridor file, shaped for the tabs. The same
  // function builds the Detective's grounding on the server.
  const slice = useMemo(() => sliceFor(gaps, year), [gaps, year]);

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
      <header className="mb-8 grid lg:grid-cols-[minmax(0,1fr)_380px] gap-x-12 gap-y-4 items-end fade-in">
        <div>
          <div className="eyebrow text-cedar mb-2.5">
            Trade-mirror forensics · Lebanon · {years.join(" & ")}
          </div>
          <h1 className="display text-[32px] md:text-[40px] leading-[1.05] tracking-tightest text-ink">
            What customs is not collecting
          </h1>
        </div>
        <p className="text-[13.5px] text-slate1 leading-relaxed lg:text-right">
          What exporting countries say they sent to Lebanon, against what Lebanon registered.
          The difference is revenue not collected.
        </p>
      </header>

      {/* Sections. The selected one is filled gold; the rest wait quietly. */}
      <nav aria-label="Sections" className="mb-8 -mx-5 px-5 lg:mx-0 lg:px-0 overflow-x-auto">
        <div role="tablist" className="inline-flex gap-1 p-1 rounded-xl bg-bone2 border border-rule">
          {TABS.map(([key, label, icon]) => {
            const on = tab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2.5 h-11 px-4 md:px-5 rounded-lg text-[14px] md:text-[15px] font-medium tracking-wide cursor-pointer whitespace-nowrap transition-colors duration-150 ${
                  on
                    ? "bg-gold text-white shadow-sm"
                    : "text-slate1 hover:text-ink hover:bg-bone"
                }`}
              >
                <Icon name={icon} className="w-[18px] h-[18px]" />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {tab === "products" && <Products defaultYear={productYear} focus={focus} vatRate={meta.vat_rate} />}
      {tab === "analytics" && (
        <Analytics data={slice} year={year} onOpenProducts={openProducts} onOpenLedger={() => setTab("ledger")} yearControl={yearControl} />
      )}
      {tab === "ledger" && <GapForensics data={slice} year={year} onOpenProducts={openProducts} yearControl={yearControl} />}
      {tab === "detective" && <TradeDetective data={slice} year={year} yearControl={yearControl} />}
      {tab === "method" && <Method meta={meta} stamp={stamp} />}
    </div>
  );
}
