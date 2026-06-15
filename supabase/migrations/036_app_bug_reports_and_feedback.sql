-- 036_app_bug_reports_and_feedback.sql
--
-- In-app "Report a Bug" and "Leave Feedback" from the mobile app.
--
-- Both tables follow the 035_question_reports pattern: app clients (anon or
-- signed-in) may only INSERT; reads/updates/deletes happen exclusively through
-- the admin console's service-role client (status new → reviewed → resolved).
--
-- Bug reports may carry an optional screenshot. The image is uploaded to the
-- public 'app-bug-reports' storage bucket and its public URL is stored in
-- image_url. Image upload is best-effort on the client — a failed upload still
-- files the text report (image_url stays NULL).

-- ── app_bug_reports ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_bug_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  screen       text NOT NULL DEFAULT 'General',
  description  text NOT NULL DEFAULT '',
  image_url    text,
  app_version  text,
  platform     text,
  status       text NOT NULL DEFAULT 'new'
               CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_bug_reports_status_idx     ON app_bug_reports (status);
CREATE INDEX IF NOT EXISTS app_bug_reports_created_at_idx ON app_bug_reports (created_at DESC);

ALTER TABLE app_bug_reports ENABLE ROW LEVEL SECURITY;

-- Mobile clients can file bug reports (works signed-out; user_id is best-effort).
DROP POLICY IF EXISTS app_bug_reports_insert ON app_bug_reports;
CREATE POLICY app_bug_reports_insert ON app_bug_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- No SELECT/UPDATE/DELETE policies: only the service-role admin client reads or
-- manages reports.

-- ── app_feedback ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  rating      int CHECK (rating BETWEEN 1 AND 5),
  message     text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'new'
              CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_feedback_status_idx     ON app_feedback (status);
CREATE INDEX IF NOT EXISTS app_feedback_created_at_idx ON app_feedback (created_at DESC);

ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

-- Mobile clients can leave feedback (works signed-out; user_id is best-effort).
DROP POLICY IF EXISTS app_feedback_insert ON app_feedback;
CREATE POLICY app_feedback_insert ON app_feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- No SELECT/UPDATE/DELETE policies: service-role admin client only.

-- ── Storage: public bucket for bug screenshots ────────────────────────────────
-- public = true so the admin console can render the image straight from its
-- public URL without signing. Restricted to images, with a modest size cap.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-bug-reports',
  'app-bug-reports',
  true,
  10485760, -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anon + authenticated to UPLOAD into the app-bug-reports bucket only.
DROP POLICY IF EXISTS "app_bug_reports_upload" ON storage.objects;
CREATE POLICY "app_bug_reports_upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'app-bug-reports');

-- Public read of objects in the app-bug-reports bucket (bucket is public, but an
-- explicit SELECT policy keeps reads working under strict object-level RLS).
DROP POLICY IF EXISTS "app_bug_reports_public_read" ON storage.objects;
CREATE POLICY "app_bug_reports_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'app-bug-reports');
