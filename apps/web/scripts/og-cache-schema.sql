-- Apply once before deploying. Separate from Contrail's managed schema.
CREATE TABLE IF NOT EXISTS og_generation_budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  day TEXT NOT NULL,
  cycle TEXT NOT NULL,
  daily_attempts INTEGER NOT NULL DEFAULT 0,
  cycle_attempts INTEGER NOT NULL DEFAULT 0,
  last_token TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO og_generation_budget (id, day, cycle) VALUES (1, '', '');

CREATE TABLE IF NOT EXISTS og_generation_leases (
  image_key TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS og_generation_leases_expiry ON og_generation_leases (expires_at);
