CREATE TABLE IF NOT EXISTS views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL,
  mode TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
