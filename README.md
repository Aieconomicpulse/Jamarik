# Jamarik

**Trade-mirror forensics for Lebanese customs.** A standalone, password-protected
portal built around one question: what do Lebanon's trading partners say they
shipped here, and what does Lebanon say it received? Where those two records
split, customs and VAT revenue quietly leaks.

Five views, all behind a single login:

| Tab | What it does |
|---|---|
| **Products** | The plain reading. Pick a partner and a year: product by product — at chapter, HS-4 or HS-6 — what the partner says it exported, what Lebanon registered, the difference, and the VAT not collected on it. Sortable columns; click a row for the working. Served by `/api/mirror`. |
| **Analytics** | The shape of the problem — how much of what partners shipped Lebanon recorded, by band — then losses by product and partner, and the ten corridors to open first. Every bar and row opens the Products view on that partner or heading. |
| **Ledger** | Every HS-4 corridor, filterable. The audit surface. Rows open Products. |
| **Detective** | Claude, grounded strictly in the loaded data. |
| **Method** | Everything the figures rest on, and what changes when this is wired to live data. |

---

## Quick start (local)

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.local` ships with a working username and password so the portal opens
straight away. It is gitignored and never reaches GitHub.

---

## Deploy

### 1 · Push to GitHub

```bash
git remote add origin https://github.com/Aieconomicpulse/Jamarik.git
git branch -M main
git push -u origin main
```

### 2 · Import into Vercel

New Project → import `Aieconomicpulse/Jamarik`. Framework preset **Next.js** is
detected automatically; no build settings to change.

### 3 · Set Environment Variables

In Vercel → Project → Settings → Environment Variables, add these for
**Production, Preview and Development**:

| Variable | Required | Notes |
|---|---|---|
| `PORTAL_USER` | yes | The username people sign in with. |
| `PORTAL_PASSWORD` | yes | The password. Use the one in your `.env.local`, or set a new one. |
| `SESSION_SECRET` | yes | Signs the session cookie. Generate with `openssl rand -base64 32`. |
| `ANTHROPIC_API_KEY` | no | Enables the Detective tab. Without it the other two tabs work normally and the Detective explains it isn't configured. |
| `DETECTIVE_MODEL` | no | Defaults to `claude-sonnet-4-5`. |

Redeploy after adding them — environment variables are read at request time,
but a fresh deploy is the cleanest way to pick them up.

---

## How access control works

- `middleware.js` intercepts **every** route except `/login` and the login API.
- A correct username and password mints an HMAC-SHA256–signed, HTTP-only,
  `SameSite=Lax` session cookie, valid 12 hours.
- Tampered or expired cookies fail signature verification and bounce to `/login`.
- API routes return a JSON `401` rather than an HTML redirect.
- Login attempts are throttled per IP (10 per 10 minutes, best-effort in a
  serverless environment).
- The whole site sends `X-Robots-Tag: noindex, nofollow` and a strict CSP.

To rotate the password, change `PORTAL_PASSWORD` in Vercel. Changing
`SESSION_SECRET` immediately invalidates every existing session.

---

## The data

Two JSON files in `/data`, built by `pipeline/build_mirror.py` from UN Comtrade
bulk files. `mirror_gaps.json` is the HS-4 corridor set for every year;
`mirror_hs6.json` is the HS-6 partner mirror served through `/api/mirror`.
One command writes both, reading each bulk file once:

```bash
python pipeline/build_mirror.py --dir "collected data" \
    --out data/mirror_gaps.json --hs6-out data/mirror_hs6.json
