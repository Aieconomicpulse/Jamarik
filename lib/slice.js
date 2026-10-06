// One year of the corridor file, shaped the way the tabs and the Detective
// read it. Isomorphic: the page builds it in the browser, the Detective route
// builds it on the server so the model's grounding never comes from a client.

import { summary } from "@/lib/losses";

/** The slice for one year, or every year ("all"). */
export function sliceFor(gaps, year) {
  const { meta, corridors = [] } = gaps;
  const years = meta.years || [];
  const all = year === "all" || year == null;
  const scope = all ? corridors : corridors.filter((c) => c.year === Number(year));
  const s = summary(scope);
  const partners = all
    ? meta.comparable_partners
    : (gaps.years?.[String(year)]?.partners ?? meta.comparable_partners);
  return {
    meta: {
      ...meta,
      year: all ? `${years[0]}–${years[years.length - 1]}` : Number(year),
      reporters: (partners || []).map((p) => ({ ...p, has_data: true })),
    },
    corridors: scope,
    totals: {
      x_cif: s.tradeValue,
      m: s.declared,
      gap_pos: s.shortfall,
      vat_floor: s.vat,
      duty_loss: s.duty,
      fiscal_loss: s.fiscal,
      corrected_fiscal: s.correctedFiscal,
    },
    sig_counts: {
      under_invoicing: s.under.count,
      value_gap: s.unrecorded.count,
      over_invoicing: s.over.count,
      normal: s.normal,
    },
  };
}

/**
 * Compact slice of the mirror dataset the model is grounded in. Keeping this
 * small and explicit is what stops the Detective from inventing figures — it
 * may only cite what appears here.
 */
export function detectiveContext(slice) {
  if (!slice) return null;
  const { meta, totals, sig_counts, corridors = [] } = slice;
  return {
    meta: {
      demo: meta.demo,
      year: meta.year,
      cif_factor: meta.cif_factor,
      vat_rate: meta.vat_rate,
      reporters: meta.reporters,
      signatures: meta.signatures,
      source: meta.source,
      coverage: meta.coverage,
      quantity_available: meta.quantity_available,
      quantity_note: meta.quantity_note,
      diagnostics: meta.diagnostics,
      estimate: meta.estimate?.years,
      decomposition: meta.decomposition
        ? {
            note: meta.decomposition.note,
            pending: meta.decomposition.pending,
            years: Object.fromEntries(Object.entries(meta.decomposition.years || {}).map(([y, v]) => [y, { ...v, tariff_shift: (v.tariff_shift || []).slice(0, 12) }])),
          }
        : undefined,
      comparable_partners: meta.comparable_partners,
    },
    totals,
    sig_counts,
    corridors: corridors.slice(0, 60).map((c) => ({
      partner: c.partnerName,
      hs4: c.hs4,
      chapter: c.chapter,
      label: c.label,
      partner_cif: c.x_cif,
      lebanon: c.m,
      gap: c.gap,
      gap_pct: c.gap_pct,
      qty_gap_pct: c.qty_gap_pct,
      year: c.year,
      cover: c.cover,
      signature: c.signature,
      shortfall: c.shortfall,
      vat_floor: c.vat_floor,
      duty_loss: c.duty_loss,
      fiscal_loss: c.fiscal_loss,
      p_real: c.p_real,
      outflow: c.outflow,
      persistent: c.persistent,
      absent: c.absent,
      preference: c.preference,
      confidence: c.confidence,
    })),
  };
}
