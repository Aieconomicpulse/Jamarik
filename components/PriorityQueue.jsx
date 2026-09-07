"use client";

import { useMemo, useState } from "react";
import { money, pct } from "@/lib/format";
import { byPartner, concentration, triage } from "@/lib/triage";
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

/** Share of the partner's shipment that Lebanon actually recorded. */
function coverLabel(c) {
  if (c.cover == null) return "—";
  return `${Math.round(c.cover * 100)}%`;
}

export default function PriorityQueue({ data, onOpenLedger }) {
  const { meta, corridors = [] } = data;
  const [limit, setLimit] = useState(SHOW_STEP);

  const t = useMemo(() => triage(corridors), [corridors]);
  const { recoverable, checkOrigin, outflow, flaggedCount } = t;

  const conc = useMemo(() => concentration(recoverable, 5), [recoverable]);
  const partners = useMemo(() => byPartner(recoverable, 5), [recoverable]);

  const noQty = meta.quantity_available === false;
  const partial = typeof meta.coverage === "string" && /partial/i.test(meta.coverage);
  const concentrated = conc.share >= 0.5;

  // The three tracks, as one honest accounting of what the gap is made of.
  const tracks = [
    {
      key: "recoverable",
      label: meta.signatures?.under_invoicing ?? "Value under-declared",
      count: recoverable.length,
      vat: t.recoverableVat,
      note: "Defensible — shortfall sits in the mis-pricing range",
      tone: "gold",
    },
    {
      key: "checkOrigin",
      label: meta.signatures?.value_gap ?? "Largely unrecorded",
      count: checkOrigin.length,
      vat: t.checkOriginVat,
      note: "Verify origin first — hub attribution competes with under-pricing",
      tone: "slate",
    },
    {
      key: "outflow",
      label: meta.signatures?.over_invoicing ?? "Lebanon declares more",
      count: outflow.length,
      vat: 0,
      note: "No VAT to reclaim — an outflow question, not a duty one",
      tone: "slate",
    },
  ].filter((x) => x.count > 0);

  const maxVat = Math.max(...tracks.map((x) => x.vat), 1);

  return (
    <div className="fade-in">
      {meta.demo && <DemoBanner />}

      {/* ── What this dataset can and cannot support ── */}
      {(partial || noQty) && (
        <div className="border-l-2 border-rule pl-3 py-1 mb-7 space-y-1">
          {partial && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="eyebrow">Partial coverage</span>
              <span className="text-[12.5px] text-slate1">
                Only {meta.reporters?.length} partners mirrored
                {meta.reporters?.length
                  ? ` (${meta.reporters.map((r) => r.name).join(", ")})`
                  : ""}
                . These totals are not Lebanon&apos;s whole exposure.
              </span>
            </div>
          )}
          {noQty && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="eyebrow">No quantities</span>
              <span className="text-[12.5px] text-slate1">
                Lebanon publishes no genuine net weight, so under-pricing cannot be
                separated from missing goods on evidence. Coverage is the discriminator
                below; declaration-level weights would settle it.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── The decision ── */}
      <section className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-8 lg:gap-14 items-start pb-9 mb-9 border-b border-rule">
        <KeyFigure
          label={`Defensible revenue loss · ${meta.year}`}
          value={money(t.recoverableVat)}
          sub={`${Math.round(meta.vat_rate * 100)}% VAT on shortfalls that sit in the mis-pricing range. A further ${money(
            t.checkOriginVat
          )} is flagged but needs an origin check before it can be counted.`}
        />

        <div>
          <div className="display text-[21px] leading-snug text-ink">
            {concentrated ? (
              <>
                {Math.round(conc.share * 100)}% of it sits in{" "}
                <span className="text-gold">{conc.n} corridors</span>.
              </>
            ) : (
              <>
                No small set of corridors carries this —{" "}
                <span className="text-gold">the loss is systemic</span>.
              </>
            )}
          </div>
          <p className="text-[13px] text-slate1 mt-2 leading-relaxed">
            {concentrated
              ? `${flaggedCount} corridors are flagged, but exposure is not spread across them. Working the head of this queue recovers most of what is identifiable.`
              : `The top ${conc.n} of ${recoverable.length} corridors hold only ${Math.round(
                  conc.share * 100
                )}% of the defensible loss. A handful of inspections will not close this — it points to a valuation practice running across many headings, not a few bad corridors.`}
          </p>

          <div className="mt-5">
            <Bar value={conc.share} tone="gold" />
            <div className="flex justify-between eyebrow text-[10px] mt-2">
              <span className="text-gold">
                Top {conc.n} · {money(conc.head)}
              </span>
              <span>
                Remaining {Math.max(0, recoverable.length - conc.n)} ·{" "}
                {money(conc.total - conc.head)}
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

      {/* ── What the gap is made of, and who it runs through ── */}
      <section className="grid lg:grid-cols-2 gap-8 lg:gap-12 mb-10">
        <div>
          <div className="eyebrow mb-3">What the gap is made of</div>
          <ul className="space-y-4">
            {tracks.map((x) => (
              <li key={x.key}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-[13px] text-ink2">
                    {x.label}
                    <span className="text-slate2 num text-[11px] ml-2">{x.count}</span>
                  </span>
                  <span className="num text-[13px] text-slate1">
                    {x.vat > 0 ? money(x.vat) : "no VAT"}
                  </span>
                </div>
                <Bar value={x.vat / maxVat} tone={x.tone} />
                <div className="text-[11.5px] text-slate2 mt-1.5 leading-snug">{x.note}</div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="eyebrow mb-3">Defensible loss by partner</div>
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
        <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
          <h2 className="display text-[22px] text-ink">Where to look first</h2>
          <div className="text-[11px] text-slate2 num uppercase tracking-wider">
            Ranked by VAT floor × signal
          </div>
        </div>

        <Panel>
          <ul>
            {recoverable.slice(0, limit).map((c) => (
              <QueueRow key={`${c.partner}-${c.hs4}`} c={c} meta={meta} noQty={noQty} />
            ))}
            {recoverable.length === 0 && (
              <li className="px-5 py-6 text-[13px] text-slate1">
                No corridors fall in the mis-pricing range for this dataset.
              </li>
            )}
          </ul>

          {recoverable.length > limit && (
            <div className="px-5 py-3 border-t border-rule flex flex-wrap items-center gap-5">
              <button
                onClick={() => setLimit((n) => n + SHOW_STEP)}
                className="text-[11px] uppercase tracking-wider num text-gold hover:text-gold2"
              >
                Show {Math.min(SHOW_STEP, recoverable.length - limit)} more
              </button>
              <span className="text-[11px] text-slate2 num">
                {recoverable.length - limit} remaining
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

      {/* ── Same arithmetic, weaker claim ── */}
      {checkOrigin.length > 0 && (
        <section className="mt-10">
          <Panel>
            <PanelHead
              title="Verify origin before counting these"
              sub={`${money(
                t.checkOriginVat
              )} on paper — but Lebanon recorded so little that re-consignment is the leading explanation`}
            />
            <ul>
              {checkOrigin.slice(0, 6).map((c) => (
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
                    <span className="num text-[12.5px] text-slate1">
                      Lebanon recorded {coverLabel(c)} · {money(c.vat_floor)} at stake
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {checkOrigin.length > 6 && (
              <div className="px-5 py-3 border-t border-rule text-[11px] text-slate2 num">
                {checkOrigin.length - 6} more in the full ledger
              </div>
            )}
          </Panel>
        </section>
      )}

      {/* ── Capital flight: no VAT to reclaim, so a revenue rank never surfaces it ── */}
      {outflow.length > 0 && (
        <section className="mt-8">
          <Panel>
            <PanelHead
              title="Value leaving the country"
              sub="Lebanon declares more than partners report shipping — no VAT recoverable"
            />
            <ul>
              {outflow.slice(0, 5).map((c) => (
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
                    <span className="num text-[13px] text-ink2">{money(c.gap)}</span>
                  </div>
                  <p className="text-[12.5px] text-slate1 mt-2 leading-relaxed max-w-3xl">
                    {c.evidence.reading}
                  </p>
                </li>
              ))}
            </ul>
            {outflow.length > 5 && (
              <div className="px-5 py-3 border-t border-rule text-[11px] text-slate2 num">
                {outflow.length - 5} more in the full ledger
              </div>
            )}
          </Panel>
        </section>
      )}

      <Methodology meta={meta} noQty={noQty} />
    </div>
  );
}

/** One case in the queue: the claim, the money, and the evidence behind it. */
function QueueRow({ c, meta, noQty }) {
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
            <Metric label="Shortfall" value={pct(c.gap_pct)} />
            {noQty ? (
              <Metric label="Lebanon recorded" value={coverLabel(c)} />
            ) : (
              <Metric
                label="Qty gap"
                value={c.qty_gap_pct == null ? "no data" : pct(c.qty_gap_pct)}
              />
            )}
          </div>

          <p className="text-[13px] text-ink2 leading-relaxed mt-4 max-w-3xl">
            <span className="text-gold">{c.evidence.mechanism}.</span> {c.evidence.reading}
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
                    {c.confidence ? ` · source confidence ${c.confidence}` : ""}
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

function Methodology({ meta, noQty }) {
  const d = meta.diagnostics;
  return (
    <div className="mt-10 pt-6 border-t border-rule">
      <Disclosure summary="How these corridors were scored">
        <div className="text-[12.5px] text-slate1 leading-relaxed space-y-3 max-w-3xl">
          <p>
            Partner exports (FOB) are scaled by ×{meta.cif_factor} before comparison with
            Lebanon&apos;s CIF imports
            {meta.cif_basis ? ` — ${meta.cif_basis}` : ""}. Residual gaps of ±10–15% are
            ordinary asymmetry from transit timing, valuation, and hub attribution.
          </p>
          <p>
            Signal combines <span className="text-ink2">magnitude</span> (gap size against
            data noise), <span className="text-ink2">divergence</span> (distance beyond the
            ±15% normal band), and{" "}
            <span className="text-ink2">{noQty ? "coverage fit" : "pattern"}</span>
            {noQty
              ? " — how well the share Lebanon recorded matches a mis-priced declaration rather than a hub artefact. Corridors the source rates low-confidence are discounted."
              : " — whether quantity and value corroborate one mechanism."}
          </p>
          {noQty && (
            <p>
              {meta.quantity_note}
            </p>
          )}
          {d && (
            <p className="num text-[11.5px] text-slate2">
              Observed CIF/FOB ratios by partner —{" "}
              {Object.entries(d)
                .map(
                  ([k, v]) =>
                    `${k}: median ${v.observed_median_ratio}, value-weighted ${v.value_weighted_ratio} (${v.matched_lines} lines)`
                )
                .join(" · ")}
              .
            </p>
          )}
          <p>
            The floor applies VAT ({Math.round(meta.vat_rate * 100)}%) only. {meta.duty_note}{" "}
            Per the WCO, mirror gaps identify{" "}
            <span className="text-ink2">where to investigate</span> — they are risk
            indicators, not verdicts, and never name a party as fraudulent.
            {meta.source ? ` Source: ${meta.source}.` : ""}
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
