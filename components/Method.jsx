import { LOSS_TYPES } from "@/lib/losses";
import { money } from "@/lib/format";
import { Panel, PanelHead } from "@/components/ui";

const BASIS_LABEL = {
  domestic: "domestic exports",
  total_less_reexports: "total less re-exports",
  total: "total exports — no re-export split published",
};

/** Everything that was crowding the first screen, in one place, for whoever asks "how". */
export default function Method({ meta, stamp }) {
  return (
    <div className="fade-in max-w-5xl">
      <Panel className="mb-6">
        <PanelHead title="What the portal compares" />
        <div className="px-5 py-4 text-[13.5px] text-ink2 leading-relaxed space-y-3">
          <p>
            Every shipment into Lebanon leaves two records. The exporting country records what it
            sent — its own customs declaration, valued at the port of departure (FOB). Lebanon records
            what it received — valued at the port of arrival, including freight and insurance (CIF).
          </p>
          <p>
            Both are published to the United Nations. For each partner, each year, and each product
            code, the portal puts the two figures side by side. Partner values are raised by
            ×{meta.cif_factor} to put them on the same footing as Lebanon&apos;s. Where the figures
            agree, nothing is flagged. Where Lebanon&apos;s is materially lower, revenue was not
            collected.
          </p>
        </div>
      </Panel>

      <Panel className="mb-6">
        <PanelHead title="Three readings" sub="Cover = what Lebanon declared ÷ what the partner reported, after the CIF adjustment" />
        <div className="divide-y divide-rule">
          {LOSS_TYPES.map((t) => (
            <div key={t.key} className="px-5 py-4 grid md:grid-cols-[200px_1fr] gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5" style={{ background: t.color }} />
                  <span className="text-[13.5px] text-ink">{t.label}</span>
                </div>
                <div className="text-[11.5px] text-slate2 num">{t.band}</div>
                <div className="eyebrow text-[9.5px] mt-1" style={{ color: t.color }}>{t.claim}</div>
              </div>
              <div className="text-[13px] text-ink2 leading-relaxed space-y-2">
                <p>{t.what}</p>
                <p className="text-slate1"><span className="text-ink2">What to do:</span> {t.remedy}</p>
              </div>
            </div>
          ))}
          <div className="px-5 py-4 text-[12.5px] text-slate1 leading-relaxed">
            Revenue not collected = under-declared + unrecorded. Money leaving is shown beside it and
            never added in: over-invoiced imports cost customs nothing, they move money out of the country.
          </div>
        </div>
      </Panel>

      <Panel className="mb-6">
        <PanelHead title="What the figures rest on" />
        <dl className="px-5 py-4 text-[13px] leading-relaxed space-y-4">
          <Row k="Source">{meta.source}. Both sides are public and independently checkable.</Row>
          <Row k="VAT">{Math.round(meta.vat_rate * 100)}% of the shortfall — the firm half of the revenue figure.</Row>
          <Row k="Duty">{meta.duty_note}</Row>
          <Row k="CIF factor">{meta.cif_basis}</Row>
          <Row k="Quantities">{meta.quantity_note}</Row>
          <Row k="Coverage">{meta.coverage}. Corridors below $250,000 and confidentiality buckets are excluded. Year-on-year comparisons use only partners present in every year.</Row>
          <Row k="Classification">{meta.classification ?? "Lebanon reports in HS 2017; partners in HS 2022. Partner codes are converted to HS 2017 with the official UNSD table before pairing."} Where a chapter balances but its headings gap in opposite directions, the two customs services are coding the same goods differently — the Products screen tags those lines rather than counting them as revenue.</Row>
          <Row k="Partner figure">{meta.partner_basis ?? "Domestic exports where the partner publishes them; total exports less re-exports where only re-exports are published; total exports otherwise."} Re-exports never appear under the shipping partner in Lebanon&apos;s books, so they are not a gap.</Row>
          <Row k="Exempt regimes">Military equipment (HS 8710, chapter 93) and aircraft with their parts (8802–8806, 8906) enter under exemption regimes: the partner reports the export, Lebanese customs books no VAT on the entry. Those lines are shown, read as &quot;exempt&quot;, and carry no revenue.</Row>
          <Row k="Attribution test">Every heading also carries Lebanon&apos;s imports of it from every origin. Where that is below what one partner alone says it sent, the goods are absent from Lebanon&apos;s books under any origin — tagged &quot;absent from all origins&quot;, the strongest signal this method gives. Where Lebanon books at least as much from other origins, the gap may be origin attribution and is read with more caution.</Row>
          <Row k="Standing">Per the WCO, mirror gaps show where to investigate. They are risk indicators, not findings, and name no party as fraudulent.</Row>
        </dl>
      </Panel>

      {meta.validation && <Validation v={meta.validation} />}

      <Panel>
        <PanelHead title="Going live" sub={stamp?.live ? "This portal is reading live data" : `This portal is reading a snapshot built ${stamp?.generated ?? meta.generated}`} />
        <div className="px-5 py-4 text-[13px] text-ink2 leading-relaxed space-y-3">
          <p>
            Every screen reads through one file, <code className="num">lib/data.js</code>, and one API
            route, <code className="num">/api/mirror</code>. Today they return files the pipeline built from
            Comtrade bulk downloads. Going live means pointing those two at a database that is fed
            continuously, and nothing on screen changes except the stamp in the corner.
          </p>
          <dl className="grid md:grid-cols-[130px_1fr] gap-x-2 gap-y-2 text-[12.5px]">
            <dt className="eyebrow text-[10px] pt-0.5">Lebanon side</dt>
            <dd>Daily ASYCUDA / NAJM extracts of cleared declarations, by partner and HS-8. This is the side that can be current to yesterday.</dd>
            <dt className="eyebrow text-[10px] pt-0.5">Partner side</dt>
            <dd>Monthly national releases (China Customs, Eurostat COMEXT, US Census, GCC-Stat) arrive four to eight weeks after month-end; Comtrade annual files a year later. The mirror is always as current as the slower side.</dd>
            <dt className="eyebrow text-[10px] pt-0.5">Refresh</dt>
            <dd>The Products screen re-asks the API on demand and never caches. With a live source behind it, the Refresh button is the real-time view.</dd>
            <dt className="eyebrow text-[10px] pt-0.5">Unlocks</dt>
            <dd>Declaration-level net weights separate under-pricing from missing goods — the one thing public data cannot do. Importer identifiers turn a product heading into a list of names to audit.</dd>
          </dl>
        </div>
      </Panel>
    </div>
  );
}

