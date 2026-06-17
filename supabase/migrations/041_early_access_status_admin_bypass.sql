-- 041_early_access_status_admin_bypass.sql
-- Admins (profiles.role='admin') always pass the early-access gate, even without
-- a registration row — otherwise the owner would lock themselves out of the web app.
-- (Applied to prod dtugrsbarruizgzowgso via MCP; this file mirrors it for history.)
CREATE OR REPLACE FUNCTION public.early_access_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN 'sent'
    ELSE COALESCE(
      (SELECT status FROM early_access_registrations
        WHERE lower(email) = lower(auth.jwt() ->> 'email')
        LIMIT 1),
      'none')
  END;
$$;
REVOKE ALL ON FUNCTION public.early_access_status() FROM public;
GRANT EXECUTE ON FUNCTION public.early_access_status() TO authenticated;
