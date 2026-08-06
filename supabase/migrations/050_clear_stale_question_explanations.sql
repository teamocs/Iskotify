-- 050_clear_stale_question_explanations.sql
--
-- Task E follow-up (reviewed finding, CRITICAL): neither PATCH
-- /api/upcat-questions/[id] (whitelists question_text/options/correct_index
-- edits) nor the CSV re-import upsert (importUpcatCore.ts, upsert onConflict
-- question_id) clears option_explanations/strategy_tip when the options
-- array (or correct_index, or question_text) changes. ReviewCard on mobile
-- only checks PRESENCE of option_explanations, not correspondence to the
-- current options — so a student could be shown a "why this is wrong"
-- rationale describing an option that no longer exists at that index, or a
-- strategy tip that no longer matches the question.
--
-- Fix: mirror the EXISTING precedent — flashcards already has a
-- `clear_ai_options_on_content_change` BEFORE UPDATE trigger
-- (012_flashcards_ai_distractors.sql, extended in
-- 049_question_explanations.sql to also clear option_explanations/
-- strategy_tip). Add an equivalent trigger on upcat_questions. A DB trigger
-- covers ALL write paths (admin PATCH, CSV import upsert, and any future
-- one) — Postgres fires BEFORE UPDATE triggers for the conflicting row on
-- `INSERT ... ON CONFLICT DO UPDATE` too, so the CSV upsert path is covered
-- without any application-code changes.
--
-- ALSO: the flashcards trigger only ever watched `question`/`answer` for
-- invalidation — it never watched the admin-editable `options` column
-- (distinct from the AI-generated `ai_options` cache; see
-- apps/admin/app/api/flashcards/cards/route.ts SELECT list). Extend it so a
-- change to `options` also invalidates the cached ai_* fields and the
-- option_explanations/strategy_tip tied to them.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS/CREATE
-- TRIGGER are both safe to run multiple times.

-- ── upcat_questions: new trigger, same shape/naming convention as flashcards' ──
CREATE OR REPLACE FUNCTION clear_stale_question_explanations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.options IS DISTINCT FROM OLD.options
     OR NEW.correct_index IS DISTINCT FROM OLD.correct_index
     OR NEW.question_text IS DISTINCT FROM OLD.question_text THEN
    NEW.option_explanations := '[]'::jsonb;
    NEW.strategy_tip        := '';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS upcat_questions_clear_explanations ON upcat_questions;
CREATE TRIGGER upcat_questions_clear_explanations
  BEFORE UPDATE ON upcat_questions
  FOR EACH ROW EXECUTE FUNCTION clear_stale_question_explanations();

-- ── flashcards: extend clear_ai_options_on_content_change to also watch `options` ──
CREATE OR REPLACE FUNCTION clear_ai_options_on_content_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.question IS DISTINCT FROM OLD.question
     OR NEW.answer IS DISTINCT FROM OLD.answer
     OR NEW.options IS DISTINCT FROM OLD.options THEN
    NEW.ai_options       := NULL;
    NEW.ai_correct_index := NULL;
    NEW.ai_explanation   := NULL;
    NEW.ai_enhanced_at   := NULL;
    NEW.option_explanations := '[]'::jsonb;
    NEW.strategy_tip        := '';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Trigger itself (flashcards_ai_invalidate, created in
-- 012_flashcards_ai_distractors.sql) already points at this function name —
-- CREATE OR REPLACE above is sufficient, no DROP/CREATE TRIGGER needed.