/** The build's own checks, published with the data so a reader need not take the figures on trust. */
function Validation({ v }) {
  const ok = (r) => r.ratio != null && Math.abs(r.ratio - 1) < 0.0005;
  const healthy = (p) => p.ratio != null && p.ratio >= 0.8 && p.ratio <= 1.2;
  const allOk = v.reconciliation.every(ok);
  return (
    <Panel className="mb-6 !max-w-none">
      <PanelHead title="How the numbers were checked" sub={v.note} />

      <div className="px-5 pt-4 pb-2 flex items-baseline justify-between gap-4">
        <div className="text-[13px] text-ink">1 · Reconciliation to source</div>
        <div className={`text-[12px] num ${allOk ? "text-cedar" : "text-burgundy"}`}>
          {allOk ? `all ${v.reconciliation.length} checks at 1.0000` : "a check is off — see below"}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="dt">
          <thead><tr><th>Year</th><th>File</th><th>Flow</th><th>Partner</th><th className="text-right">HS-6 lines</th><th className="text-right">Sum of lines used</th><th className="text-right">File&apos;s own TOTAL row</th><th className="text-right">Ratio</th></tr></thead>
          <tbody>
            {v.reconciliation.map((r, i) => (
              <tr key={i}>
                <td className="num">{r.year}</td><td>{r.reporter}</td><td className="num">{r.flow === "X" ? "exports" : "imports"}</td><td>{r.partner}</td>
                <td className="text-right num">{r.lines == null ? "—" : r.lines.toLocaleString()}</td>
                <td className="text-right num">{money(r.hs6_sum)}</td>
                <td className="text-right num">{r.total_row == null ? "—" : money(r.total_row)}</td>
                <td className={`text-right num ${ok(r) ? "text-cedar" : "text-burgundy"}`}>{r.ratio == null ? "—" : r.ratio.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 pt-5 pb-2 text-[13px] text-ink">2 · Against published figures</div>
      <div className="overflow-x-auto">
        <table className="dt">
          <thead><tr><th>Figure</th><th>Year</th><th className="text-right">This build</th><th className="text-right">Published</th><th className="text-right">Difference</th><th>Source</th></tr></thead>
          <tbody>
            {v.external.map((e, i) => (
              <tr key={i}>
                <td>{e.figure}</td><td className="num">{e.year}</td>
                <td className="text-right num">{money(e.ours)}</td><td className="text-right num">{money(e.published)}</td>
                <td className={`text-right num ${Math.abs(e.diff_pct) < 1 ? "text-cedar" : "text-burgundy"}`}>{e.diff_pct > 0 ? "+" : ""}{e.diff_pct.toFixed(2)}%</td>
                <td className="text-[12px] text-slate1">{e.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 pt-5 pb-2 text-[13px] text-ink">3 · Each partner-year on the basis Lebanon books it</div>
      <div className="overflow-x-auto">
        <table className="dt">
          <thead><tr><th>Year</th><th>Partner</th><th>Partner figure</th><th className="text-right">Partner (CIF)</th><th className="text-right">Lebanon</th><th className="text-right">Ratio</th><th className="text-right">Re-exports set aside</th><th className="text-right">Exempt gap</th><th className="text-right">Revenue not collected</th><th className="text-right">of which absent from all origins</th></tr></thead>
          <tbody>
            {v.partners.map((p, i) => (
              <tr key={i}>
                <td className="num">{p.year}</td><td className="whitespace-nowrap">{p.name}</td>
                <td className="text-[12px] text-slate1">{BASIS_LABEL[p.basis] ?? p.basis}</td>
                <td className="text-right num">{money(p.x_cif)}</td><td className="text-right num">{money(p.m)}</td>
                <td className={`text-right num ${healthy(p) ? "text-cedar" : "text-gold"}`} title={healthy(p) ? "Within the ordinary range for two customs services" : p.ratio > 1.2 ? "Lebanon books more than the partner reports sending — the partner does not report this trade by destination, or goods reach Lebanon via a hub" : "Lebanon books much less than the partner reports"}>{p.ratio == null ? "—" : p.ratio.toFixed(2)}</td>
                <td className="text-right num">{p.rx ? money(p.rx) : <span className="text-slate2">—</span>}</td>
                <td className="text-right num">{p.exempt_gap ? money(p.exempt_gap) : <span className="text-slate2">—</span>}</td>
                <td className="text-right num text-gold">{money(p.fiscal)}</td>
                <td className="text-right num">{money(p.fiscal_absent)} <span className="text-slate2">({p.fiscal ? Math.round(100 * p.fiscal_absent / p.fiscal) : 0}%)</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-4 text-[12px] text-slate1 leading-relaxed">
        Saudi Arabia reports its fuel exports without a destination, so Lebanon&apos;s $670M of Saudi fuel has no partner figure and the ratio runs high; it counts as outflow, never as revenue. China and Greece publish no re-export split, so their figures keep a hub component the build cannot remove.
      </div>
    </Panel>
  );
}

function Row({ k, children }) {
  return (
    <div className="grid md:grid-cols-[130px_1fr] gap-2">
      <dt className="eyebrow text-[10px] pt-0.5">{k}</dt>
      <dd className="text-ink2">{children}</dd>
    </div>
  );
}
