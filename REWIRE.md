# Switched off for now: what to rewire later

These features are built and kept in the code, but hidden from the portal
(switched off on 2026-10-01). Each one has a single flag in
[`lib/features.js`](lib/features.js). To bring one back, set its flag to
`true`, restart `npm run dev`, and run the checks listed for it. Nothing else
needs to change: the tab grid resizes itself to the number of visible tabs.

| Flag | What it brings back | Code kept in |
|---|---|---|
| `evidenceTab` | The **Evidence** tab: every HS-4 corridor, filterable; rows open Products | `components/GapForensics.jsx` |
| `methodTab` | The **Method** tab: what the figures rest on, the estimate, the build's own checks, going live | `components/Method.jsx` |
| `liveExample` | The `Live sources \| Example` switch on **Live data**, with the Pakistan sample | `components/LiveData.jsx` (Example mode), `samples/live/`, `config/live_sources.json` → `examples` |

## Where each flag is read

- `evidenceTab`, `methodTab`: `components/CustomsGap.jsx`, in the `TABS` list
  and the two render lines for `ledger` and `method`.
- `liveExample`:
  - `components/LiveData.jsx`, the Segmented switch at the top of the tab.
  - `app/api/live/route.js` and `app/api/live/[code]/route.js`. While the
    flag is off, `?mode=example` is ignored and treated as live, so the
    samples cannot be reached by URL either.
  - The upload route (`app/api/live/[code]/files/route.js`) refuses example
    mode whatever the flag is set to.

## Checks after rewiring

**Evidence** (`evidenceTab: true`)
- The tab appears between Corridors and Detective, and the grid shows one more card.
- The year switch works; clicking a row opens Products on that partner and heading.

**Method** (`methodTab: true`)
- The tab appears after Detective. All panels are full width (set on 2026-10-01).
- "How the numbers were checked" shows the reconciliation, all at 1.0000.

**Live data example** (`liveExample: true`). The full walkthrough:
1. Live data shows `Live sources | Example` at the top. Live sources lists
   Pakistan as **No link**.
2. Example: a gold banner, only **Pakistan · SAMPLE**, and no upload area.
3. Click Pakistan: four steps tick through, then a Connection log with
   2 documents.
4. `pakistan_shipments_sample.xls`: title line shown above the table;
   Rows 10 · Amount(USD) total 18,653 · 3 HS codes; names read Importer A,
   Exporter B and EXP-0001.
5. `pakistan_trade_note_sample.txt`: four figures (USD 7,937 · 6,669 · 4,047 ·
   18,653), period "August 2026" marked "from elsewhere in the document", and
   no UAE figure.
6. Back on Live sources the banner and the samples are gone. The other tabs
   are unchanged.

## Unit tests

`npx vitest run` covers the live parser and the verification gate whatever
the flags are set to. Run it after any change.
