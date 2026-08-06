-- 051_user_app_data_flashcard_srs.sql
--
-- Task H (flashcards spaced repetition): adds the flashcard_srs column to
-- user_app_data. Same reasoning as 048_user_app_data_question_attempts.sql —
-- user_app_data is NOT a freeform jsonb bag; it is a normal table with one
-- NAMED jsonb column per synced local table (see 037_user_app_data.sql).
-- Supabase's PostgREST upsert() rejects payload keys without a matching
-- column, so services/sync.ts's pushUserData() adding a `flashcard_srs` key
-- to its upsert payload requires this migration.
--
-- Idempotent: safe to run multiple times / against a table that already has
-- the column.

ALTER TABLE user_app_data ADD COLUMN IF NOT EXISTS flashcard_srs jsonb;
