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

/* ── Triage primitives ────────────────────────────────────────────────────────
   The queue leads with one number that matters and keeps everything else
   subordinate to it, so the screen reads as a decision rather than a report. */

/** The single figure the screen is about. Everything else sits under it. */
export function KeyFigure({ label, value, sub, accent = "gold" }) {
  const tone = { gold: "text-gold", ink: "text-ink", burgundy: "text-burgundy" }[accent];
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className={`display text-[46px] md:text-[58px] leading-none tracking-tightest mt-1.5 ${tone}`}>
        {value}
      </div>
      {sub && <div className="text-[12.5px] text-slate1 mt-2 max-w-sm leading-relaxed">{sub}</div>}
    </div>
  );
}

/** Supporting figures — inline and quiet, never competing with the KeyFigure. */
export function Metric({ label, value, tone = "ink" }) {
  const c = { ink: "text-ink", gold: "text-gold", burgundy: "text-burgundy", cedar: "text-cedar" }[tone];
  return (
    <div>
      <div className="eyebrow text-[10px]">{label}</div>
      <div className={`num text-[17px] mt-1 ${c}`}>{value}</div>
    </div>
  );
}

/** Proportion bar. Width carries the value; colour only carries category. */
export function Bar({ value, tone = "gold", className = "" }) {
  const c = {
    gold: "bg-gold",
    burgundy: "bg-burgundy",
    cedar: "bg-cedar",
    slate: "bg-slate2",
  }[tone];
  return (
    <div className={`h-[3px] bg-rule w-full ${className}`}>
      <div
        className={`h-full ${c}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

/** Collapsed by default — detail on demand keeps the queue scannable. */
export function Disclosure({ summary, children, className = "" }) {
  return (
    <details className={`group ${className}`}>
      <summary className="cursor-pointer list-none text-[11px] uppercase tracking-wider num text-slate2 hover:text-gold transition-colors select-none">
        <span className="inline-block transition-transform group-open:rotate-90 mr-1.5">›</span>
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
