-- 049_question_explanations.sql
--
-- Task E (detailed answer explanations): adds two columns to BOTH
-- upcat_questions and flashcards:
--   - option_explanations jsonb  — per-option "why this is wrong" rationale.
--     Aligned index-for-index with the `options` (or, for flashcards served
--     via the AI-distractor pipeline, `ai_options`) array; the entry at the
--     correct index is null (the existing `explanation` column already
--     covers "why the correct answer is correct"). Defaults to '[]' so
--     un-backfilled rows render nothing extra (mobile UI treats an empty/
--     missing array as "no per-option rationale available").
--   - strategy_tip text — a short formula-shortcut / mnemonic / pacing tip
--     shown as an optional chip below the review card. Defaults to '' so
--     un-backfilled rows render no chip.
--
-- NOTE — original brief named this migration 048_question_explanations.sql;
-- renumbered to 049 because Task D already claimed 048
-- (048_user_app_data_question_attempts.sql). Applied AFTER 048.
--
-- NOTE for whoever runs future content backfills (admin bulk "Generate
-- explanations" action, or manual SQL): populating option_explanations /
-- strategy_tip on an EXISTING row MUST also bump that row's updated_at
-- (e.g. `updated_at = now()`), otherwise the mobile app's incremental
-- cursor sync (services/sync.ts, `.gt('updated_at', since)`) will never
-- pull the new content down to already-synced devices. The admin bulk
-- action added alongside this migration does this automatically via the
-- upcat_questions_updated_at / flashcards updated_at triggers (a plain
-- UPDATE touches updated_at through those triggers already registered in
-- 016_upcat_questions.sql / the flashcards table's own trigger) — this
-- note exists so a future one-off SQL UPDATE doesn't accidentally bypass it
-- with something like `UPDATE ... ; -- SET updated_at explicitly NOT needed`
-- assumption; verify the trigger is present before assuming that.
--
-- Idempotent: safe to run multiple times / against tables that already have
-- these columns.

ALTER TABLE upcat_questions
  ADD COLUMN IF NOT EXISTS option_explanations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS strategy_tip text NOT NULL DEFAULT '';

ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS option_explanations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS strategy_tip text NOT NULL DEFAULT '';

-- Keep flashcards.option_explanations / strategy_tip in sync with the
-- existing ai_options invalidation trigger (012_flashcards_ai_distractors.sql):
-- when the admin edits question/answer, previously-cached AI distractors are
-- cleared because they no longer match — the option rationale/strategy tip
-- tied to those distractors is equally stale, so clear it too.
CREATE OR REPLACE FUNCTION clear_ai_options_on_content_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.question IS DISTINCT FROM OLD.question
     OR NEW.answer IS DISTINCT FROM OLD.answer THEN
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
-- Trigger itself (flashcards_ai_invalidate) already exists and points at this
-- function name — CREATE OR REPLACE above is sufficient, no DROP/CREATE TRIGGER needed.
