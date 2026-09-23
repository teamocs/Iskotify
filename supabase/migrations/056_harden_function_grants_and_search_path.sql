-- 056_harden_function_grants_and_search_path.sql
--
-- Clears three Supabase security-advisor warnings (2026-09-24).
--
-- 1. search_path. 030 pinned clear_ai_options_on_content_change(), but 050
--    recreated it with CREATE OR REPLACE and no SET clause, which silently
--    dropped the pin; clear_stale_question_explanations() (050) never had one.
--    Any future CREATE OR REPLACE of these must repeat the SET clause (or
--    re-run the ALTER below).
ALTER FUNCTION public.clear_ai_options_on_content_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.clear_stale_question_explanations() SET search_path = public, pg_temp;

-- 2. early_access_status() is a SECURITY DEFINER leftover of the early-access
--    lockout, removed from the app on 2026-08-06 (nothing calls it; see
--    apps/mobile/app/__tests__/noLockoutGate.test.ts). It was still executable
--    by anon and authenticated through /rest/v1/rpc. Kept (not dropped) so the
--    change is reversible; only the service role can call it now.
REVOKE EXECUTE ON FUNCTION public.early_access_status() FROM PUBLIC, anon, authenticated;
