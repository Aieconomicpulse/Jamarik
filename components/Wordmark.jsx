// Jamarik wordmark — "jamārik" (جمارك) is Arabic for customs. The glyph is a
// pair of mirrored scales: the two records every shipment leaves behind.
export default function Wordmark({ small = false }) {
  const s = small ? 22 : 30;
  return (
    <div className="flex items-center gap-3">
      <svg
        width={s}
        height={s}
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-gold shrink-0"
        aria-hidden="true"
      >
        <path d="M16 5v22" />
        <path d="M6 10h20" />
        <path d="M6 10 2 20a4.5 4.5 0 0 0 8 0Z" />
        <path d="M26 10l4 10a4.5 4.5 0 0 1-8 0Z" />
        <path d="M11 27h10" />
      </svg>
      <div className="leading-none">
        <div
          className={`display tracking-tightest text-ink ${
            small ? "text-[19px]" : "text-[26px]"
          }`}
        >
          Jamarik
        </div>
        {!small && (
          <div className="eyebrow mt-1.5">Lebanon · Customs Intelligence</div>
        )}
      </div>
    </div>
  );
}
