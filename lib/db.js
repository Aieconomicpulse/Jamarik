// Worklist storage — the only file that knows where statuses live.
//
// SQLite on-prem through Node's built-in driver; Postgres in the cloud behind
// DATABASE_URL (not wired yet — see db/README.md). Everything else calls the
// two functions below and never sees SQL.

import fs from "node:fs";
import path from "node:path";

const STATUSES = ["new", "review", "audited", "recovered"];
let db = null;

async function open() {
  if (db) return db;
  if (process.env.DATABASE_URL) {
    throw new Error("Jamarik: DATABASE_URL is set but the Postgres driver is not wired yet — see db/README.md.");
  }
  const { DatabaseSync } = await import(/* webpackIgnore: true */ "node:sqlite");
  const file = process.env.WORKLIST_DB || path.join(process.cwd(), "data", "worklist.sqlite");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
  return db;
}

export const itemId = (year, partner, hs4) => `${year}-${partner}-${hs4}`;

/** Every touched corridor for one year, keyed by id. */
export async function statusesFor(year) {
  const d = await open();
  const rows = d.prepare("SELECT * FROM worklist_item WHERE year = ?").all(Number(year));
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

/** Create or update one corridor's row. Returns the stored row. */
export async function upsertItem({ id, year, partner, hs4, hs6 = null, status, recovered_usd = null, note = null, updated_by = null }) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`);
  const d = await open();
  d.prepare(`
    INSERT INTO worklist_item (id, year, partner, hs4, hs6, status, recovered_usd, note, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status, recovered_usd = excluded.recovered_usd, note = excluded.note,
      updated_by = excluded.updated_by, updated_at = datetime('now')
  `).run(id, Number(year), Number(partner), hs4, hs6, status, recovered_usd, note, updated_by);
  return d.prepare("SELECT * FROM worklist_item WHERE id = ?").get(id);
}

export { STATUSES };
