# Worklist storage

`lib/db.js` opens one table, `worklist_item` (`db/schema.sql`), and exposes two
calls: statuses for a year, and an upsert for one corridor.

- **On-prem:** SQLite through Node's built-in `node:sqlite` (Node 22.5 with
  `--experimental-sqlite`, or Node 23+ without a flag). The file lives at
  `data/worklist.sqlite` unless `WORKLIST_DB` says otherwise; it is gitignored.
- **Cloud (Vercel), no database attached:** still SQLite, but the deployment's
  filesystem is read-only outside `/tmp`, so `lib/db.js` detects `VERCEL` and
  writes there instead. This keeps the Worklist tab working with no setup,
  at the cost of the data being wiped whenever the serverless function cold-starts —
  fine for trying the tab, not for real recordkeeping.
- **Cloud (Vercel), for real:** Postgres (Vercel Postgres / Neon). Set
  `DATABASE_URL`; `lib/db.js` refuses to fall back to SQLite when it is set,
  and the Postgres driver is the next thing to wire behind the same two calls.

Either way, `GET /api/worklist` and `PATCH /api/worklist/:id` now catch
whatever this layer throws and answer with `{ error }` JSON instead of a bare
500 — see the route handlers. A frontend `.json()` call that used to fail with
"Unexpected end of JSON input" now gets a real message.

Roles are not modelled yet: any signed-in user can change a status, and the
session user is recorded in `updated_by`.
