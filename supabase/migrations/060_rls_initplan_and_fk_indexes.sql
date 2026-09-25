-- 060_rls_initplan_and_fk_indexes.sql
--
-- Clears the Supabase performance advisor's WARN findings (2026-09-26) without
-- changing who can read or write anything.
--
-- 1. auth_rls_initplan: `auth.uid()` inside a policy is re-evaluated for every
--    row; `(select auth.uid())` is evaluated once per statement. Same result.
-- 2. multiple_permissive_policies: the admin FOR ALL policies overlapped the
--    public read policies on SELECT, so both ran on every read. Reads are
--    already open to everyone via the *_read policies; the admin policies now
--    cover only INSERT / UPDATE / DELETE.
-- 3. unindexed_foreign_keys: covering indexes for every FK the advisor listed
--    (joins and ON DELETE checks). Unused-index findings are left alone: the
--    project's traffic is too low for "never used" to mean "not needed".

-- ── 1. Owner policies ─────────────────────────────────────────────────────────
ALTER POLICY ldc_insert_own ON listing_date_contributions WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY ldc_select_own ON listing_date_contributions USING ((select auth.uid()) = user_id);

ALTER POLICY sessions_owner_insert ON practice_sessions WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY sessions_owner_select ON practice_sessions USING ((select auth.uid()) = user_id);
ALTER POLICY sessions_owner_update ON practice_sessions USING ((select auth.uid()) = user_id);

ALTER POLICY progress_owner_insert ON user_flashcard_progress WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY progress_owner_select ON user_flashcard_progress USING ((select auth.uid()) = user_id);
ALTER POLICY progress_owner_update ON user_flashcard_progress USING ((select auth.uid()) = user_id);

ALTER POLICY saved_owner_insert ON user_saved_listings WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY saved_owner_select ON user_saved_listings USING ((select auth.uid()) = user_id);
ALTER POLICY saved_owner_delete ON user_saved_listings USING ((select auth.uid()) = user_id);

ALTER POLICY "users can manage their own data" ON user_app_data
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── Listings admin writes ─────────────────────────────────────────────────────
ALTER POLICY listings_admin_insert ON listings WITH CHECK (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));
ALTER POLICY listings_admin_update ON listings USING (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));
ALTER POLICY listings_admin_delete ON listings USING (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- ── 2. Admin FOR ALL → write-only policies (reads stay on *_read) ─────────────
DO $$
DECLARE
  t text;
  is_admin constant text :=
    'EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = ''admin'')';
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_chat_config','exam_blueprints','exam_blueprint_sections','exam_course_notes','exam_skill_categories'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_admin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_admin_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_admin_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_admin_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (%s)', t || '_admin_insert', t, is_admin);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || '_admin_update', t, is_admin, is_admin);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (%s)', t || '_admin_delete', t, is_admin);
  END LOOP;
END $$;

-- ── 3. Covering indexes for foreign keys ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_app_bug_reports_user_id ON app_bug_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_app_feedback_user_id ON app_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_topics_subject_id ON flashcard_topics (subject_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_topic_id ON flashcards (topic_id);
CREATE INDEX IF NOT EXISTS idx_pdf_jobs_subject_id ON pdf_jobs (subject_id);
CREATE INDEX IF NOT EXISTS idx_pdf_jobs_topic_id ON pdf_jobs (topic_id);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_topic_id ON practice_sessions (topic_id);
CREATE INDEX IF NOT EXISTS idx_question_flag_dismissals_dismissed_by ON question_flag_dismissals (dismissed_by);
CREATE INDEX IF NOT EXISTS idx_question_reports_user_id ON question_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_user_flashcard_progress_flashcard_id ON user_flashcard_progress (flashcard_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_listings_listing_id ON user_saved_listings (listing_id);
