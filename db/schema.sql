-- One row per corridor an officer has touched. Rows are created on first
-- status change, keyed by "<year>-<partner>-<hs4>", so the worklist itself
-- needs no seeding: every corridor without a row is "new".
CREATE TABLE IF NOT EXISTS worklist_item (
  id            TEXT PRIMARY KEY,
  year          INTEGER NOT NULL,
  partner       INTEGER NOT NULL,
  hs4           TEXT    NOT NULL,
  hs6           TEXT,
  status        TEXT    NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'review', 'audited', 'recovered')),
  recovered_usd REAL,
  note          TEXT,
  updated_by    TEXT,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS worklist_item_year ON worklist_item (year);
