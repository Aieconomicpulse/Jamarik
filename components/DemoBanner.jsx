// Shown whenever meta.demo is true in the mirror dataset. Replace the partner
// side with real reporter data and set "demo": false — the banner disappears.
export default function DemoBanner() {
  return (
    <div className="border border-gold/50 bg-gold/10 px-5 py-4 mb-8">
      <div className="eyebrow text-gold mb-1">Demonstration mode</div>
      <p className="text-[13px] text-ink2 leading-relaxed">
        The <span className="text-gold">partner side of this module is synthetic</span>{" "}
        — generated with injected fraud signatures so every detection pattern is
        visible. The Lebanon side is real (2024 trade records). Replace the partner
        side with a licensed reporter feed and set{" "}
        <code className="num text-ink">meta.demo</code> to{" "}
        <code className="num text-ink">false</code> in{" "}
        <code className="num text-ink">data/mirror_gaps.json</code>; this banner then
        disappears. Nothing on this page should be cited while it is showing.
      </p>
    </div>
  );
}
