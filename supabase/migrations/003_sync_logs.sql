CREATE TABLE sync_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  synced      int NOT NULL DEFAULT 0,
  skipped     int NOT NULL DEFAULT 0,
  closed      int NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warn', 'error')),
  message     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
