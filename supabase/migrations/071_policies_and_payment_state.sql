-- Applied to production 2026-11-24 through MCP. Additive column, two FK indexes, tighter insert policies.
-- payment_events.processed_at: lets a provider retry finish a grant that failed
-- half-way. Apply before deploying the webhook change that uses it. Existing rows
-- are backfilled in the separate 072 data migration.
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER POLICY entitlements_select_own ON public.entitlements USING (user_id = (select auth.uid()));
CREATE INDEX IF NOT EXISTS idx_ldc_user_id ON public.listing_date_contributions (user_id);
CREATE INDEX IF NOT EXISTS idx_drive_content_files_source_id ON public.drive_content_files (source_id);

ALTER POLICY ldc_insert_own ON public.listing_date_contributions
  WITH CHECK ((select auth.uid()) = user_id AND status = 'pending'
              AND reviewed_at IS NULL AND reviewed_by IS NULL);
ALTER POLICY question_reports_insert ON public.question_reports
  WITH CHECK ((user_id IS NULL OR user_id = (select auth.uid())) AND status = 'new');
ALTER POLICY app_bug_reports_insert ON public.app_bug_reports
  WITH CHECK ((user_id IS NULL OR user_id = (select auth.uid())) AND status = 'new');
ALTER POLICY app_feedback_insert ON public.app_feedback
  WITH CHECK ((user_id IS NULL OR user_id = (select auth.uid())) AND status = 'new');

ALTER POLICY schools_public_insert ON public.schools
  WITH CHECK (source IN ('manual','places') AND deped_id IS NULL
              AND coalesce(cardinality(aliases), 0) = 0);
ALTER TABLE public.schools ADD CONSTRAINT schools_text_len CHECK (
  char_length(name) <= 160 AND char_length(city) <= 80
  AND char_length(province) <= 80 AND char_length(region) <= 80) NOT VALID;
ALTER TABLE public.schools VALIDATE CONSTRAINT schools_text_len;

ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.project_question_bank_to_flashcards() SET search_path = public, pg_temp;
