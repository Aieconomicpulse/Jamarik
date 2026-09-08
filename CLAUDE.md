This is Jamarik, a Next.js 15 (App Router, JavaScript, no TypeScript) portal with a
Python/pandas pipeline in pipeline/. Rules:
- Work from FIXPLAN.md. Implement ONE ticket per task. Do not start the next ticket.
- Never hand-edit data/*.json. Regenerate with: python pipeline/estimate.py --gaps data/mirror_gaps.json --hs6 data/mirror_hs6.json
- Constants (bands, CIF factor, VAT rate, thresholds) live in pipeline/build_mirror.py and lib/losses.js — keep them equal; Ticket 8 unifies them.
- Keep the UI copy in the existing voice: plain sentences, no exclamation marks, figures in $ with the money() formatter.
- Before finishing a ticket run: python -m pytest tests -q && npm run build. Paste the output.
- Commit message: "Ticket N: <title>".
