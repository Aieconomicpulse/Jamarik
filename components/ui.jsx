// Shared editorial primitives. Everything on the page is built from these, so
// restyling the portal usually means editing this one file.

export function Eyebrow({ children, className = "" }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

/** Headline figure with a label above and a caveat below. */
export function Stat({ label, value, sub, accent = "ink" }) {
  const tone = {
    ink: "text-ink",
    cedar: "text-cedar",
    burgundy: "text-burgundy",
    gold: "text-gold",
  }[accent];

  return (
    <div className="border border-rule bg-bone p-5 transition-colors hover:bg-bone2/30">
      <Eyebrow>{label}</Eyebrow>
      <div
        className={`display text-[34px] md:text-[40px] mt-2 leading-none tracking-tightest ${tone}`}
      >
        {value}
      </div>
      {sub && <div className="text-[12px] text-slate1 mt-2">{sub}</div>}
    </div>
  );
}

export function Panel({ children, className = "" }) {
  return <div className={`border border-rule bg-bone ${className}`}>{children}</div>;
}

export function PanelHead({ title, sub, right }) {
  return (
    <div className="px-5 py-4 border-b border-rule flex items-center justify-between gap-4">
      <div>
        <div className="display text-[18px] leading-tight">{title}</div>
        {sub && <div className="text-[12px] text-slate1 mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Chip({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-bone2 text-slate1 border-rule",
    cedar: "bg-cedar/10 text-cedar border-cedar/30",
    burgundy: "bg-burgundy/10 text-burgundy border-burgundy/30",
    gold: "bg-gold/15 text-gold border-gold/40",
  };
  return (
    <span
      className={`inline-block text-[10.5px] tracking-wider uppercase px-2 py-0.5 border ${
        tones[tone] || tones.neutral
      } num`}
    >
      {children}
    </span>
  );
}

export function Select({ value, onChange, options, label }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="bg-bone2 border border-rule text-ink text-[13px] px-3 py-2 num focus:outline-none focus:border-gold"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function Note({ message }) {
  return (
    <div className="border border-burgundy/40 bg-burgundy/5 p-4 text-sm text-burgundy">
      {message}
    </div>
  );
}
