// Shared editorial primitives. Everything on the page is built from these, so
// restyling the portal usually means editing this one file.
//
// Surfaces are white cards with a soft radius and a hairline, on a warm
// off-white ground. Colour is reserved for meaning: gold for revenue at
// stake, burgundy for under-declaration, sea for unrecorded, cedar for
// healthy. Every interactive element has a hover, a focus ring and a
// 40px+ hit area.

/* ── Icons ───────────────────────────────────────────────────────────────────
   Lucide outlines (MIT), inlined so nothing loads at runtime. One viewBox,
   one stroke, so icons sit the same at every size. */
const ICONS = {
  package: "M7.5 4.27l9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16ZM3.3 7l8.7 5 8.7-5M12 22V12",
  chart: "M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3",
  table: "M12 3v18M3 9h18M3 15h18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
  search: "M21 21l-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z",
  book: "M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
  refresh: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  info: "M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z",
  scale: "M16 5v22M6 10h20M6 10 2 20a4.5 4.5 0 0 0 8 0ZM26 10l4 10a4.5 4.5 0 0 1-8 0ZM11 27h10",
};

export function Icon({ name, className = "w-5 h-5", strokeWidth = 1.9 }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg viewBox={name === "scale" ? "0 0 32 32" : "0 0 24 24"} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Eyebrow({ children, className = "" }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

const TEXT_TONE = {
  ink: "text-ink", ink2: "text-ink2", gold: "text-gold", burgundy: "text-burgundy",
  cedar: "text-cedar", sea: "text-sea", slate: "text-slate1",
};
const EDGE_TONE = {
  ink: "border-l-ink/25", gold: "border-l-gold", burgundy: "border-l-burgundy",
  cedar: "border-l-cedar", sea: "border-l-sea", slate: "border-l-slate2",
};

/** Headline figure in a card. The left edge carries the tone. */
export function Tile({ label, value, sub, tone = "ink", onClick, active }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick}
      className={`text-left rounded-lg border border-rule bg-bone shadow-card border-l-[3px] ${EDGE_TONE[tone] || EDGE_TONE.ink} px-4 py-3.5 min-w-0 ${
        onClick ? "cursor-pointer transition-colors hover:bg-bone2/70" : ""
      } ${active ? "ring-2 ring-gold/40" : ""}`}>
      <div className="eyebrow text-[10px] leading-[14px] min-h-[28px] flex items-end">{label}</div>
      <div className={`num text-[24px] md:text-[27px] leading-none mt-2 truncate ${TEXT_TONE[tone] || TEXT_TONE.ink}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate2 num mt-1.5 leading-snug">{sub}</div>}
    </Tag>
  );
}

/** Headline figure with a label above and a caveat below — no card. */
export function Stat({ label, value, sub, accent = "ink" }) {
  return (
    <div className="rounded-lg border border-rule bg-bone shadow-card p-5">
      <Eyebrow>{label}</Eyebrow>
      <div className={`display text-[34px] md:text-[40px] mt-2 leading-none tracking-tightest ${TEXT_TONE[accent] || TEXT_TONE.ink}`}>
        {value}
      </div>
      {sub && <div className="text-[12px] text-slate1 mt-2">{sub}</div>}
    </div>
  );
}

export function Panel({ children, className = "" }) {
  return <div className={`rounded-lg border border-rule bg-bone shadow-card overflow-hidden ${className}`}>{children}</div>;
}

export function PanelHead({ title, sub, right }) {
  return (
    <div className="px-5 py-4 border-b border-rule flex items-center justify-between gap-4 bg-bone">
      <div className="min-w-0">
        <div className="display text-[18px] leading-tight text-ink">{title}</div>
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
    gold: "bg-gold/10 text-gold border-gold/30",
    sea: "bg-sea/10 text-sea border-sea/30",
  };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full text-[10.5px] tracking-wider uppercase px-2.5 py-[3px] border num ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

/** Native select, styled: 40px tall, rounded, with our own chevron. */
export function Select({ value, onChange, options, label, className = "" }) {
  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none w-full h-10 pl-3 pr-9 rounded-md bg-bone border border-rule text-ink text-[13px] num cursor-pointer transition-colors hover:border-slate2 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <Icon name="chevronDown" className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate2 pointer-events-none" />
    </div>
  );
}

export function Input({ value, onChange, placeholder, label, className = "" }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label || placeholder}
      className={`h-10 px-3 rounded-md bg-bone border border-rule text-ink text-[13px] num placeholder:text-slate2 transition-colors hover:border-slate2 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 ${className}`}
    />
  );
}

/**
 * A row of exclusive choices. The selected one lifts to white with the gold
 * text; the others stay quiet until hovered.
 */
export function Segmented({ value, onChange, options, label, size = "md" }) {
  const h = size === "sm" ? "h-8 px-3 text-[12px]" : "h-9 px-3.5 text-[12.5px]";
  return (
    <div role="group" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-bone2 border border-rule">
      {options.map(([v, l]) => {
        const on = value === v;
        return (
          <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={on}
            className={`${h} rounded-md num cursor-pointer transition-colors duration-150 ${
              on ? "bg-bone text-gold shadow-sm" : "text-slate1 hover:text-ink"
            }`}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Button({ children, onClick, disabled, variant = "primary", icon, type = "button", title, className = "" }) {
  const v = {
    primary: "bg-gold text-white hover:bg-gold2 disabled:hover:bg-gold",
    ghost: "bg-bone border border-rule text-ink hover:bg-bone2 hover:border-slate2",
    quiet: "text-gold hover:text-gold2 hover:bg-gold/5",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-[12.5px] tracking-wide uppercase num cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${v} ${className}`}>
      {icon && <Icon name={icon} className="w-4 h-4" />}
      {children}
    </button>
  );
}

