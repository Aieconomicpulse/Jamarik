# Jamarik — FIXPLAN

Tickets for a coding agent (GitHub Copilot agent mode, Claude Code, Cursor) or a developer.
One ticket at a time. Each has **Files**, **Change**, and **Accept** — the acceptance commands
must run and pass before the ticket is done.

Three files ship with this plan and are drop-ins (no code to write, just place them):

| File in this bundle | Put it at | What it is |
|---|---|---|
| `estimate.py` | `pipeline/estimate.py` | Symmetric corridor rebuild + reflected-tail estimator (tested) |
| `tariff.py` | `pipeline/tariff.py` | Preference-aware duty rates (EU/EFTA/GAFTA = 0 on covered goods) |
| `test_estimate.py` | `tests/test_estimate.py` | pytest: symmetric noise → ~0; injected fraud → recovered; rebuild == shipped |

The numbers every acceptance check refers to were produced by running these files
against the shipped `data/mirror_gaps.json` and `data/mirror_hs6.json` on 2026-09-08.

---

## How to feed this to the agent

1. Copy `FIXPLAN.md` to the repo root, the three files to the paths above.
2. Create `.env.local` from `.env.example` and set `PORTAL_USER`, `PORTAL_PASSWORD`,
   `SESSION_SECRET` (`openssl rand -base64 32`). Ticket 6 makes these mandatory.
3. Put the block below in `.github/copilot-instructions.md` (Copilot) **and** `CLAUDE.md`
   (Claude Code / Cursor read it too):

```
This is Jamarik, a Next.js 15 (App Router, JavaScript, no TypeScript) portal with a
Python/pandas pipeline in pipeline/. Rules:
- Work from FIXPLAN.md. Implement ONE ticket per task. Do not start the next ticket.
- Never hand-edit data/*.json. Regenerate with: python pipeline/estimate.py --gaps data/mirror_gaps.json --hs6 data/mirror_hs6.json
- Constants (bands, CIF factor, VAT rate, thresholds) live in pipeline/build_mirror.py and lib/losses.js — keep them equal; Ticket 8 unifies them.
- Keep the UI copy in the existing voice: plain sentences, no exclamation marks, figures in $ with the money() formatter.
- Before finishing a ticket run: python -m pytest tests -q && npm run build. Paste the output.
- Commit message: "Ticket N: <title>".
```

4. Prompt, per ticket:

```
Read FIXPLAN.md. Implement Ticket N only. Follow its Files / Change / Accept sections exactly.
Run every command under Accept and paste the output. If a number under Accept does not
match within the stated tolerance, stop and report the difference instead of adjusting it.
```

## Order

| # | Ticket | Depends on | Needs external inputs? |
|---|---|---|---|
| 0 | Repo setup | — | no |
| 1 | Symmetric corridors + noise-corrected estimate | 0 | no |
| 2 | Preference-aware duty | 1 | no (verification later) |
| 3 | One canonical figure in the UI | 1, 2 | no |
| 4 | Evidence ladder replaces the signal score | 3 | no |
| 5 | Data-drift cleanup | — | no |
| 6 | Security: fail-closed env, server-built Detective context, rate limits | 3 | no |
| 7 | Page payload: corridors through an API route | 3 | no |
| 8 | Tests, one config file, CI gate | 1–7 | no |
| 9 | Wire estimator and tariff into `build_mirror.py` | 1, 2 | raw Comtrade files to verify |
| 10 | Worklist tab with status | 3, 4 | a database |
| 11 | Six years and more partners | 9 | Comtrade downloads |
| 12 | Route-specific CIF factors | 9 | OECD ITIC table |

Tickets 0–8 are code-only and can be done this week. 9–12 need data or infrastructure and are specified so the agent can start them when the inputs exist.

---

## Ticket 0 — Repo setup

**Files:** `package.json`, `pipeline/requirements.txt`, `.gitignore`, `.env.local` (new, untracked)

