-- Allow subjects to be deleted even when legacy pdf_jobs rows reference them.
-- The previous FK used the default NO ACTION rule (RESTRICT), so attempting to
-- delete any subject that ever had a PDF job blew up with code 23503.
-- pdf_jobs is read-only legacy data — losing the reference is acceptable.

ALTER TABLE pdf_jobs
  DROP CONSTRAINT IF EXISTS pdf_jobs_subject_id_fkey;

ALTER TABLE pdf_jobs
  ADD CONSTRAINT pdf_jobs_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES flashcard_subjects(id)
  ON DELETE SET NULL;

ALTER TABLE pdf_jobs
  DROP CONSTRAINT IF EXISTS pdf_jobs_topic_id_fkey;

ALTER TABLE pdf_jobs
  ADD CONSTRAINT pdf_jobs_topic_id_fkey
  FOREIGN KEY (topic_id) REFERENCES flashcard_topics(id)
  ON DELETE SET NULL;