```

`collected data/` is the folder of raw downloads and is gitignored (1 GB+).
Files may be `.csv`, `.gz` or `.zip`, named either the Comtrade way
(`C_A_H6_842_2024.gz`) or by hand (`USA_842_H6_2023.csv`). Repeat downloads
with ` 2` or ` (1)` in the name are collapsed to one file per reporter-year.
Every year needs a Lebanon file (reporter 422); each partner file present for
that year becomes a mirrored partner.

Lebanon reports in HS 2017 and every partner in HS 2022. Before pairing, the
pipeline converts partner codes with the official UNSD correlation table in
`pipeline/hs/HS2022toHS2017.xlsx` (Conversions sheet for the target code,
Correlations sheet for the relationship). Each HS-6 line carries `pc` — the
code(s) the partner actually reported — and `map`: `same`, `recoded` (1:1
renumbering), `merged` (several HS 2022 codes pooled into one HS 2017 code),
`split` (the HS 2022 code could sit under more than one HS 2017 code; the
table's convention was applied), or `unmapped`. Nothing is paired by prefix.

Three further rules keep the gap honest:

- **Partner figure = domestic exports.** Lebanon books imports by country of
  origin, so a partner's re-exports never appear under that partner. The
  pipeline uses DX where the reporter publishes it (UAE, USA, Saudi Arabia),
  total less RX where only re-exports are published (Italy), and total
  exports where neither is (China, Greece). Each partner-year records its
  `basis`; each line keeps `rx`, the re-exported amount, so it can be seen.
- **Exempt regimes carry no revenue.** Military equipment (8710, chapter 93)
  and aircraft with parts (8802–8806, 8906) enter under exemptions; those
  lines read `exempt` and have VAT and duty of zero.
- **One-sided headings are set aside.** A heading that is at least 25% of the
  side it appears on, with the other side holding under 5% of it, reads
  `structural` and counts in no total: it is a reporting-practice question
  (Saudi fuel reported to no destination; UAE diamonds that are re-exports)
  rather than a customs gap. Both thresholds are constants in the pipeline
  and in the metadata.
- **Attribution test.** Every line carries `lw`, Lebanon's imports of the
  HS-4 heading from every origin. When that is below what one partner alone
  says it sent, the goods are absent from Lebanon's books under any origin —
  the strongest evidence this method can give. The corridor file carries the
  same as `m_world` and a boolean `absent`.

**`mirror_gaps.json`** — `meta` (years, comparable partners, CIF factor, VAT
rate, bands, caveats), `years[<year>]` (per-year totals, partner list, and a
like-for-like `comparable` block), and `corridors[]`:

```jsonc
{
  "year": 2024, "partner": 156, "partnerName": "China",
  "hs4": "9405", "hs2": "94", "chapter": "Furniture & lighting",
  "x_fob": 0, "x_cif": 0, "m": 0, "gap": 0, "gap_pct": 0, "cover": 0.53,
  "signature": "under_invoicing",          // value_gap | over_invoicing | normal
  "shortfall": 0, "outflow": 0,
  "vat_floor": 0, "duty_rate": 0.1, "duty_loss": 0, "fiscal_loss": 0,
  "years_seen": 2, "years_flagged": 2, "persistent": true
}
```

**`mirror_hs6.json`** — `meta` and `rows[]`, one per partner × year × product
code, compact keys: `y p hs6 hs4 hs2 ch st x xc m g cv rd vat duty kg lv pv pc map rx lw`.
`st` is whether the line paired (`matched`, `partner_only`, `lebanon_only`);
`rd` is the reading; `lv`/`pv` are the HS editions each side reported in;
`pc`/`map` are the partner's original code(s) and how they were placed.

### Going live

Every screen reads through `lib/data.js` (`loadGaps`, `loadHs6`) and the API
route `app/api/mirror/route.js`. Today they return the two JSON files. To go
live, point `lib/data.js` at a database fed by ASYCUDA / NAJM extracts on the
Lebanese side and national partner releases on the other; the routes send
`Cache-Control: no-store` and the Products screen re-fetches on demand, so
nothing else changes. The stamp beside the tabs switches from *Snapshot* to
*Live* when `dataStamp()` says so.

---

## Project layout

```
app/
  page.js                  server component — loads data, checks the session
  layout.js                fonts + global chrome
  globals.css              palette, editorial type, data-table styles
  login/page.js            the sign-in screen
  api/auth/login|logout/   session mint / clear
  api/mirror/route.js      HS-6 mirror, one partner-year (or all) per request
  api/detective/route.js   streaming Claude endpoint, grounded in the dataset
components/
  CustomsGap.jsx           hero, year switch, tab shell, cross-screen focus
  Products.jsx             partner × year × product: exported / registered / difference / VAT
  Analytics.jsx            cover-band chart, losses by product and partner, open-first list
  GapForensics.jsx         the HS-4 ledger
  TradeDetective.jsx       chat transcript, starters, streaming reader
  Method.jsx               what the figures rest on, and going live
  ui.jsx                   Metric / Panel / Chip / Select primitives
  TopBar.jsx  Footer.jsx  Wordmark.jsx
lib/
  data.js                  the data seam — swap this to go live
  losses.js                loss taxonomy, cover bands, summaries
  triage.js                signal strength and ranking
  auth.js                  credentials, HMAC session sign/verify
  format.js                money / percent / count formatters
data/                      mirror_gaps.json, mirror_hs6.json
pipeline/build_mirror.py   Comtrade bulk files -> both JSON files
pipeline/hs/               UNSD HS 2022 -> HS 2017 correlation table
middleware.js              the gate
```

Restyling normally means editing `tailwind.config.js` (palette),
`app/globals.css` (type and tables) and `components/ui.jsx` (primitives).
