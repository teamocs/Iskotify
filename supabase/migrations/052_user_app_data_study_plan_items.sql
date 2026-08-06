-- 052_user_app_data_study_plan_items.sql
--
-- Task I (personalized study plan): adds the study_plan_items column to
-- user_app_data. Same reasoning as 048_user_app_data_question_attempts.sql /
-- 051_user_app_data_flashcard_srs.sql — user_app_data is NOT a freeform
-- jsonb bag; it is a normal table with one NAMED jsonb column per synced
-- local table (see 037_user_app_data.sql). Supabase's PostgREST upsert()
-- rejects payload keys without a matching column, so services/sync.ts's
-- pushUserData() adding a `study_plan_items` key to its upsert payload
-- requires this migration.
--
-- Note: the daily-reminder-hour / weekly-summary-toggle preferences added
-- alongside this table live as plain columns on the LOCAL user_settings row,
-- which already rides inside the existing `settings` jsonb column — no
-- migration needed for those two fields.
--
-- Idempotent: safe to run multiple times / against a table that already has
-- the column.

ALTER TABLE user_app_data ADD COLUMN IF NOT EXISTS study_plan_items jsonb;
