// Worklist storage — the only file that knows where statuses live.
//
// SQLite on-prem through Node's built-in driver; Postgres in the cloud behind
// DATABASE_URL (not wired yet — see db/README.md). Everything else calls the
// two functions below and never sees SQL.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATUSES = ["new", "review", "audited", "recovered"];
let db = null;

// Serverless platforms (Vercel included) ship a read-only filesystem except
// for the OS temp directory. process.cwd() sits inside the read-only bundle
// there, so writing data/worklist.sqlite next to the source throws EROFS on
// every request. /tmp is writable but wiped between cold starts, which is
// fine for now — the durable answer is the Postgres driver below — but it
// keeps the tab working instead of 500ing on a platform README.md never told
// the reader to configure.
const ON_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

async function open() {
  if (db) return db;
  if (process.env.DATABASE_URL) {
    throw new Error("Jamarik: DATABASE_URL is set but the Postgres driver is not wired yet — see db/README.md.");
  }
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import(/* webpackIgnore: true */ "node:sqlite"));
  } catch (err) {
    throw new Error(`Jamarik: node:sqlite is unavailable on this runtime (needs Node 22.5+) — ${err.message}`);
  }
  const file = process.env.WORKLIST_DB || path.join(ON_SERVERLESS ? os.tmpdir() : process.cwd(), "data", "worklist.sqlite");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    db = new DatabaseSync(file);
    db.exec(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
  } catch (err) {
    db = null;
    throw new Error(`Jamarik: could not open the worklist database at ${file} — ${err.message}`);
  }
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
