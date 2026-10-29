-- Synthetic snapshot of RSVP's patched 0.12 record/FTS/cursor shapes.
-- No production records or identifiers. Other additive tables are made by init.
CREATE TABLE _contrail_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO _contrail_meta VALUES ('schema_fingerprint', 'legacy-patched-0.12');
CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK (id = 1), time_us INTEGER NOT NULL);
INSERT INTO cursor VALUES (1, 1000000);
CREATE TABLE identities (did TEXT PRIMARY KEY, handle TEXT, pds TEXT, resolved_at INTEGER NOT NULL);
INSERT INTO identities VALUES ('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', 'example.test', 'https://pds.example', 1);
CREATE TABLE records_event (
  uri TEXT PRIMARY KEY, did TEXT NOT NULL, rkey TEXT NOT NULL, cid TEXT,
  record TEXT NOT NULL, time_us INTEGER NOT NULL, indexed_at INTEGER NOT NULL,
  rsvps_count INTEGER NOT NULL DEFAULT 0,
  rsvps_going_count INTEGER NOT NULL DEFAULT 0,
  rsvps_interested_count INTEGER NOT NULL DEFAULT 0,
  rsvps_notgoing_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO records_event (uri, did, rkey, cid, record, time_us, indexed_at) VALUES (
  'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/community.lexicon.calendar.event/one',
  'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', 'one', 'oldcid',
  '{"$type":"community.lexicon.calendar.event","name":"Jazz night","startsAt":"2099-01-01T12:00:00Z"}', 1000000, 1000000
);
CREATE TABLE fts_event_rows (id INTEGER PRIMARY KEY, uri TEXT NOT NULL UNIQUE);
CREATE VIRTUAL TABLE fts_event USING fts5(content);
INSERT INTO fts_event_rows (id, uri) VALUES (1, 'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/community.lexicon.calendar.event/one');
INSERT INTO fts_event (rowid, content) VALUES (1, 'Jazz night');
-- An app-owned table must not be dropped during projection schema upgrades.
CREATE TABLE bot_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO bot_state VALUES ('cursor', 'keep-me');