**Change**
- `pip install -r pipeline/requirements.txt pytest openpyxl` (the concordance loader reads `.xlsx`; `openpyxl` is missing from requirements — add it).
- `npm install`; `npm install -D vitest @playwright/test`.
- Add to `package.json` scripts: `"test": "vitest run"`, `"test:e2e": "playwright test"`, `"test:py": "python -m pytest tests -q"`.
- Add `tests/` and `pytest.ini` with `[pytest]\ntestpaths = tests`.
- Create `.env.local` from `.env.example` with real values.

**Accept**
```
npm run build            # ✓ Compiled successfully
python -c "import pandas, numpy, openpyxl; print('ok')"
```

---

## Ticket 1 — Symmetric corridors + noise-corrected estimate

**Why.** The corridor file thresholds on the partner side only (`x_fob >= 250_000`), so every Lebanon-only heading is dropped before `structural_share()` can see it: the structural rule never fires (`structural.count` is 0 in both years) and the outflow side is understated. The headline is a sum of positive gaps, i.e. one half of a symmetric noise distribution. `pipeline/estimate.py` fixes both without needing the raw Comtrade files.

**Files:** `pipeline/estimate.py` (drop-in), `pipeline/tariff.py` (drop-in — `estimate.py` imports it), `tests/test_estimate.py` (drop-in), `README.md`

**Change**
1. Place the three files.
2. Run the post-processor in place:
   ```
   python pipeline/estimate.py --gaps data/mirror_gaps.json --hs6 data/mirror_hs6.json
   ```
3. README, section "The data": add a paragraph — after `build_mirror.py`, run `estimate.py`; it rebuilds `corridors[]` symmetrically (a heading is a corridor when **either** side reaches $250k), adds `signature = not_in_partner` for Lebanon-only headings, writes `meta.estimate` (gross / central / lo / hi / floor per year and partner) and `p_real` on every flagged corridor. Copy the "Why a reflected tail" paragraph from the module docstring.

