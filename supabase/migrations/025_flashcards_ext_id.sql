-- Stable external keys so the Question Bank → flashcards projection is idempotent.
-- flashcards.ext_id = upcat_questions.question_id
-- flashcard_topics.ext_id = 'qb:<subtest>:<topic>'

ALTER TABLE flashcards       ADD COLUMN IF NOT EXISTS ext_id text;
ALTER TABLE flashcard_topics ADD COLUMN IF NOT EXISTS ext_id text;

CREATE UNIQUE INDEX IF NOT EXISTS flashcards_ext_id_key       ON flashcards (ext_id)       WHERE ext_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS flashcard_topics_ext_id_key ON flashcard_topics (ext_id) WHERE ext_id IS NOT NULL;
