-- 012_flashcards_ai_distractors.sql
-- Adds Gemini-generated MC distractor cache to the flashcards table.
-- ai_options holds the 4 final-shuffled choices; ai_correct_index points at
-- the correct one. Both NULL means "not yet enhanced — admin backfill needed".

ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS ai_options       text[];
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS ai_correct_index int CHECK (ai_correct_index IS NULL OR (ai_correct_index BETWEEN 0 AND 3));
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS ai_explanation   text;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS ai_enhanced_at   timestamptz;

-- Length constraint: a malformed Gemini response can't pollute the cache.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'flashcards_ai_options_len4'
  ) THEN
    ALTER TABLE flashcards
      ADD CONSTRAINT flashcards_ai_options_len4
      CHECK (ai_options IS NULL OR array_length(ai_options, 1) = 4);
  END IF;
END $$;

-- Partial index: backfill query "WHERE ai_enhanced_at IS NULL" stays O(unenhanced).
CREATE INDEX IF NOT EXISTS flashcards_unenhanced_idx
  ON flashcards (id) WHERE ai_enhanced_at IS NULL;

-- Auto-invalidate cached distractors when admin edits the question or answer.
CREATE OR REPLACE FUNCTION clear_ai_options_on_content_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.question IS DISTINCT FROM OLD.question
     OR NEW.answer IS DISTINCT FROM OLD.answer THEN
    NEW.ai_options       := NULL;
    NEW.ai_correct_index := NULL;
    NEW.ai_explanation   := NULL;
    NEW.ai_enhanced_at   := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flashcards_ai_invalidate ON flashcards;
CREATE TRIGGER flashcards_ai_invalidate
  BEFORE UPDATE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION clear_ai_options_on_content_change();
