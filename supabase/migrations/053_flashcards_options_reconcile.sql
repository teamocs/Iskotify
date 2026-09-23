-- 053_flashcards_options_reconcile.sql
--
-- flashcards.options / correct_answer_index were added on 2026-05-23 directly in
-- the SQL editor (docs/superpowers/plans/2026-05-23-mcq-school-flashcard-restructure.md,
-- Task 4) and never checked in, so this folder did not describe the live table.
-- This records them with the exact live definitions. IF NOT EXISTS makes it a
-- no-op on the live project; it only matters for a fresh database.

ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS options text[] NOT NULL DEFAULT '{}';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS correct_answer_index integer;
