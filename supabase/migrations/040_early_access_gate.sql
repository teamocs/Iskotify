-- 040_early_access_gate.sql
-- Approved-account gate + admin approve/send flow for early access.
-- (Applied to prod dtugrsbarruizgzowgso via MCP; this file mirrors it for history.)

-- 1) Widen status to include 'approved'; track approval/send timestamps.
ALTER TABLE early_access_registrations
  DROP CONSTRAINT IF EXISTS early_access_registrations_status_check;
ALTER TABLE early_access_registrations
  ADD CONSTRAINT early_access_registrations_status_check
  CHECK (status IN ('pending', 'approved', 'sent', 'expired'));
ALTER TABLE early_access_registrations
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE early_access_registrations
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- 2) Per-user status RPC. SECURITY DEFINER so it can read the RLS-locked table,
--    but it only ever returns the CALLING user's own status (matched on their
--    JWT email) — never the whole table. Returns 'none' if not registered.
CREATE OR REPLACE FUNCTION public.early_access_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT status FROM early_access_registrations
      WHERE lower(email) = lower(auth.jwt() ->> 'email')
      LIMIT 1),
    'none'
  );
$$;
REVOKE ALL ON FUNCTION public.early_access_status() FROM public;
GRANT EXECUTE ON FUNCTION public.early_access_status() TO authenticated;

-- 3) Private bucket for the early-access APK. Service-role uploads; downloads go
--    through short-lived signed URLs (which bypass RLS). No public policies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('early-access-apk', 'early-access-apk', false)
ON CONFLICT (id) DO NOTHING;
