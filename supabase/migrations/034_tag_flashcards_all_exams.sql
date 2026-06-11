-- 034_tag_flashcards_all_exams.sql
--
-- The question-bank flashcards (Language Proficiency, Mathematics, Reading
-- Comprehension, Science) are general college-entrance content, but the
-- projection function hardcoded listing_slugs = {upcat}, so only users
-- focused on UPCAT ever synced cards and saw Recommended topics.
--
-- This migration makes project_question_bank_to_flashcards() tag subjects
-- and cards with EVERY exam-type listing (resolved at run time, so newly
-- added exams are picked up on the next projection run), then re-runs the
-- projection to retag existing rows. updated_at = now() ensures the
-- incremental mobile sync delivers the retagged cards to existing installs.

-- NOTE: CREATE OR REPLACE preserves the function's existing ACLs, so the
-- REVOKE/GRANT-to-service_role hardening from migrations 026/029 still applies.
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
  -- All entrance-exam listings; fall back to {upcat} if the table is empty.
  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY['upcat']::text[])
  INTO v_exam_slugs
  FROM listings
  WHERE type = 'exam';

  -- 1. Subjects: one per subtest of published questions.
  INSERT INTO flashcard_subjects (name, listing_slugs, updated_at)
  SELECT DISTINCT q.subtest, v_exam_slugs, now()
  FROM upcat_questions q
  WHERE q.status = 'published'
  ON CONFLICT (name) DO UPDATE
    SET listing_slugs = EXCLUDED.listing_slugs, updated_at = now();

  -- 2. Topics: one per (subtest, topic|main_subject), keyed by ext_id.
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

  -- 3. Cards: one per published question, keyed by ext_id = question_id.
  INSERT INTO flashcards (
    ext_id, topic_id, question, answer, explanation, options,
    correct_answer_index, status, listing_slugs, updated_at
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
    now()
  FROM upcat_questions q
  JOIN flashcard_subjects s ON s.name = q.subtest
  JOIN flashcard_topics t
    ON t.ext_id = 'qb:' || q.subtest || ':' || COALESCE(NULLIF(q.topic, ''), NULLIF(q.main_subject, ''), q.subtest)
  LEFT JOIN upcat_passages p ON p.set_id = q.set_id
  WHERE q.status = 'published'
  ON CONFLICT (ext_id) WHERE ext_id IS NOT NULL DO UPDATE
    SET topic_id = EXCLUDED.topic_id,
        question = EXCLUDED.question,
        answer = EXCLUDED.answer,
        explanation = EXCLUDED.explanation,
        options = EXCLUDED.options,
        correct_answer_index = EXCLUDED.correct_answer_index,
        status = 'published',
        listing_slugs = EXCLUDED.listing_slugs,
        updated_at = now();

  SELECT count(*) INTO v_subjects FROM flashcard_subjects;
  SELECT count(*) INTO v_topics FROM flashcard_topics WHERE ext_id LIKE 'qb:%';
  SELECT count(*) INTO v_cards FROM flashcards WHERE ext_id IS NOT NULL;
  RETURN jsonb_build_object('subjects', v_subjects, 'topics', v_topics, 'cards', v_cards);
END;
$$;

-- Retag existing rows now.
SELECT project_question_bank_to_flashcards();

-- Manually created cards (no ext_id) that were tagged only {upcat} get the
-- same all-exams treatment — they are the same general-subject content.
UPDATE flashcards
SET listing_slugs = (SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY['upcat']::text[]) FROM listings WHERE type = 'exam'),
    updated_at = now()
WHERE ext_id IS NULL
  AND listing_slugs = ARRAY['upcat']::text[];
