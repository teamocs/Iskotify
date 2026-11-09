-- 070_security_rls_hardening.sql
--
-- STATUS: NOT APPLIED to any database. Run it through the project's migration
-- process after preflight (do not paste it into prod ad hoc).
--
-- (a) sync_logs (created in 003 with no RLS) is readable and writable by anon
--     and authenticated through PostgREST. Its only users are service-role
--     code in the admin app:
--       apps/admin/app/api/admin/listings/import/[id]/publish/route.ts (insert)
--       apps/admin/lib/admin/inboxCounts.ts (select, via the db that
--         apps/admin/app/admin/page.tsx builds with createServerClient())
--     apps/mobile and packages/ never reference it. Service role bypasses RLS,
--     so enabling RLS with no policies plus REVOKE changes nothing for them.
--
-- (b) The INSERT policies from 035 (question_reports) and 036 (app_bug_reports,
--     app_feedback) were WITH CHECK (true), so a client could file a row with
--     any other user's id in user_id. Now user_id must be NULL or the caller's
--     own id. Mobile (apps/mobile/services/questionReports.ts and
--     appFeedback.ts) always sends session.user.id, or null when signed out,
--     so every current path satisfies this.
--     One edge: a client holding a stale session whose request goes out with
--     the anon key (auth.uid() is NULL) while user_id is non-null would now be
--     rejected. All three client paths already swallow insert errors (the
--     question report stays queued locally and is retried on next launch).

-- (a)
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sync_logs FROM anon, authenticated;

-- (b)
DROP POLICY IF EXISTS question_reports_insert ON public.question_reports;
CREATE POLICY question_reports_insert ON public.question_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = (select auth.uid()));

DROP POLICY IF EXISTS app_bug_reports_insert ON public.app_bug_reports;
CREATE POLICY app_bug_reports_insert ON public.app_bug_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = (select auth.uid()));

DROP POLICY IF EXISTS app_feedback_insert ON public.app_feedback;
CREATE POLICY app_feedback_insert ON public.app_feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = (select auth.uid()));
