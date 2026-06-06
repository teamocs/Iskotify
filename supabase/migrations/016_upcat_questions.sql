CREATE TABLE IF NOT EXISTS upcat_passages (
  set_id text PRIMARY KEY,
  subtest text NOT NULL,
  passage_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upcat_questions (
  question_id text PRIMARY KEY,
  subtest text NOT NULL,
  main_subject text,
  topic text,
  subtopic text,
  question_format text,
  cognitive_level text,
  difficulty text,
  curriculum_alignment text,
  question_text text NOT NULL,
  options text[] NOT NULL,
  correct_index int NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation text NOT NULL,
  set_id text REFERENCES upcat_passages(set_id),
  set_position int,
  has_visual boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upcat_questions_subtest ON upcat_questions(subtest, status);
CREATE INDEX IF NOT EXISTS idx_upcat_questions_set ON upcat_questions(set_id);

ALTER TABLE upcat_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE upcat_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upcat_passages_read ON upcat_passages;
CREATE POLICY upcat_passages_read ON upcat_passages FOR SELECT USING (true);
DROP POLICY IF EXISTS upcat_questions_read ON upcat_questions;
CREATE POLICY upcat_questions_read ON upcat_questions FOR SELECT USING (true);
