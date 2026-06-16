-- 039_early_access_registrations.sql
--
-- Captures early-access APK sign-ups from the marketing landing page. The Android
-- early-access build is delivered by EMAIL (manually from the admin console), and
-- early access expires 2026-08-02 before the Google Play launch.
--
-- Writes go through the admin app's server (service-role) /api/early-access route,
-- and the admin console reads them with the service-role client — so, like
-- app_feedback (036), RLS is ENABLED with NO public policies (service-role only).

CREATE TABLE IF NOT EXISTS early_access_registrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    text NOT NULL DEFAULT '',
  email        text NOT NULL,
  school       text,
  grade_level  text,
  platform     text NOT NULL DEFAULT 'android',
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'expired')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS early_access_registrations_created_at_idx
  ON early_access_registrations (created_at DESC);

-- One registration per email (case-insensitive); the API route upserts on conflict.
CREATE UNIQUE INDEX IF NOT EXISTS early_access_registrations_email_uidx
  ON early_access_registrations (lower(email));

ALTER TABLE early_access_registrations ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT policies: only the service-role admin client reads or writes.
