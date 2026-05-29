-- Track where each topic came from so the Drafts admin page can show provenance.
ALTER TABLE flashcard_topics
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('csv', 'pdf', 'manual', 'ai'));

-- Backfill historical PDF imports from pdf_jobs.
UPDATE flashcard_topics t
SET source_type = 'pdf'
FROM pdf_jobs j
WHERE j.topic_id = t.id
  AND t.source_type = 'manual';

CREATE INDEX IF NOT EXISTS idx_flashcard_topics_status_source
  ON flashcard_topics(status, source_type);
