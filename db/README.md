# Worklist storage

`lib/db.js` opens one table, `worklist_item` (`db/schema.sql`), and exposes two
calls: statuses for a year, and an upsert for one corridor.

- **On-prem:** SQLite through Node's built-in `node:sqlite` (Node 22.5 with
  `--experimental-sqlite`, or Node 23+ without a flag). The file lives at
  `data/worklist.sqlite` unless `WORKLIST_DB` says otherwise; it is gitignored.
- **Cloud (Vercel):** Postgres (Vercel Postgres / Neon). Set `DATABASE_URL`;
  `lib/db.js` refuses to fall back to SQLite when it is set, and the Postgres
  driver is the next thing to wire behind the same two calls.

Roles are not modelled yet: any signed-in user can change a status, and the
session user is recorded in `updated_by`.
