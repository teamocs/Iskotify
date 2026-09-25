-- 061_sync_delta_indexes.sql
--
-- apps/mobile/services/sync.ts pulls every catalog table with
-- `.gt('updated_at', since)` on each launch, but only the flashcard trio got an
-- updated_at index (006). pg_stat_user_tables (2026-09-26) showed every other
-- synced table seq-scanning on each sync. Plain btree indexes on updated_at
-- turn those into index range scans. All tables are small (≤ ~3 MB), so a
-- normal CREATE INDEX takes a brief lock only.
--
-- Also:
-- - flashcards.listing_slugs: sync.ts fetchFlashcardsForSlugs filters with
--   `.contains('listing_slugs', [slug])` (text[] @>), which needs GIN.
-- - option_explanations = '[]': the admin bulk-explanations backfill filters
--   and counts on it; partial indexes shrink as rows are filled in (same
--   pattern as flashcards_unenhanced_idx in 012).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'listings', 'admissions_updates', 'upcat_questions', 'upcat_facts', 'upcat_cutoffs',
    'career_courses', 'career_countries', 'career_programs', 'ai_career_impact',
    'career_destinations', 'career_facts', 'tertiary_schools', 'university_profiles',
    'course_school_rankings', 'course_school_quality', 'bar_results', 'course_taxonomy_map',
    'exam_skill_categories', 'exam_blueprints', 'exam_blueprint_sections', 'exam_course_notes'
  ] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (updated_at)', 'idx_' || t || '_updated_at', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_flashcards_listing_slugs_gin
  ON flashcards USING GIN (listing_slugs);

CREATE INDEX IF NOT EXISTS idx_upcat_questions_unexplained
  ON upcat_questions (question_id) WHERE option_explanations = '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_flashcards_unexplained
  ON flashcards (id) WHERE option_explanations = '[]'::jsonb;
