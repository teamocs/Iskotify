-- Project published Question Bank rows (upcat_questions/upcat_passages) into the
-- flashcard_* tables so the mobile "Gamified Q&A Engine" (topic/deck/listing quiz)
-- surfaces the same content the UPCAT mock-exam engine uses.
--
-- Idempotent: keyed on ext_id (question_id for cards, 'qb:<subtest>:<topic>' for
-- topics, subtest name for subjects). Re-running keeps flashcards in sync with the
-- bank. Only status='published' (Approved) questions are projected; QA/draft rows
-- stay hidden. Reading-comprehension passages are prepended into the question text
-- because the flashcards table has no passage column. Cards are tagged
-- listing_slugs=['upcat'] so the mobile sync (which filters cards by the user's
-- focus listing slug) delivers them to anyone targeting UPCAT.

CREATE OR REPLACE FUNCTION project_question_bank_to_flashcards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subjects int;
  v_topics int;
  v_cards int;
BEGIN
  -- 1. Subjects: one per subtest of published questions.
  INSERT INTO flashcard_subjects (name, listing_slugs, updated_at)
  SELECT DISTINCT q.subtest, ARRAY['upcat']::text[], now()
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
    ARRAY['upcat']::text[],
    now()
  FROM upcat_questions q
  JOIN flashcard_subjects s ON s.name = q.subtest
  JOIN flashcard_topics t
    ON t.ext_id = 'qb:' || q.subtest || ':' || COALESCE(NULLIF(q.topic, ''), NULLIF(q.main_subject, ''), q.subtest)
  LEFT JOIN upcat_passages p ON p.set_id = q.set_id
  WHERE q.status = 'published'
  ON CONFLICT (ext_id) DO UPDATE
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

-- Service role (used by the admin projection route) can execute; revoke from anon.
REVOKE ALL ON FUNCTION project_question_bank_to_flashcards() FROM public;
GRANT EXECUTE ON FUNCTION project_question_bank_to_flashcards() TO service_role;
