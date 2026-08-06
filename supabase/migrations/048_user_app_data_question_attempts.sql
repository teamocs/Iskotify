-- 048_user_app_data_question_attempts.sql
--
-- Task D (attempt telemetry foundation): adds the question_attempts column to
-- user_app_data. NOTE for whoever reviews the "does the jsonb bag need a
-- migration" question — user_app_data is NOT a single freeform jsonb bag; it
-- is a normal table with one NAMED jsonb column per synced local table (see
-- 037_user_app_data.sql). Supabase's PostgREST upsert() rejects payload keys
-- that don't have a matching column ("Could not find the 'question_attempts'
-- column of 'user_app_data' in the schema cache"), so services/sync.ts's
-- pushUserData() adding a `question_attempts` key to its upsert payload DOES
-- require this migration — the "usually no SQL change needed" assumption in
-- the task brief's Global Constraints does not hold for this table shape.
--
-- Idempotent: safe to run multiple times / against a table that already has
-- the column.

ALTER TABLE user_app_data ADD COLUMN IF NOT EXISTS question_attempts jsonb;
