-- Local demonstration data is isolated from real family accounts and history.
CREATE TABLE IF NOT EXISTS demo_worlds (
  id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
