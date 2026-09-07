"use client";

import { useMemo, useState } from "react";
import Overview from "@/components/Overview";
import Analytics from "@/components/Analytics";
import PartnerMirror from "@/components/PartnerMirror";
import GapForensics from "@/components/GapForensics";
import TradeDetective from "@/components/TradeDetective";
import Method from "@/components/Method";
import { money } from "@/lib/format";
import { summary } from "@/lib/losses";

// Overview leads: what is being lost and of what kind. Triage answers what to
// open first. The ledger is the audit surface behind both.
const TABS = [
  ["overview", "Overview"],
  ["analytics", "Analytics"],
  ["mirror", "Partner mirror"],
  ["ledger", "Ledger"],
  ["detective", "Detective"],
  ["method", "Method"],
];

export default function CustomsGap({ gaps }) {
  const { meta, corridors } = gaps;
  const years = meta.years || [];
  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState(String(meta.base_year ?? years[years.length - 1]));

  const scope = useMemo(
    () => (year === "all" ? corridors : corridors.filter((c) => c.year === Number(year))),
    [corridors, year]
  );

  // The older components each take a single-year-shaped object. Building it here
  // keeps the year switch in one place instead of threading it through all of them.
  const slice = useMemo(() => {
    const s = summary(scope);
    const partners = year === "all"
      ? meta.comparable_partners
      : (gaps.years?.[year]?.partners ?? meta.comparable_partners);
    return {
      meta: {
        ...meta,
        year: year === "all" ? `${years[0]}–${years[years.length - 1]}` : Number(year),
        reporters: (partners || []).map((p) => ({ ...p, has_data: true })),
      },
      corridors: scope,
      totals: {
        x_cif: s.tradeValue,
        m: s.declared,
        gap_pos: s.shortfall,
        vat_floor: s.vat,
        duty_loss: s.duty,
      },
      sig_counts: {
        under_invoicing: s.under.count,
        value_gap: s.unrecorded.count,
        over_invoicing: s.over.count,
        normal: s.normal,
        smuggling_risk: 0,
      },
    };
  }, [scope, meta, gaps.years, year, years]);

  const s = summary(scope);

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 fade-in">
        <div>
          <div className="eyebrow text-cedar mb-2">
            Trade-mirror forensics · Lebanon · {years.join(" & ")}
          </div>
          <h1 className="display text-[30px] md:text-[36px] leading-[1.1] tracking-tightest text-ink">
            What customs is not collecting
          </h1>
        </div>
        <p className="text-[13px] text-slate1 leading-relaxed max-w-sm">
          What exporting countries say they sent to Lebanon, against what Lebanon recorded.
          The difference is revenue not collected.
        </p>
      </header>

      {/* Year switch — one control, drives every tab below. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-6 pb-5 border-b border-rule">
        <div className="flex items-center gap-1">
          <span className="eyebrow mr-2">Year</span>
          {[...years.map(String), "all"].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              aria-pressed={year === y}
              className={`px-3 py-1.5 text-[12px] num border transition-colors ${
                year === y
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-rule text-slate1 hover:text-ink hover:border-slate2"
              }`}
            >
              {y === "all" ? "Both" : y}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-slate1 num ml-auto">
          <span className="text-ink">{money(s.fiscal)}</span> uncollected ·{" "}
          <span className="text-slate2">{money(s.outflow)} outflow</span> ·{" "}
          {s.flagged} of {s.corridors} corridors flagged
        </div>
      </div>

      <nav className="flex items-center gap-1 mb-8 border-b border-rule" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`px-4 py-3 text-[12px] tracking-wide uppercase num border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-gold text-gold"
                : "border-transparent text-slate1 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview data={gaps} year={year} onGo={setTab} />}
      {tab === "analytics" && (
        <Analytics data={slice} onOpenMirror={() => setTab("mirror")} onOpenLedger={() => setTab("ledger")} />
      )}
      {tab === "mirror" && <PartnerMirror defaultYear={year === "all" ? meta.base_year : year} />}
      {tab === "ledger" && <GapForensics data={slice} />}
      {tab === "detective" && <TradeDetective data={slice} />}
      {tab === "method" && <Method meta={meta} />}
    </div>
  );
}
