CREATE TABLE IF NOT EXISTS channels (
  id serial PRIMARY KEY,
  platform text NOT NULL,
  handle text NOT NULL,
  key text NOT NULL UNIQUE,
  live_url text NOT NULL,
  display_name text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recordings (
  id serial PRIMARY KEY,
  channel_id integer NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title text,
  status text NOT NULL,
  dir text NOT NULL,
  bytes bigint NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  error text
);
CREATE INDEX IF NOT EXISTS recordings_status_idx ON recordings(status);
