-- Stores the Google OAuth refresh token per user so the admin token route can
-- mint short-lived Google access tokens for Calendar API calls. RLS: owner-only.
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gcc_select ON google_calendar_connections;
CREATE POLICY gcc_select ON google_calendar_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS gcc_insert ON google_calendar_connections;
CREATE POLICY gcc_insert ON google_calendar_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS gcc_update ON google_calendar_connections;
CREATE POLICY gcc_update ON google_calendar_connections
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS gcc_delete ON google_calendar_connections;
CREATE POLICY gcc_delete ON google_calendar_connections
  FOR DELETE USING (auth.uid() = user_id);
