import { LOSS_TYPES } from "@/lib/losses";
import { Panel, PanelHead } from "@/components/ui";

/** Everything that was crowding the first screen, in one place, for whoever asks "how". */
export default function Method({ meta, stamp }) {
  return (
    <div className="fade-in max-w-4xl">
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
          <Row k="Classification">Lebanon reports in HS 2017; partners in HS 2022. About 350 six-digit codes changed between editions, so headline corridors are at HS-4, where the editions agree.</Row>
          <Row k="Standing">Per the WCO, mirror gaps show where to investigate. They are risk indicators, not findings, and name no party as fraudulent.</Row>
        </dl>
      </Panel>

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

function Row({ k, children }) {
  return (
    <div className="grid md:grid-cols-[130px_1fr] gap-2">
      <dt className="eyebrow text-[10px] pt-0.5">{k}</dt>
      <dd className="text-ink2">{children}</dd>
    </div>
  );
}
