"use client";

import { useMemo, useState } from "react";
import { money, pct } from "@/lib/format";
import { Chip, Panel, Select } from "@/components/ui";

// Signature → chip colour. Under-invoicing reads as the value crime (burgundy),
// smuggling as the quantity crime (gold), normal asymmetry as healthy (cedar).
const SIG_TONE = {
  under_invoicing: "burgundy",
  smuggling_risk: "gold",
  over_invoicing: "neutral",
  value_gap: "neutral",
  normal: "cedar",
  exempt: "neutral",
  structural: "sea",
};

const PAGE_STEP = 40;

/**
 * The complete corridor set, unranked and unopinionated — the audit surface
 * behind the triage queue. Headline figures and methodology live in Triage; this
 * view stays deliberately plain so every row can be read and exported.
 */
export default function GapForensics({ data, onOpenProducts, yearControl }) {
  const { meta, sig_counts: sig, corridors = [] } = data;

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
        if (signature === "flagged" && (c.signature === "normal" || c.signature === "exempt" || c.signature === "structural")) return false;
        if (signature !== "all" && signature !== "flagged" && c.signature !== signature)
          return false;
        if (chapter !== "all" && c.hs2 !== chapter) return false;
        return true;
      }),
    [corridors, signature, chapter]
  );

  const silentPartners = meta.reporters.filter((r) => !r.has_data);
  const flaggedCount = corridors.filter((c) => !["normal", "exempt", "structural"].includes(c.signature)).length;
  const exemptCount = corridors.filter((c) => c.signature === "exempt").length;
  const structuralCount = corridors.filter((c) => c.signature === "structural").length;
  const shown = rows.slice(0, limit);
  const subtotal = rows.reduce((s, r) => s + Math.max(0, r.vat_floor), 0);

  return (
    <div className="fade-in">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {yearControl}
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
            ["exempt", `Exempt regime (${exemptCount})`],
            ["structural", `Set aside · one-sided (${structuralCount})`],
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
        <div className="text-[11.5px] text-slate2 num ml-auto">
          {rows.length} corridors · {money(subtotal)} VAT floor · ranked by absolute gap · click a row for its products
        </div>
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Corridor</th>
                <th className="text-right">Partner (CIF-adj.)</th>
                <th className="text-right">Lebanon</th>
                <th className="text-right">Gap</th>
                <th className="text-right">Gap %</th>
                <th>Signature</th>
                <th className="text-right">VAT floor</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={`${c.partner}-${c.hs4}`} className={onOpenProducts ? "cursor-pointer" : ""}
                  onClick={() => onOpenProducts?.({ partner: c.partner, chapter: c.hs2, hs4: c.hs4 })}
                  title="Open this heading product by product">
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
                  <td colSpan={8} className="text-slate1">
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
              className="inline-flex items-center h-9 px-3 rounded-md border border-rule bg-bone text-[11px] uppercase tracking-wider num text-ink hover:bg-bone2 cursor-pointer transition-colors"
            >
              Show more ({rows.length - limit} remaining)
            </button>
          </div>
        )}
      </Panel>

      {silentPartners.length > 0 && (
        <div className="mt-4 text-[12px] text-slate1 leading-relaxed max-w-3xl">
          <span className="text-slate2 uppercase tracking-wide num mr-2">No partner data:</span>
          {silentPartners.map((p) => p.name).join(", ")} — corridors with these partners rest on
          Lebanese records only. Russia has not published detailed customs data since 2022.
        </div>
      )}
    </div>
  );
}
