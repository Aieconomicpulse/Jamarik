"use client";

import { useMemo, useState } from "react";
import { money, pct } from "@/lib/format";
import { byMechanism, byPartner, concentration, triage } from "@/lib/triage";
import { Bar, Chip, Disclosure, KeyFigure, Metric, Panel, PanelHead } from "@/components/ui";
import DemoBanner from "@/components/DemoBanner";

const SIG_TONE = {
  under_invoicing: "burgundy",
  smuggling_risk: "gold",
  over_invoicing: "neutral",
  value_gap: "neutral",
  normal: "cedar",
};

const SHOW_STEP = 8;

export default function PriorityQueue({ data, onOpenLedger }) {
  const { meta, corridors = [] } = data;
  const [limit, setLimit] = useState(SHOW_STEP);
  const [mech, setMech] = useState("all");

  const { revenue, outflow, flaggedCount } = useMemo(() => triage(corridors), [corridors]);
  const conc = useMemo(() => concentration(revenue, 5), [revenue]);
  const mechanisms = useMemo(
    () => byMechanism(revenue, meta.signatures),
    [revenue, meta.signatures]
  );
  const partners = useMemo(() => byPartner(revenue, 5), [revenue]);

  const queue = useMemo(
    () => (mech === "all" ? revenue : revenue.filter((r) => r.signature === mech)),
    [revenue, mech]
  );

  const recoverable = revenue.reduce((s, r) => s + r.vat_floor, 0);
  const topVat = mechanisms[0]?.vat ?? 0;

  return (
    <div className="fade-in">
      {meta.demo && <DemoBanner />}

      {/* ── The decision: how much is recoverable, and how concentrated is it ── */}
      <section className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-8 lg:gap-14 items-start pb-9 mb-9 border-b border-rule">
        <KeyFigure
          label={`Recoverable · VAT floor · ${meta.year}`}
          value={money(recoverable)}
          sub={`Conservative floor: ${Math.round(meta.vat_rate * 100)}% VAT on flagged positive gaps only, before any duty.`}
        />

        <div>
          <div className="display text-[21px] leading-snug text-ink">
            {Math.round(conc.share * 100)}% of it sits in{" "}
            <span className="text-gold">{conc.n} corridors</span>.
          </div>
          <p className="text-[13px] text-slate1 mt-2 leading-relaxed">
            {flaggedCount} corridors are flagged, but exposure is not spread across them.
            Working the head of this queue recovers most of what is identifiable — the tail
            is long, thin, and can wait.
          </p>

          <div className="mt-5">
            <Bar value={conc.share} tone="gold" />
            <div className="flex justify-between eyebrow text-[10px] mt-2">
              <span className="text-gold">
                Top {conc.n} · {money(conc.head)}
              </span>
              <span>
                Remaining {revenue.length - conc.n} · {money(conc.total - conc.head)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-5 mt-6">
            <Metric label="Flagged" value={flaggedCount} />
            <Metric label="Gross gap" value={money(data.totals.gap_pos)} tone="burgundy" />
            <Metric
              label="Duty (indicative)"
              value={money(data.totals.duty_loss)}
              tone="gold"
            />
          </div>
        </div>
      </section>

      {/* ── How it is failing, and who it runs through ── */}
      <section className="grid lg:grid-cols-2 gap-8 mb-10">
        <div>
          <div className="eyebrow mb-3">Failure mechanism</div>
          <ul className="space-y-3">
            {mechanisms.map((m) => (
              <li key={m.key}>
                <button
                  onClick={() => {
                    setMech(mech === m.key ? "all" : m.key);
                    setLimit(SHOW_STEP);
                  }}
                  className="w-full text-left group"
                  aria-pressed={mech === m.key}
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span
                      className={`text-[13px] transition-colors ${
                        mech === m.key ? "text-gold" : "text-ink2 group-hover:text-ink"
                      }`}
                    >
                      {m.label}
                      <span className="text-slate2 num text-[11px] ml-2">{m.count}</span>
                    </span>
                    <span className="num text-[13px] text-slate1">{money(m.vat)}</span>
                  </div>
                  <Bar
                    value={topVat ? m.vat / topVat : 0}
                    tone={mech === m.key ? "gold" : "slate"}
                  />
                </button>
              </li>
            ))}
          </ul>
          {mech !== "all" && (
            <button
              onClick={() => {
                setMech("all");
                setLimit(SHOW_STEP);
              }}
              className="mt-3 text-[11px] uppercase tracking-wider num text-gold hover:text-gold2"
            >
              Clear filter
            </button>
          )}
        </div>

        <div>
          <div className="eyebrow mb-3">Concentration by partner</div>
          <ul className="space-y-3">
            {partners.map((p) => (
              <li key={p.name}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-[13px] text-ink2">
                    {p.name}
                    <span className="text-slate2 num text-[11px] ml-2">{p.count}</span>
                  </span>
                  <span className="num text-[13px] text-slate1">{money(p.vat)}</span>
                </div>
                <Bar value={partners[0].vat ? p.vat / partners[0].vat : 0} tone="slate" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── The worklist ── */}
      <section>
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h2 className="display text-[22px] text-ink">Where to look first</h2>
          <div className="text-[11px] text-slate2 num uppercase tracking-wider">
            Ranked by VAT floor × signal
          </div>
        </div>

        <Panel>
          <ul>
            {queue.slice(0, limit).map((c) => (
              <QueueRow key={`${c.partner}-${c.hs4}`} c={c} meta={meta} />
            ))}
            {queue.length === 0 && (
              <li className="px-5 py-6 text-[13px] text-slate1">
                No corridors match this mechanism.
              </li>
            )}
          </ul>

          {queue.length > limit && (
            <div className="px-5 py-3 border-t border-rule flex items-center gap-5">
              <button
                onClick={() => setLimit((n) => n + SHOW_STEP)}
                className="text-[11px] uppercase tracking-wider num text-gold hover:text-gold2"
              >
                Show {Math.min(SHOW_STEP, queue.length - limit)} more
              </button>
              <span className="text-[11px] text-slate2 num">
                {queue.length - limit} remaining
              </span>
              {onOpenLedger && (
                <button
                  onClick={onOpenLedger}
                  className="text-[11px] uppercase tracking-wider num text-slate1 hover:text-ink ml-auto"
                >
                  Open full ledger →
                </button>
              )}
            </div>
          )}
        </Panel>
      </section>

      {/* ── Capital flight: no VAT to reclaim, so it never surfaces in a revenue rank ── */}
      {outflow.length > 0 && (
        <section className="mt-10">
          <Panel>
            <PanelHead
              title="Value leaving the country"
              sub="No VAT recoverable — ranked separately so a revenue sort cannot bury it"
            />
            <ul>
              {outflow.map((c) => (
                <li
                  key={`${c.partner}-${c.hs4}`}
                  className="px-5 py-4 border-b border-rule/60 last:border-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <span className="text-[14px] text-ink">{c.partnerName}</span>
                      <span className="num text-[12px] text-slate1 ml-3">
                        {c.label} · {c.chapter}
                      </span>
                    </div>
                    <span className="num text-[13px] text-ink2">
                      {money(c.gap)} · {pct(c.gap_pct)}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-slate1 mt-2 leading-relaxed max-w-3xl">
                    {c.evidence.reading}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      )}

      <Methodology meta={meta} />
    </div>
  );
}

/** One case in the queue: the claim, the money, and the evidence behind it. */
function QueueRow({ c, meta }) {
  return (
    <li className="px-5 py-5 border-b border-rule/60 last:border-0 hover:bg-ink/[0.02] transition-colors">
      <div className="flex gap-4 md:gap-5">
        <div className="num text-[12px] text-slate2 pt-1 w-6 shrink-0 tabular-nums">
          {String(c.rank).padStart(2, "0")}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="text-[15px] text-ink">{c.partnerName}</div>
              <div className="num text-[12px] text-slate1 mt-0.5">
                {c.label} · {c.chapter}
              </div>
            </div>
            <Chip tone={SIG_TONE[c.signature]}>
              {meta.signatures[c.signature] ?? c.signature}
            </Chip>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 mt-4 max-w-2xl">
            <Metric label="VAT floor" value={money(c.vat_floor)} tone="gold" />
            <Metric label="Gross gap" value={money(c.gap)} tone="burgundy" />
            <Metric label="Value gap" value={pct(c.gap_pct)} />
            <Metric
              label="Qty gap"
              value={c.qty_gap_pct == null ? "no data" : pct(c.qty_gap_pct)}
            />
          </div>

          <p className="text-[13px] text-ink2 leading-relaxed mt-4 max-w-3xl">
            <span className="text-gold">{c.evidence.mechanism}.</span>{" "}
            {c.evidence.reading}
          </p>

          <div className="mt-4">
            <Disclosure summary={`Signal ${c.signal}/100 · basis`}>
              <div className="grid sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-5 pb-1">
                <div className="space-y-2.5">
                  {c.factors.map((f) => (
                    <div key={f.key}>
                      <div className="flex justify-between text-[11px] num text-slate1 mb-1">
                        <span>{f.label}</span>
                        <span>{Math.round(f.value * 100)}</span>
                      </div>
                      <Bar value={f.value} tone="slate" />
                    </div>
                  ))}
                </div>
                <div className="text-[12.5px] text-slate1 leading-relaxed space-y-2">
                  <p>
                    <span className="eyebrow text-[10px] block mb-1">Next step</span>
                    {c.evidence.next}
                  </p>
                  <p className="num text-[11.5px] text-slate2">
                    Partner (CIF-adj.) {money(c.x_cif)} · Lebanon {money(c.m)} · duty
                    indicative {money(c.duty_loss_indicative)}
                  </p>
                </div>
              </div>
            </Disclosure>
          </div>
        </div>
      </div>
    </li>
  );
}

function Methodology({ meta }) {
  return (
    <div className="mt-10 pt-6 border-t border-rule">
      <Disclosure summary="How these corridors were scored">
        <div className="text-[12.5px] text-slate1 leading-relaxed space-y-3 max-w-3xl">
          <p>
            Partner exports (FOB) are scaled by ×{meta.cif_factor} before comparison with
            Lebanon&apos;s CIF imports; residual gaps of ±10–15% are ordinary asymmetry from
            transit timing, valuation, and hub attribution. Corridors below $250K are
            suppressed as noise.
          </p>
          <p>
            Signal combines three factors: <span className="text-ink2">magnitude</span> (gap
            size against data noise), <span className="text-ink2">divergence</span> (distance
            beyond the ±15% normal band), and <span className="text-ink2">pattern</span>{" "}
            (whether quantity and value corroborate one mechanism). Corridors without quantity
            data are capped low by design — a gap with no quantity evidence cannot name a
            mechanism.
          </p>
          <p>
            The floor applies VAT ({Math.round(meta.vat_rate * 100)}%) only. {meta.duty_note}{" "}
            Per the WCO, mirror gaps identify <span className="text-ink2">where to
            investigate</span> — they are risk indicators, not verdicts, and never name a party
            as fraudulent. Declaration-level data (NAJM) is where specific transactions and
            importers are identified, inside official channels.
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
