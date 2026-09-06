/** Compact USD: $1.32B / $145.5M / $250K / $840. */
export function money(v, opts = {}) {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(opts.bDigits ?? 2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(opts.mDigits ?? 1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function pct(v, digits = 1) {
  if (v == null || isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function count(v) {
  if (v == null || isNaN(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}
