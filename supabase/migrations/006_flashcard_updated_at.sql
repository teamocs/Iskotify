-- Add updated_at column to flashcard tables for delta sync

ALTER TABLE flashcard_subjects
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE flashcard_topics
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE flashcards
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER flashcard_subjects_updated_at
  BEFORE UPDATE ON flashcard_subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER flashcard_topics_updated_at
  BEFORE UPDATE ON flashcard_topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER flashcards_updated_at
  BEFORE UPDATE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX ON flashcard_subjects(updated_at);
CREATE INDEX ON flashcard_topics(updated_at);
CREATE INDEX ON flashcards(updated_at);
