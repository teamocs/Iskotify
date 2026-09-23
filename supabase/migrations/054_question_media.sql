-- 054_question_media.sql
--
-- Questions can now carry a figure (circuit diagram, infographic, comic-panel
-- sequence, chart). The image itself lives in the public `question-media`
-- Storage bucket; the row stores only its URL plus the metadata the mobile app
-- needs to render it without layout shift (width/height) and accessibly (alt).
--
-- has_visual already exists on upcat_questions. From now on
--   has_visual = true AND image_url IS NULL
-- means "the question refers to a figure we do not have" — the mobile exam and
-- quiz builders exclude those rows so a student never sees "refer to the
-- diagram" with no diagram.

ALTER TABLE upcat_questions ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE upcat_questions ADD COLUMN IF NOT EXISTS image_alt text;
ALTER TABLE upcat_questions ADD COLUMN IF NOT EXISTS image_width int;
ALTER TABLE upcat_questions ADD COLUMN IF NOT EXISTS image_height int;

ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS image_alt text;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS image_width int;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS image_height int;

-- Publishing a Drive file scans every published question for duplicates
-- (apps/admin/lib/kb/publishKbFile.ts); idx_upcat_questions_subtest leads with
-- subtest, so it cannot serve a status-only filter.
CREATE INDEX IF NOT EXISTS idx_upcat_questions_published
  ON upcat_questions (question_id) WHERE status = 'published';

-- ── Storage: public bucket for question figures ───────────────────────────────
-- public = true so the app (including the offline-cached web build) can load a
-- figure straight from its public URL. Writes happen only through the admin
-- service-role client (Drive sync), which bypasses RLS, so no INSERT policy is
-- granted to anon/authenticated. Objects are content-addressed
-- (<sha256>.<ext>), so a re-sync never duplicates a file.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-media',
  'question-media',
  true,
  5242880, -- 5 MB
  -- Raster only: no SVG, which can carry script in a public bucket.
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "question_media_public_read" ON storage.objects;
CREATE POLICY "question_media_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'question-media');

-- ── Projection: carry figures into the flashcard surfaces ─────────────────────
-- Same body as 034, plus the four image columns. CREATE OR REPLACE preserves the
-- function's ACLs (service_role only, per 026/029).
CREATE OR REPLACE FUNCTION project_question_bank_to_flashcards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam_slugs text[];
  v_subjects int;
  v_topics int;
  v_cards int;
BEGIN
  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY['upcat']::text[])
  INTO v_exam_slugs
  FROM listings
  WHERE type = 'exam';

  INSERT INTO flashcard_subjects (name, listing_slugs, updated_at)
  SELECT DISTINCT q.subtest, v_exam_slugs, now()
  FROM upcat_questions q
  WHERE q.status = 'published'
  ON CONFLICT (name) DO UPDATE
    SET listing_slugs = EXCLUDED.listing_slugs, updated_at = now();

  INSERT INTO flashcard_topics (ext_id, subject_id, name, status, source_type, updated_at)
  SELECT DISTINCT
    'qb:' || q.subtest || ':' || COALESCE(NULLIF(q.topic, ''), NULLIF(q.main_subject, ''), q.subtest),
    s.id,
    COALESCE(NULLIF(q.topic, ''), NULLIF(q.main_subject, ''), q.subtest),
    'published', 'csv', now()
  FROM upcat_questions q
  JOIN flashcard_subjects s ON s.name = q.subtest
  WHERE q.status = 'published'
  ON CONFLICT (ext_id) WHERE ext_id IS NOT NULL DO UPDATE
    SET subject_id = EXCLUDED.subject_id, name = EXCLUDED.name,
        status = 'published', updated_at = now();

  INSERT INTO flashcards (
    ext_id, topic_id, question, answer, explanation, options,
    correct_answer_index, status, listing_slugs,
    image_url, image_alt, image_width, image_height, updated_at
  )
  SELECT
    q.question_id,
    t.id,
    CASE WHEN q.set_id IS NOT NULL AND p.passage_text IS NOT NULL
         THEN p.passage_text || E'\n\n' || q.question_text
         ELSE q.question_text END,
    q.options[q.correct_index + 1],
    q.explanation,
    q.options,
    q.correct_index,
    'published',
    v_exam_slugs,
    q.image_url, q.image_alt, q.image_width, q.image_height,
    now()
  FROM upcat_questions q
  JOIN flashcard_subjects s ON s.name = q.subtest
  JOIN flashcard_topics t
    ON t.ext_id = 'qb:' || q.subtest || ':' || COALESCE(NULLIF(q.topic, ''), NULLIF(q.main_subject, ''), q.subtest)
  LEFT JOIN upcat_passages p ON p.set_id = q.set_id
  WHERE q.status = 'published'
    -- A question whose figure is missing must not reach the flashcard quiz either.
    AND NOT (q.has_visual AND q.image_url IS NULL)
  ON CONFLICT (ext_id) WHERE ext_id IS NOT NULL DO UPDATE
    SET topic_id = EXCLUDED.topic_id,
        question = EXCLUDED.question,
        answer = EXCLUDED.answer,
        explanation = EXCLUDED.explanation,
        options = EXCLUDED.options,
        correct_answer_index = EXCLUDED.correct_answer_index,
        status = 'published',
        listing_slugs = EXCLUDED.listing_slugs,
        image_url = EXCLUDED.image_url,
        image_alt = EXCLUDED.image_alt,
        image_width = EXCLUDED.image_width,
        image_height = EXCLUDED.image_height,
        updated_at = now();

  -- 4. Sweep: a projected card whose source question is no longer eligible
  --    (unpublished, or its figure went missing) must leave the quiz too.
  --    Only cards whose ext_id is a question_id are touched.
  UPDATE flashcards f
  SET status = 'draft', updated_at = now()
  FROM upcat_questions q
  WHERE f.ext_id = q.question_id
    AND f.status = 'published'
    AND (q.status <> 'published' OR (q.has_visual AND q.image_url IS NULL));

  SELECT count(*) INTO v_subjects FROM flashcard_subjects;
  SELECT count(*) INTO v_topics FROM flashcard_topics WHERE ext_id LIKE 'qb:%';
  SELECT count(*) INTO v_cards FROM flashcards WHERE ext_id IS NOT NULL;
  RETURN jsonb_build_object('subjects', v_subjects, 'topics', v_topics, 'cards', v_cards);
END;
$$;
