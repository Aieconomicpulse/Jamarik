"use client";

import { useMemo, useState } from "react";
import { money, pct } from "@/lib/format";
import { Chip, Panel, PanelHead, Select, Stat } from "@/components/ui";
import DemoBanner from "@/components/DemoBanner";

// Signature → chip colour. Under-invoicing reads as the value crime (burgundy),
// smuggling as the quantity crime (gold), normal asymmetry as healthy (cedar).
const SIG_TONE = {
  under_invoicing: "burgundy",
  smuggling_risk: "gold",
  over_invoicing: "neutral",
  value_gap: "neutral",
  normal: "cedar",
};

const PAGE_STEP = 40;

export default function GapForensics({ data }) {
  const { totals, meta, sig_counts: sig, corridors = [] } = data;

  const [signature, setSignature] = useState("flagged");
  const [chapter, setChapter] = useState("all");
  const [limit, setLimit] = useState(PAGE_STEP);

  const chapters = useMemo(() => {
    const m = new Map();
    corridors.forEach((c) => m.set(c.hs2, c.chapter));
    return [...m.entries()].sort();
  }, [corridors]);

  const rows = useMemo(
    () =>
      corridors.filter((c) => {
        if (signature === "flagged" && c.signature === "normal") return false;
        if (signature !== "all" && signature !== "flagged" && c.signature !== signature)
          return false;
        if (chapter !== "all" && c.hs2 !== chapter) return false;
        return true;
      }),
    [corridors, signature, chapter]
  );

  const silentPartners = meta.reporters.filter((r) => !r.has_data);
  const flaggedCount = corridors.filter((c) => c.signature !== "normal").length;

  return (
    <div>
      {meta.demo && <DemoBanner />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat
          label="Partners report (CIF-adj.)"
          value={money(totals.x_cif)}
          sub={`${meta.reporters.length} reporters · scope chapters only`}
        />
        <Stat
          label="Lebanon reports"
          value={money(totals.m)}
          sub="Lebanese customs declarations, same scope"
        />
        <Stat
          label="Flagged excess gap"
          value={money(totals.gap_pos)}
          accent="burgundy"
          sub="Positive gaps on flagged corridors"
        />
        <Stat
          label="VAT-floor revenue loss"
          value={money(totals.vat_floor)}
          accent="gold"
          sub={`${Math.round(meta.vat_rate * 100)}% × flagged gaps — conservative floor`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select
          label="Filter by signature"
          value={signature}
          onChange={(v) => {
            setSignature(v);
            setLimit(PAGE_STEP);
          }}
          options={[
            ["flagged", `All flagged (${flaggedCount})`],
            ["under_invoicing", `Under-invoicing (${sig.under_invoicing})`],
            ["smuggling_risk", `Smuggling risk (${sig.smuggling_risk})`],
            ["over_invoicing", `Over-invoicing (${sig.over_invoicing})`],
            ["value_gap", `Unclassified gap (${sig.value_gap})`],
            ["all", `Everything incl. normal (${corridors.length})`],
          ]}
        />
        <Select
          label="Filter by chapter"
          value={chapter}
          onChange={(v) => {
            setChapter(v);
            setLimit(PAGE_STEP);
          }}
          options={[["all", "All chapters"], ...chapters.map(([k, v]) => [k, `${k} · ${v}`])]}
        />
        <div className="text-[12px] text-slate2 ml-auto">
          Ranked by absolute gap · corridor = partner × HS-4
        </div>
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="dt">
            <thead className="sticky top-0 bg-bone z-10">
              <tr>
                <th>Partner</th>
                <th>Corridor</th>
                <th className="text-right">Partner (CIF-adj.)</th>
                <th className="text-right">Lebanon</th>
                <th className="text-right">Gap</th>
                <th className="text-right">Gap %</th>
                <th className="text-right">Qty gap %</th>
                <th>Signature</th>
                <th className="text-right">VAT floor</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((c) => (
                <tr key={`${c.partner}-${c.hs4}`}>
                  <td className="whitespace-nowrap">{c.partnerName}</td>
                  <td>
                    <div className="num text-[12px] text-slate1">{c.label}</div>
                    <div className="text-[13px] leading-snug max-w-[340px]">{c.chapter}</div>
                  </td>
                  <td className="text-right num">{money(c.x_cif)}</td>
                  <td className="text-right num">{money(c.m)}</td>
                  <td className={`text-right num ${c.gap > 0 ? "text-burgundy" : "text-slate1"}`}>
                    {money(c.gap)}
                  </td>
                  <td className="text-right num">{pct(c.gap_pct)}</td>
                  <td className="text-right num">{pct(c.qty_gap_pct)}</td>
                  <td>
                    <Chip tone={SIG_TONE[c.signature]}>
                      {meta.signatures[c.signature] ?? c.signature}
                    </Chip>
                  </td>
                  <td className="text-right num text-gold">{money(c.vat_floor)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-slate1">
                    No corridors match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {rows.length > limit && (
          <div className="px-5 py-3 border-t border-rule">
            <button
              onClick={() => setLimit((n) => n + PAGE_STEP)}
              className="text-[12px] uppercase tracking-wide num text-gold hover:text-gold2"
            >
              Show more ({rows.length - limit} remaining)
            </button>
          </div>
        )}
      </Panel>

      {silentPartners.length > 0 && (
        <div className="mt-4 text-[12px] text-slate1">
          <span className="text-slate2 uppercase tracking-wide num mr-2">No partner data:</span>
          {silentPartners.map((p) => p.name).join(", ")} — corridors with these partners rest on
          Lebanese records only. Russia has not published detailed customs data since 2022.
        </div>
      )}

      <Methodology meta={meta} />
    </div>
  );
}

function Methodology({ meta }) {
  return (
    <Panel className="mt-8">
      <PanelHead
        title="Reading this table honestly"
        sub="Gaps are risk indicators, not verdicts"
      />
      <div className="px-5 py-4 text-[13px] text-slate1 leading-relaxed space-y-3">
        <p>
          Partner exports (FOB) are scaled by ×{meta.cif_factor} before comparison with
          Lebanon&apos;s CIF imports; residual gaps of ±10–15% are ordinary asymmetry from
          transit timing, valuation, and hub attribution (goods routed via the UAE or Türkiye
          are credited differently by each side). The signature logic follows the established
          forensic convention:{" "}
          <span className="text-burgundy">quantity agreement with value disagreement</span>{" "}
          points to under-invoicing at Lebanese customs;
          <span className="text-gold"> missing quantity</span> points to smuggling or
          non-declaration;{" "}
          <span className="text-ink2">Lebanon reporting more than any partner shipped</span>{" "}
          points to over-invoicing (a capital-flight channel) or an attribution artefact.
          Corridors below $250K are suppressed as noise.
        </p>
        <p>
          The revenue floor applies VAT ({Math.round(meta.vat_rate * 100)}%) only.{" "}
          {meta.duty_note} Per the WCO, mirror gaps identify where to investigate —
          declaration-level customs data (NAJM) is where identification of specific
          transactions and importers happens, inside official channels.
        </p>
      </div>
    </Panel>
  );
}
