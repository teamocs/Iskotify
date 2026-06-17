-- 042_early_access_status_email_fallback.sql
-- Harden email resolution: prefer the JWT 'email' claim, but fall back to
-- auth.users.email (always present for the authenticated user) so a just-signed-in
-- approved user can never be wrongly bounced if the claim isn't hydrated yet.
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
        WHERE lower(email) = lower(COALESCE(
          NULLIF(auth.jwt() ->> 'email', ''),
          (SELECT email FROM auth.users WHERE id = auth.uid())
        ))
        LIMIT 1),
      'none')
  END;
$$;
REVOKE ALL ON FUNCTION public.early_access_status() FROM public;
GRANT EXECUTE ON FUNCTION public.early_access_status() TO authenticated;
