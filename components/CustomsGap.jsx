"use client";

import { useState } from "react";
import PriorityQueue from "@/components/PriorityQueue";
import GapForensics from "@/components/GapForensics";
import MonthlyMonitor from "@/components/MonthlyMonitor";
import TradeDetective from "@/components/TradeDetective";

// Triage leads: the queue answers "what do I open first". The ledger behind it
// stays complete for anyone who needs to audit the full corridor set.
const TABS = [
  ["triage", "Triage"],
  ["ledger", "Full ledger"],
  ["monitor", "Monthly signal"],
  ["detective", "Detective"],
];

export default function CustomsGap({ gaps, monitor }) {
  const [tab, setTab] = useState("triage");

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 fade-in">
        <div>
          <div className="eyebrow text-cedar mb-2">
            Trade-mirror forensics · Lebanon · {gaps.meta?.year}
          </div>
          <h1 className="display text-[30px] md:text-[36px] leading-[1.1] tracking-tightest text-ink">
            Where customs revenue is leaking
          </h1>
        </div>
        <p className="text-[13px] text-slate1 leading-relaxed max-w-md">
          Every dollar crossing the border leaves two records — what partners report
          shipping, and what Lebanon records receiving. Where they split, revenue leaks.
          This ranks the splits by what is recoverable.
        </p>
      </header>

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

      {tab === "triage" && (
        <PriorityQueue data={gaps} onOpenLedger={() => setTab("ledger")} />
      )}
      {tab === "ledger" && <GapForensics data={gaps} />}
      {tab === "monitor" && <MonthlyMonitor data={monitor} />}
      {tab === "detective" && <TradeDetective data={gaps} />}
    </div>
  );
}
