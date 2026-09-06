"use client";

import { useState } from "react";
import GapForensics from "@/components/GapForensics";
import MonthlyMonitor from "@/components/MonthlyMonitor";
import TradeDetective from "@/components/TradeDetective";

const TABS = [
  ["gaps", "Gap Forensics"],
  ["monitor", "Monthly Monitor"],
  ["detective", "Detective"],
];

export default function CustomsGap({ gaps, monitor }) {
  const [tab, setTab] = useState("gaps");

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10">
      <header className="mb-7 max-w-3xl fade-in">
        <div className="eyebrow mb-3 text-cedar">Trade-Mirror Forensics · Live</div>
        <h1 className="display text-4xl md:text-[52px] leading-[1.02] tracking-tightest text-ink">
          A Revolution in Catching <span className="text-gold">Customs Evasion</span>
        </h1>
        <p className="mt-4 text-slate1 leading-relaxed">
          Every dollar that crosses Lebanon&apos;s border leaves two records — what the world
          says it shipped, and what Lebanon says it received. Where those numbers split,
          revenue quietly leaks. Jamarik mirrors them corridor by corridor and lets an AI
          detective read the fingerprints of under-invoicing, smuggling and capital flight —
          turning a blind spot into a live map of recoverable customs &amp; VAT.
        </p>
      </header>

      <nav className="flex items-center gap-1 mb-8 border-b border-rule" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`px-4 py-3 text-[13px] tracking-wide uppercase num border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-gold text-gold"
                : "border-transparent text-slate1 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "gaps" && <GapForensics data={gaps} />}
      {tab === "monitor" && <MonthlyMonitor data={monitor} />}
      {tab === "detective" && <TradeDetective data={gaps} />}
    </div>
  );
}