**Accept**
```
python -m pytest tests -q                       # 4 passed
python pipeline/estimate.py --gaps data/mirror_gaps.json --hs6 data/mirror_hs6.json --dry-run
```
Expected output (tolerance ±$1M on money, exact on counts):
```
2023: gross $ 212.7M  central $ 118.4M  [94–150M]  floor $106.9M  flagged 592
2024: gross $ 154.8M  central $  69.5M  [51–90M]   floor $46.7M   flagged 529
2023: corridors 1151  structural 1  not_in_partner 17
2024: corridors 1112  structural 1  not_in_partner 18
```
(The gross figures are already net of Ticket 2's duty fix because `estimate.py` imports `tariff.py`. With the old flat duty they would read $232.1M and $168.0M.)

After writing in place: `python -c "import json;g=json.load(open('data/mirror_gaps.json'));print(g['meta']['estimate']['years']['2024']['central'])"` prints ≈ `69500000`. `npm run build` passes. In the running app, Ledger → filter "Set aside · one-sided" shows Saudi Arabia HS 2710 (2024) and UAE HS 7102 (2023).

---

## Ticket 2 — Preference-aware duty

**Why.** Duty is 39% of the shipped headline on a flat band per chapter. EU/EFTA industrial goods enter Lebanon duty-free (Euro-Med Association Agreement, EFTA agreement) and Arab-origin goods under GAFTA. The shipped 2024 figure books $15.1M of duty on Italian, Greek and Saudi corridors that was never chargeable.

**Files:** `pipeline/tariff.py` (drop-in, already used by `estimate.py`), `pipeline/build_mirror.py`, `components/Method.jsx`, `README.md`

**Change**
1. In `build_mirror.py`: `from tariff import duty_rate_for, preference`; in `corridors_for()` replace `rate = duty_rate(hs2)` with `rate = duty_rate_for(r.hs4, code)`; in `_row()` (HS-6 layer) the signature has no partner — add a `partner` parameter and use `duty_rate_for(code[:4], partner)` for the `duty` field. Add `"preference": preference(code)` to each corridor. Update `meta.duty_note` to: *"Duty is indicative: chapter bands for MFN partners; zero for EU/EFTA industrial goods (chapters 25–97) and GAFTA goods; excise chapters (22, 24, 27, 87) always charged. Verify against the Lebanese tariff before citing a duty figure."*
2. `Method.jsx` → "What the figures rest on" → the `Duty` row already prints `meta.duty_note`; no change beyond step 1. Add a row `Preferences` listing the three regimes in one sentence.
3. README "Three further rules": add a fourth bullet for preferences.
4. Create `pipeline/tariff/README.md` describing Phase 2: `lebanon_tariff_hs6.csv` with columns `hs6, mfn_rate, excise, vat_exempt` from WITS/TRAINS, loaded by `duty_rate_for()` when present. Do **not** implement Phase 2 in this ticket.

**Accept**
```
python -c "import sys;sys.path.insert(0,'pipeline');from tariff import duty_rate_for as d;print(d('6402',380),d('6402',156),d('2402',380),d('0805',380),d('9405',682))"
# 0.0 0.2 0.35 0.05 0.0
python pipeline/estimate.py --gaps data/mirror_gaps.json --hs6 data/mirror_hs6.json --dry-run   # unchanged from Ticket 1
python -c "import json;c=json.load(open('data/mirror_gaps.json'))['corridors'];print(sum(x['duty_loss'] for x in c if x['year']==2024 and x['partnerName'] in ('Italy','Greece','Saudi Arabia') and x['hs2']>='25' and x['hs2'] not in ('27','87')))"
# 0.0
```

---

## Ticket 3 — One canonical figure in the UI

**Why.** For China 2024 the Products sentence says $100.5M, its tile subtitle $42.0M, and Analytics/Ledger imply $69.5M. HS-6 line sums run 1.2–1.9× the HS-4 figure. From now on the **HS-4 noise-corrected estimate is the headline everywhere**; gross and line-level figures are shown as bounds and detail.

**Files:** `lib/losses.js`, `components/CustomsGap.jsx`, `components/Analytics.jsx`, `components/Products.jsx`, `app/api/mirror/route.js`, `components/Method.jsx`, `components/TradeDetective.jsx`

**Change**

1. `lib/losses.js` — add:
```js
/** The headline estimate for one year, or summed over all years ("all"). */
export function estimateFor(meta, year) {
  const ys = meta?.estimate?.years || {};
  const keys = year === "all" || year == null ? Object.keys(ys) : [String(year)];
  const pick = keys.map((k) => ys[k]).filter(Boolean);
  if (!pick.length) return null;
  const sum = (f) => pick.reduce((s, y) => s + (y[f] || 0), 0);
  return { gross: sum("gross"), central: sum("central"), lo: sum("lo"), hi: sum("hi"), floor: sum("floor"), flagged: sum("flagged"), years: keys };
}
/** Fiscal loss weighted by p_real — the corrected figure over any set of corridors. */
export const corrected = (rows) => rows.reduce((s, c) => s + (c.fiscal_loss || 0) * (c.p_real ?? 0), 0);
```
   In `summary()`, add `correctedFiscal: corrected(corridors.filter(c => c.signature === "under_invoicing" || c.signature === "value_gap"))`, and in `lossTotals()` add `corrected: corrected(rows)`. In `groupBy()`, accumulate `cur.corrected += (c.fiscal_loss || 0) * (c.p_real ?? 0)` and sort by `corrected` instead of `fiscal`.

2. `CustomsGap.jsx` — pass `year={year}` to `Analytics`, `GapForensics`, `TradeDetective` (they currently infer it from `meta.year`, which is a string in "Both" mode).

3. `Analytics.jsx` — tiles become, in order:
   - **Revenue at stake (estimate)** · `money(est.central)` · sub `range ${money(est.lo)}–${money(est.hi)} · gross ${money(s.fiscal)}` · tone gold
   - **of which VAT** · `money(s.vat * est.central / s.fiscal)` · sub "scaled to the estimate"
   - **of which duty (indicative)** · same scaling with `s.duty`
   - **Corridors flagged** · unchanged
   - **Under-declared** · `money(s.under.corrected)` · sub `gross ${money(s.under.fiscal)}`
   - **Unrecorded · verify** · `money(s.unrecorded.corrected)` · sub `gross ${money(s.unrecorded.fiscal)}`
   where `const est = estimateFor(meta, year)`. If `est` is null (old data file), fall back to today's tiles.
   "By product" and "By partner" bars use `r.corrected` with `r.fiscal` in the small print.

4. `app/api/mirror/route.js` — `import { loadGaps, loadHs6 } from "@/lib/data"`; for a partner-year response add
```js
const gaps = await loadGaps();
const yr = gaps.meta.estimate?.years?.[String(year)];
const est = all
  ? Object.values(yr?.partners || {}).reduce((a, p) => ({ gross: a.gross + p.gross, central: a.central + p.central, floor: a.floor + p.floor }), { gross: 0, central: 0, floor: 0 })
  : (yr?.partners?.[String(partner)] ?? null);
```
   and return `estimate: est` next to `summary`.

5. `Products.jsx` — the sentence (lines ~261–273) becomes:
   > In {year}, {name} says it exported {money(s.x_cif)} to Lebanon and Lebanon registered {money(s.m)}. After correcting for ordinary classification noise, an estimated **{money(est.central)}** of VAT and duty is at stake on {name} headings (uncorrected: {money(est.gross)}). Line by line, Lebanon registered {money(s.shortfall)} less on {s.revenue_lines} products; the VAT on that gross shortfall is {money(s.vat_lost)}.

   Tile 4 becomes **VAT and duty at stake (estimate)** · `money(est.central)` · tone gold · sub `gross line-level VAT ${money(s.vat_lost)} · netted within chapter ${money(conservative.vat)}`. Keep the "How to read these figures" fold; add one sentence naming the estimate as the number to quote.

6. `Method.jsx` — new panel **The estimate** above "What the figures rest on": a table with one row per year: gross, central, 90% range, floor, flagged; below it `meta.estimate.note`.

7. `TradeDetective.jsx` `buildContext()` — add `estimate: meta.estimate?.years` to `meta`. (Ticket 6 moves this server-side; keep it minimal here.)

**Accept**
- `npm run build` passes.
- Log in, pick 2024 → Analytics tile 1 shows **$69.5M** with range $51–90M and gross $154.8M.
- Products → China 2024 → sentence and tile 4 show **$60.8M**; Analytics → "By partner" → China shows $60.8M; Ledger unchanged (row-level).
- `curl -s -b cookie "http://localhost:3000/api/mirror?year=2024&partner=156" | python -c "import json,sys;print(json.load(sys.stdin)['estimate'])"` → `central ≈ 60.8e6`.

---

## Ticket 4 — Evidence ladder replaces the signal score

**Why.** `signal()` is a hand-weighted heuristic with no ground truth, and `expected = vat × score/100` is presented as an expected value. Officers need to know *why* a corridor is first, in words. `smuggling_risk` is a phantom signature the pipeline can never produce.

**Files:** `lib/triage.js`, `components/Analytics.jsx`, `components/GapForensics.jsx`, `app/api/detective/route.js`, `pipeline/build_mirror.py`

**Change**

1. `lib/triage.js` — delete `plausibility()` and `signal()`. Add:
```js
export const COLLECTABILITY = 0.5; // share of an assessed shortfall that is actually collected; calibrate from Worklist outcomes (Ticket 10)

/** The evidence rung, with the named tests behind it. */
export function rung(c) {
  const under = c.signature === "under_invoicing";
  const tests = [];
  if (c.absent) tests.push("absent from Lebanon's books under any origin");
  if (c.persistent) tests.push(`flagged in ${c.years_flagged} of ${c.years_seen} years`);
  if (under) tests.push("cover in the under-declaration band (0.40–0.85)");
  if (c.p_real != null) tests.push(`${Math.round(c.p_real * 100)}% survives the noise correction`);
  if (c.hub) tests.push("hub partner — attribution risk");
  if (c.preference && c.preference !== "mfn") tests.push(`${c.preference.toUpperCase()} preference — duty not at stake`);
  const level = c.absent && c.persistent && under ? "strong"
    : (c.persistent && under) || (c.absent && under) ? "probable"
    : "verify";
  return { level, tests };
}

export const expectedRecoverable = (c) => (c.p_real ?? 0.5) * (c.fiscal_loss || 0) * COLLECTABILITY;
```
   In `triage()`: `flagged = corridors.filter(c => ["under_invoicing","value_gap","over_invoicing"].includes(c.signature))`; `scored` carries `rung: rung(c)` and `expected: expectedRecoverable(c)` instead of `signal/factors`; `recoverable` = under_invoicing sorted by `expected`; `checkOrigin` = value_gap sorted by `expected`; `outflow` = over_invoicing by gap. In `evidence()`, delete the `smuggling_risk` case and the `hasQty` branches' references to it (keep the `q` text for when `qty_gap_pct` exists).

2. `Analytics.jsx` "Open these first": replace the **Signal** column with **Rung** (Chip: strong = burgundy, probable = gold, verify = neutral) and a **Why** column listing `rung.tests.join(" · ")` in 12px. Add **Estimated** column = `money(c.fiscal_loss * (c.p_real ?? 0))` next to the gross "Revenue lost". Footer sentence: *"Ranked by expected recoverable = corrected loss × collectability (0.5 until calibrated)."*

3. `GapForensics.jsx`: remove the `smuggling_risk` option; rename "Unclassified gap" → "Largely unrecorded"; add `["not_in_partner", \`Only in Lebanon's books (${n})\`]`; `SIG_TONE.not_in_partner = "neutral"`.

4. `app/api/detective/route.js` SYSTEM prompt: delete the sentence about quantity signatures that names `smuggling_risk`; add: *"The headline figure is `meta.estimate` (central, with lo/hi). Quote it with its range. Gross figures are uncorrected upper bounds and must be labelled as such."*

5. `pipeline/build_mirror.py` `meta.signatures`: remove `smuggling_risk`; add `"not_in_partner": "Only in Lebanon's books"`.

**Accept**
- `grep -rn smuggling_risk app components lib pipeline` → no matches.
- Analytics → "Open these first" → first rows show a Rung chip and a Why sentence; the top row for 2024 is a China heading (5407, 9405, 6402 or 9503) at rung *strong* or *probable*.
- `npm run build` passes.

---

## Ticket 5 — Data-drift cleanup

**Files:** `components/Method.jsx`, `.env.example`, `README.md`, `pipeline/config.yaml`, `components/Analytics.jsx`

**Change**
- `Method.jsx` line with the fallback text "at least 30%" → "at least 25%" (the pipeline uses `STRUCTURAL_SHARE = 0.25`).
- `.env.example`: the Detective comment mentions "Gap Forensics and Monthly Monitor tabs" — replace with "the other tabs".
- `README.md`: the "Quick start" claims `.env.local` ships with credentials — it is gitignored; say "create `.env.local` from `.env.example`". State that `comtrade_fetch.py` (API → parquet cache) and `build_mirror.py` (bulk TSV files → JSON) are currently two separate paths (Ticket 11 joins them).
- `config.yaml`: comment that `years`, `directions: [exports]` and `monthly` are planned, not yet consumed by the build.
- `Analytics.jsx` cover-band chart: default `measure` to `"count"`; in `"fiscal"` mode the three right-hand bands are empty by construction — add the sentence under the legend: *"Normal and over-declared bands carry no fiscal loss by definition; switch to Corridors to see their size."*

**Accept**
- `grep -n "30%" components/Method.jsx` → no match; `grep -n "Monthly Monitor" -r . --exclude-dir=node_modules` → no match.
- `npm run build` passes.

---

## Ticket 6 — Security: fail-closed env, server-built Detective context, rate limits

**Why.** `jamarik / change-me-in-vercel` logs in when the env vars are unset (verified). `SESSION_SECRET` falls back to the password. The Detective accepts a client-supplied `context` (prompt-injection into the grounding) and has no rate limit.

**Files:** `lib/auth.js`, `lib/slice.js` (new), `components/CustomsGap.jsx`, `components/TradeDetective.jsx`, `app/api/detective/route.js`, `app/api/auth/login/route.js`, `README.md`

**Change**

1. `lib/auth.js`:
```js
const PROD = process.env.NODE_ENV === "production";
function env(name, fallback) {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (PROD) throw new Error(`Jamarik: ${name} must be set in production.`);
  return fallback;
}
```
   Keep the dev fallbacks. `sessionSecret()` uses `env("SESSION_SECRET", ...)` with the same rule, so production has no derived secret.

2. `lib/slice.js` (new, isomorphic): move the `slice` construction out of `CustomsGap.jsx` into `export function sliceFor(gaps, year)` and `buildContext()` out of `TradeDetective.jsx` into `export function detectiveContext(slice)`. Both components import from `@/lib/slice`. Include `estimate` in the context (from Ticket 3).

3. `app/api/detective/route.js`: request body becomes `{ messages, year }`. Reject `context` if present (400). Build the grounding server-side:
```js
import { loadGaps } from "@/lib/data";
import { sliceFor, detectiveContext } from "@/lib/slice";
const gaps = await loadGaps();
const ctx = detectiveContext(sliceFor(gaps, year === "all" ? "all" : Number(year)));
```
   Add a best-effort limiter: `Map<user, {count, first}>` keyed by the session user (read the cookie with `verifySession`) — 30 requests per hour → 429 with a plain message. Note in a comment that Vercel KV / Upstash is the durable option.

4. `app/api/auth/login/route.js`: same comment; keep the per-instance throttle.

5. `TradeDetective.jsx`: post `{ messages: next, year }` — remove `context` from the client entirely.

6. README "How access control works": document fail-closed behaviour and the limiter.

**Accept**
```
NODE_ENV=production PORTAL_USER= PORTAL_PASSWORD= SESSION_SECRET= npm start &   # then:
curl -s -X POST -H 'content-type: application/json' -d '{"username":"jamarik","password":"change-me-in-vercel"}' http://localhost:3000/api/auth/login
# → HTTP 500, not {"ok":true}
```
With real env values: login works; `curl -s -b cookie -X POST -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"hi"}],"context":{"totals":{"fiscal":1}}}' http://localhost:3000/api/detective` → 400. `grep -n "context" components/TradeDetective.jsx` → no client-built context.

---

## Ticket 7 — Page payload: corridors through an API route

**Why.** `app/page.js` passes the whole corridor file into a client component: the home HTML is 1.2–1.4 MB and `/api/mirror?partner=all` is 2.5 MB. Fine at five partners, fatal at twenty (Ticket 11).

**Files:** `app/page.js`, `app/api/corridors/route.js` (new), `components/CustomsGap.jsx`, `app/api/mirror/route.js`

**Change**
1. `app/api/corridors/route.js`: `GET ?year=2024|all` → `{ corridors: [...] }` from `loadGaps()`, `Cache-Control: no-store`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
2. `app/page.js`: pass `gaps={{ meta, years }}` (no `corridors`).
3. `CustomsGap.jsx`: `const [corridors, setCorridors] = useState([])`; fetch `/api/corridors?year=${year}` on mount and on year change (keep a `cache` map so switching back is instant); show the existing `Skeleton` while loading. Everything downstream already takes `corridors` from `slice`.
4. `app/api/mirror/route.js`: for `partner=all`, drop the per-line `pc`, `lv`, `pv`, `kg` fields from `rows` (Products does not use them in the all-partners view) and add `?fields=full` to get them back.

**Accept**
```
curl -s -b cookie http://localhost:3000/ | wc -c                                   # < 300000
curl -s -b cookie "http://localhost:3000/api/corridors?year=2024" | python -c "import json,sys;print(len(json.load(sys.stdin)['corridors']))"   # 1112
```
Tabs behave as before; switching year shows the skeleton once, then instant.

---

## Ticket 8 — Tests, one config file, CI gate

**Files:** `tests/` (pytest), `lib/__tests__/` (vitest), `e2e/` (Playwright), `config/thresholds.json` (new), `pipeline/build_mirror.py`, `lib/losses.js`, `.github/workflows/ci.yml` (new)

**Change**
1. `config/thresholds.json`:
```json
{ "cif_factor": 1.05, "vat_rate": 0.11, "under_lo": 0.40, "under_hi": 0.85, "over": 1.60,
  "structural_share": 0.25, "one_sided": 0.05, "min_corridor_value": 250000, "absent_ratio": 0.85 }
```
   `build_mirror.py` reads it at import (`json.load`), `lib/losses.js` imports it (`import T from "@/config/thresholds.json"`), and both replace their literals. The `0.85` in `absent` (`m_world < 0.85 * x_cif`) becomes `absent_ratio` and is documented in `meta`.
2. vitest — `lib/__tests__/losses.test.js`: `classifyCover(100, 50) === "under_invoicing"`, `classifyCover(100, 30) === "value_gap"`, `classifyCover(100, 170) === "over_invoicing"`, `classifyCover(0, 10) === "not_in_partner"`; `estimateFor` sums years; `summary()` on three hand-made corridors. `lib/__tests__/triage.test.js`: `rung()` levels for the three combinations; `expectedRecoverable`.
3. pytest — add `tests/test_build_rules.py`: `classify(0.5) == "under_invoicing"`, `classify(0.3) == "value_gap"`, `classify(1.7) == "over_invoicing"`, `structural_share(0, 670e6, 300e6, 900e6)` is truthy and `structural_share(100, 90, 1e9, 1e9)` is `None`, `is_exempt("8710")`, `duty_rate_for` cases from Ticket 2; `Concordance().convert("010121") == ("010121", "same")` (skip if the xlsx is absent).
4. Playwright — `e2e/smoke.spec.js`: log in with env credentials; read the Analytics tile-1 value; open Products for China 2024 and read tile 4; open `/api/mirror?year=2024&partner=156` and read `estimate.central`; assert the two screen figures equal `money()` of the API figures.
5. `.github/workflows/ci.yml`: Node 20 + Python 3.11; `npm ci`, `pip install -r pipeline/requirements.txt pytest openpyxl`; run `npm test`, `python -m pytest tests -q`, `npm run build`; then a **data gate** step:
```
python - <<'EOF'
import json; m=json.load(open('data/mirror_gaps.json'))['meta']['validation']
bad=[r for r in m['reconciliation'] if r['ratio'] is None or abs(r['ratio']-1)>5e-4]
ext=[e for e in m['external'] if abs(e['diff_pct'])>1]
assert not bad and not ext, (bad, ext)
EOF
```

**Accept**
`npm test`, `python -m pytest tests -q`, `npx playwright test` all green locally; the workflow runs on push and passes.

---

## Ticket 9 — Wire estimator and tariff into `build_mirror.py`

**Why.** Today `estimate.py` is a post-processor. A fresh build from raw files must produce the same output without a second command.

**Files:** `pipeline/build_mirror.py`

**Change**
- `--hs6-out` becomes required (the corridor set is now derived from the HS-6 layer).
- At the end of `main()`, before `args.out.write_text(...)`: `from estimate import run as postprocess; payload = postprocess(payload, {"rows": hs6})`. Remove the now-redundant persistence block and the `corridors.sort` (both happen in `postprocess`). Keep `corridors_for()` only if something else uses it; otherwise delete it and its call, and take `got`/`partners_by_year` from the HS-6 rows (`{r["p"] for r in r_rows}`).
- The console summary at the end prints `meta.estimate.years[y]` (gross / central / range) instead of only the gross.

**Accept** (needs the raw files in `collected data/`)
```
python pipeline/build_mirror.py --dir "collected data" --out /tmp/gaps.json --hs6-out /tmp/hs6.json
python -c "import json;a=json.load(open('/tmp/gaps.json'));b=json.load(open('data/mirror_gaps.json'));print(a['meta']['estimate']['years']['2024']['central'], b['meta']['estimate']['years']['2024']['central'])"
# identical within $1
```
Without raw files: `python -c "import ast;ast.parse(open('pipeline/build_mirror.py').read())"` and the pytest suite still pass.

---

## Ticket 10 — Worklist tab with status (needs a database)

**Files:** `app/api/worklist/route.js` (new), `components/Worklist.jsx` (new), `components/CustomsGap.jsx`, `lib/db.js` (new), `prisma/` or `db/schema.sql` (new)

**Change**
- Storage: Postgres (Vercel Postgres / Neon) in the cloud, SQLite for on-prem; one table `worklist_item (id, year, partner, hs4, hs6 null, status enum[new, review, audited, recovered], recovered_usd, note, updated_by, updated_at)`.
- `GET /api/worklist?year=` returns the top N corridors by `expectedRecoverable` joined with their status; `PATCH /api/worklist/:id` updates status/amount (auditor or admin only — roles arrive with Ticket 6's follow-up).
- `Worklist.jsx`: the "Open these first" table with a status control per row, the rung and tests, partner unit value (`x_fob / partner_kg`) beside Lebanon's declared value, and **Export to Excel** (`xlsx` package, one sheet, the working per row).
- Tab order becomes Worklist · Corridors (Analytics) · Evidence (Ledger) · Impact (placeholder) · Method; Detective stays available behind a flag.

**Accept** — mark a row *recovered $12,000*, reload, it persists; export downloads an `.xlsx` with the same rows.

---

## Ticket 11 — Six years and more partners (needs Comtrade downloads)

**Files:** `pipeline/comtrade_fetch.py`, `pipeline/build_mirror.py`, `pipeline/config.yaml`

**Change**
- Make `build_mirror.py` accept the parquet cache `comtrade_fetch.py` writes (`--cache pipeline/cache`) as an alternative to `--dir`; same `read_bulk` filter, one manifest.
- Run `comtrade_fetch.py check → partners → fetch` for 2019–2024; expect Türkiye, Egypt, Germany, France, Spain, Netherlands, India, Switzerland, Brazil, Ukraine, Korea, Japan, Belgium, Hong Kong on top of the current five. Add their names to `COUNTRY`.
- Persistence: `persistent = years_flagged >= 3` when `years_seen >= 4`, else `years_flagged == years_seen >= 2`; show the run of covers per year in the corridor detail; delete the "both years" chip.
- Method: "x% of Lebanon's imports mirrored" computed from the Lebanon world total in `meta.validation`.

**Accept** — `meta.years` has ≥ 5 entries; comparable set ≥ 10 partners; Method prints the coverage share; `estimate.py` runs unchanged.

---

## Ticket 12 — Route-specific CIF factors (needs the OECD ITIC table)

**Files:** `pipeline/cif.py` (new), `pipeline/estimate.py`, `pipeline/build_mirror.py`, `components/Method.jsx`

**Change**
- `pipeline/cif/itic_lebanon.csv` (partner, hs2, cif_fob_ratio) from the OECD ITIC database; `cif_factor_for(partner, hs2)` with fallback `config.thresholds.cif_factor`.
- `x_cif = x_fob * cif_factor_for(...)` in both layers; `cif_factor` becomes a column on each corridor; `meta.cif_basis` updated.
- Method sensitivity table: the 2024 estimate at the ITIC factors and at a flat 1.05 and 1.10.

**Accept** — `cif_factor` varies across corridors; the sensitivity table renders; the estimate at flat 1.05 reproduces Ticket 1's figure.

---

## Reference: the numbers after Tickets 1–2 (2026-09-08 data)

| Year | Gross (uncorrected) | Central estimate | 90% range | Floor | Flagged corridors |
|---|---|---|---|---|---|
| 2023 | $212.7M | **$118.4M** | $94–150M | $106.9M | 592 |
| 2024 | $154.8M | **$69.5M** | $51–90M | $46.7M | 529 |

Per partner, 2024: China $112.7M → **$60.8M**; Italy $23.5M → **$12.9M**; Saudi Arabia $7.1M → $1.6M; Greece $5.3M → $0.0M; United States $19.4M → $0.0M.

Estimator behaviour on synthetic data (from `tests/test_estimate.py`): symmetric noise only, gross $26.9M → central $2.3M; with $11.5M of injected under-declaration, central $12.2M [8.8–16.7M].
