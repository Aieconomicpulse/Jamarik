# Jamarik

**Trade-mirror forensics for Lebanese customs.** A standalone, password-protected
portal built around one question: what do Lebanon's trading partners say they
shipped here, and what does Lebanon say it received? Where those two records
split, customs and VAT revenue quietly leaks.

Three views, all behind a single login:

| Tab | What it does |
|---|---|
| **Overview** | One screen: revenue not collected, split into under-declared / unrecorded / money leaving, the year-on-year trend, top products and partners, and the headings that gap in both years. |
| **Analytics** | The shape of the problem — how much of what partners shipped Lebanon recorded, by band — then losses by product and partner, and the ten corridors to open first. |
| **Partner mirror** | Pick a partner and a year: every HS-6 code, the partner's export declaration beside Lebanon's import declaration, gap, cover, reading and VAT forgone. Served by `/api/mirror`. |
| **Ledger** | Every HS-4 corridor, filterable. The audit surface. |
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

Two JSON files in `/data`, built by `pipeline/build_mirror.py` from Comtrade bulk files. `mirror_gaps.json` is the HS-4 corridor set for every year; `mirror_hs6.json` is the HS-6 partner mirror served through `/api/mirror`. Regenerate both with:

```bash
python pipeline/build_mirror.py --dir <folder of Comtrade CSVs> --out data/mirror_gaps.json
python pipeline/build_mirror.py --hs6 <folder of Comtrade CSVs> data/mirror_hs6.json
```

**`mirror_gaps.json`**

```jsonc
{
  "meta": {
    "demo": true,          // drives the amber "Demonstration mode" banner
    "year": 2024,
    "cif_factor": 1.08,    // FOB → CIF scaling applied to partner exports
    "vat_rate": 0.11,
    "reporters": [{ "code": 300, "name": "Greece", "has_data": true }],
    "signatures": { "under_invoicing": "Under-invoicing" },
    "duty_note": "…"
  },
  "totals":     { "x_cif": 0, "m": 0, "gap_pos": 0, "vat_floor": 0, "duty_loss": 0 },
  "sig_counts": { "under_invoicing": 61, "smuggling_risk": 4 },
  "corridors": [{
    "partner": 300, "partnerName": "Greece", "hs4": "2710", "hs2": "27",
    "chapter": "Mineral fuels", "label": "HS 2710",
    "x_fob": 0, "x_cif": 0, "m": 0,
    "gap": 0, "gap_pct": 37.5, "qty_gap_pct": 37.5,
    "signature": "smuggling_risk",
    "vat_floor": 0, "duty_loss_indicative": 0
  }]
}
```

**`mirror_monitor.json`** — `meta.months[]`, plus `partners[]` and `groups[]`,
each carrying a `series[]` aligned to those months and a `total`.

### Going live with real data

The partner side of the shipped dataset is **synthetic** — generated with
injected fraud signatures so every detection pattern is visible. That is why the
amber banner appears and why nothing here should be cited.

To switch to real reporter data: replace the partner-side figures in
`data/mirror_gaps.json` from your licensed trade-data source, recompute
`totals` / `sig_counts` / `corridors`, and set `meta.demo` to `false`. The banner
disappears on its own, and the Detective stops issuing its synthetic-data
caveat.

---

## Project layout

```
app/
  page.js                  server component — loads data, checks the session
  layout.js                fonts + global chrome
  globals.css              palette, editorial type, data-table styles
  login/page.js            the sign-in screen
  api/auth/login|logout/   session mint / clear
  api/detective/route.js   streaming Claude endpoint, grounded in the dataset
components/
  CustomsGap.jsx           hero + tab shell
  GapForensics.jsx         KPI band, corridor table, filters, methodology
  MonthlyMonitor.jsx       KPI band, line chart, per-group & per-partner tables
  TradeDetective.jsx       chat transcript, starters, streaming reader
  ui.jsx                   Stat / Panel / Chip / Select primitives
  DemoBanner.jsx  TopBar.jsx  Footer.jsx  Wordmark.jsx
lib/
  auth.js                  credentials, HMAC session sign/verify
  format.js                money / percent / count formatters
data/                      mirror_gaps.json, mirror_monitor.json
middleware.js              the gate
```

Restyling normally means editing `tailwind.config.js` (palette),
`app/globals.css` (type and tables) and `components/ui.jsx` (primitives).

---

## Reading the numbers honestly

Partner exports (FOB) are scaled by the `cif_factor` before comparison with
Lebanon's CIF imports. Residual gaps of ±10–15% are ordinary asymmetry — transit
timing, valuation, and hub attribution (goods routed via the UAE or Türkiye are
credited differently by each side). Corridors below $250K are suppressed as
noise.

Per the WCO, **mirror gaps identify where to investigate — they are not
findings of wrongdoing.** Declaration-level customs data is where specific
transactions and importers get identified, inside official channels. The revenue
figure is a VAT-only floor, not a duty-inclusive loss estimate.
