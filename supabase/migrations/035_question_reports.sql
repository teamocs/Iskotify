-- 035_question_reports.sql
--
-- End-to-end question reporting: mobile users flag a bad question with a
-- reason; admins triage in the console (status new → reviewed → resolved)
-- and edit/delete the underlying question.
--
-- question_text is a snapshot at report time so admins can triage without
-- joining the source table (and even if the question is later edited).
-- App clients (anon or signed-in) may only INSERT; reads/updates/deletes
-- happen exclusively through the admin console's service-role client.

CREATE TABLE IF NOT EXISTS question_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   text NOT NULL,
  source_table  text NOT NULL DEFAULT 'flashcards'
                CHECK (source_table IN ('flashcards', 'upcat_questions')),
  question_text text NOT NULL DEFAULT '',
  reason        text NOT NULL DEFAULT '',
  user_id       uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_reports_status_idx      ON question_reports (status);
CREATE INDEX IF NOT EXISTS question_reports_question_id_idx ON question_reports (question_id);
CREATE INDEX IF NOT EXISTS question_reports_created_at_idx  ON question_reports (created_at DESC);

ALTER TABLE question_reports ENABLE ROW LEVEL SECURITY;

-- Mobile clients can file reports (works signed-out; user_id is best-effort).
CREATE POLICY question_reports_insert ON question_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- No SELECT/UPDATE/DELETE policies: only the service-role admin client can
-- read or manage reports.
