-- Derived-coordinate cache for address-only events + the geocode job's worklist
-- and done-marker (Meili can't filter "missing _geo", so we track resolution
-- ourselves). Idempotent / restartable. Applied once to the openmeet-atmo D1;
-- the sink reads it, the external geocode job writes it.
CREATE TABLE IF NOT EXISTS geocode_cache (
  address_norm TEXT PRIMARY KEY,   -- normalized address key (address-norm.ts)
  lat          REAL,               -- NULL when unresolved (negative cache)
  lng          REAL,
  precision    TEXT,               -- provider-reported granularity
  source       TEXT NOT NULL,      -- e.g. 'locationiq' / 'nominatim'
  geocoded_at  INTEGER NOT NULL,   -- epoch ms
  fail_count   INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT
);
