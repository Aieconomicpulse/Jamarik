# data/live — documents for the Live data tab

Files uploaded on the Live data tab land here, one folder per country, named
by its code in `config/live_sources.json`. Files can also be copied in by hand:

```
data/live/300/   Greece
data/live/156/   China
```

A country is listed as **Connected** once its folder holds at least one file
of these kinds: `.csv`, `.tsv`, `.xlsx`, `.xls`, `.json`, `.txt`, `.md`,
`.html`, `.htm`, `.xml` (10 MB each at most).

- **Tables** (CSV, TSV, Excel, JSON lists of records) are shown exactly as
  received.
- **Everything else** is read by Claude. Each figure must be copied word for
  word from a quoted line of the document; `lib/live/verify.js` checks that on
  the server and rejects anything that does not match.

Everything in this folder except this file is gitignored: partner documents
stay on the server and never reach GitHub. On Vercel the bundle is read-only,
so uploads go to the temp directory instead and are lost on a cold start —
use an `http` connector there for anything that must persist, or set
`LIVE_DATA_DIR` to a mounted volume on-prem.
