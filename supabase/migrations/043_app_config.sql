-- 043_app_config.sql
-- Generic key/value config table (service-role only). First use: the early-access
-- APK download URL. On Supabase Free the 186MB APK can't be stored (50MB cap), so
-- it's hosted off-Supabase (GitHub Releases / Drive) and the admin stores the link here.
-- (Applied to prod dtugrsbarruizgzowgso via MCP; this file mirrors it for history.)
CREATE TABLE IF NOT EXISTS app_config (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
-- No public policies: only the service-role admin client reads/writes.
