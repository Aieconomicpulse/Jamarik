// Shown whenever meta.demo is true in the mirror dataset. Replace the partner
// side with real reporter data and set "demo": false — the banner disappears.
// Kept to a single line: the caveat must be unmissable without occupying the
// space the analysis needs.
export default function DemoBanner() {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-gold pl-3 py-1 mb-7">
      <span className="eyebrow text-gold">Demonstration data</span>
      <span className="text-[12.5px] text-slate1">
        Partner side is synthetic with injected fraud signatures; Lebanon side is real.
        Nothing here is citable.
      </span>
    </div>
  );
}
