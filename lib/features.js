// Parts of the portal that are built but switched off for now. The code
// behind each one is kept intact; set the flag back to true to rewire it.
// REWIRE.md lists what each flag controls and how to check it afterwards.

export const FEATURES = {
  /** Evidence tab — every HS-4 corridor, filterable (components/GapForensics.jsx). */
  evidenceTab: false,
  /** Method tab — how the figures are built and checked (components/Method.jsx). */
  methodTab: false,
  /** Live data → Example mode — bundled samples in samples/live (Pakistan). */
  liveExample: false,
};
