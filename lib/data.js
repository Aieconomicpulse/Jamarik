// Where the numbers come from.
//
// Every screen and every API route reads through these two functions and
// nothing else. Today they return the JSON files the pipeline wrote from
// Comtrade bulk downloads. When the portal goes live, this is the only file
// that changes: point loadGaps at a database, loadHs6 at an ASYCUDA extract
// or a partner feed, and the rest of the app does not know the difference.
//
// The shape each one returns is documented in README.md under "The data".

import gaps from "@/data/mirror_gaps.json";
import hs6 from "@/data/mirror_hs6.json";

/** HS-4 corridors for every year, with per-year summaries. */
export async function loadGaps() {
  return gaps;
}

/** HS-6 lines for every partner-year the pipeline mirrored. */
export async function loadHs6() {
  return hs6;
}

/** When the loaded data was produced — the "as of" stamp on every screen. */
export function dataStamp() {
  return {
    generated: gaps.meta?.generated,
    retrieved: gaps.meta?.retrieved,
    source: gaps.meta?.source,
    live: false,
  };
}