export function Note({ message }) {
  return (
    <div role="alert" className="rounded-md border border-burgundy/40 bg-burgundy/5 p-4 text-sm text-burgundy">
      {message}
    </div>
  );
}

/** Grey placeholder while a fetch is in flight, so the layout does not jump. */
export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/* ── Triage primitives ────────────────────────────────────────────────────────
   The queue leads with one number that matters and keeps everything else
   subordinate to it, so the screen reads as a decision rather than a report. */

/** The single figure the screen is about. Everything else sits under it. */
export function KeyFigure({ label, value, sub, accent = "gold" }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className={`display text-[46px] md:text-[58px] leading-none tracking-tightest mt-1.5 ${TEXT_TONE[accent] || TEXT_TONE.gold}`}>
        {value}
      </div>
      {sub && <div className="text-[12.5px] text-slate1 mt-2 max-w-sm leading-relaxed">{sub}</div>}
    </div>
  );
}

/**
 * Supporting figures — inline and quiet, never competing with the KeyFigure.
 *
 * The label box is a fixed two lines tall with the text sat at its bottom, so
 * a label that wraps ("United States says shipped") and one that does not
 * ("Gap") still put their values on the same line across the row.
 */
export function Metric({ label, value, sub, tone = "ink", size = "md" }) {
  const v = size === "lg" ? "text-[26px] md:text-[30px] leading-none" : "text-[17px]";
  return (
    <div className="flex flex-col min-w-0">
      <div className="eyebrow text-[10px] leading-[14px] min-h-[28px] flex items-end">{label}</div>
      <div className={`num mt-1.5 ${v} ${TEXT_TONE[tone] || TEXT_TONE.ink}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate2 num mt-1">{sub}</div>}
    </div>
  );
}

/** Proportion bar. Width carries the value; colour only carries category. */
export function Bar({ value, tone = "gold", className = "" }) {
  const c = { gold: "bg-gold", burgundy: "bg-burgundy", cedar: "bg-cedar", sea: "bg-sea", slate: "bg-slate2" }[tone] || "bg-gold";
  return (
    <div className={`h-[4px] rounded-full bg-rule w-full overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${c} transition-[width] duration-300`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
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
