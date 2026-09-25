-- 059_question_flag_dismissals.sql
--
-- The Distractor Review Queue (/admin/upcat/review-queue) flags questions whose
-- options fail cheap heuristics. Staff dismiss a flag when the options are fine
-- as written; the dismissal is shared by the whole team, so it lives here.
--
-- A dismissal is keyed by question AND a fingerprint of its options
-- (apps/admin/lib/admin/reviewQueue.ts optionsFingerprint), so editing the
-- options brings the flag back if they still fail.
--
-- Written only through /api/admin/question-flags with the service role: RLS is
-- on and there are deliberately no client policies.

CREATE TABLE IF NOT EXISTS question_flag_dismissals (
  question_id text NOT NULL,
  options_fingerprint text NOT NULL,
  dismissed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, options_fingerprint)
);

ALTER TABLE question_flag_dismissals ENABLE ROW LEVEL SECURITY;
