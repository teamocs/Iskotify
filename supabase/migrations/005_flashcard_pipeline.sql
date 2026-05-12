-- Add draft/published status to topics
ALTER TABLE flashcard_topics
  ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Add draft/published status and exam-tag array to flashcards
ALTER TABLE flashcards
  ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

ALTER TABLE flashcards
  ADD COLUMN listing_slugs text[] NOT NULL DEFAULT '{}';

-- Job tracking table for async PDF processing
CREATE TABLE pdf_jobs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_url     text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  subject_id  uuid        REFERENCES flashcard_subjects(id),
  topic_id    uuid        REFERENCES flashcard_topics(id),
  card_count  int,
  error_msg   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pdf_jobs ENABLE ROW LEVEL SECURITY;
-- No public RLS policies — accessed via service role only

-- Create private storage bucket for uploaded PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'flashcard-pdfs',
  'flashcard-pdfs',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;
