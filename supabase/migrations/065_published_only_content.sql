-- 065_published_only_content.sql
--
-- Students only ever see PUBLISHED content, and their devices learn when
-- content stops being published.
--
-- Before: upcat_questions_read, upcat_passages_read, flashcards_public_read and
-- topics_public_read were all FOR SELECT USING (true), so the anon key could
-- read every draft question (1282 in prod on 2026-10-01). The app's local
-- readers filter status = 'published', but the drafts still reached devices.
-- The admin reads these tables with the service role, which RLS does not
-- affect, so nothing changes for the admin.
--
-- What this migration does
--   1. Read policies: upcat_questions, flashcards, flashcard_topics are readable
--      only when status = 'published'; upcat_passages only when a published
--      question uses the passage. Write policies (none today for clients) are
--      not touched.
--   2. upcat_questions.status gets the same draft/published CHECK as flashcards
--      and flashcard_topics (005), and its default becomes 'draft', so a row
--      inserted without a status is never public. Every insert path sets status
--      explicitly (importUpcatCore: KB drive sync + CSV import route,
--      scripts/import-upcat-questions.mjs, migration 047), so behavior is
--      unchanged.
--   3. content_tombstones: AFTER DELETE triggers record (kind, id) of a deleted
--      question / flashcard / topic; AFTER INSERT triggers clear it if the same
--      id comes back. RLS on, no policies, no client grants: only the feed
--      below (SECURITY DEFINER) reads it.
--   4. content_status_feed(p_since, p_limit, p_after_kind, p_after_id): the
--      device's delta pull can no longer see a row that was unpublished (RLS
--      hides it), so this feed tells it which ids changed to a non-published
--      status or were deleted since its cursor. It returns ids and status only,
--      never content. Ordered by (changed_at, kind, id); the device pages with
--      the last row's (changed_at, kind, id) as the next (p_since, p_after_kind,
--      p_after_id), so a bulk change that stamps thousands of rows with one
--      now() cannot be skipped at a page boundary. p_limit is clamped to 1..5000.
--   5. Partial updated_at indexes on the (small) non-published slice the feed
--      scans. The full updated_at indexes (006, 061) stay for the delta pull.
--
-- ── MANUAL VERIFICATION ─────────────────────────────────────────────────────
--   Before applying (ids must be what the feed casts):
--     select table_name, column_name, data_type from information_schema.columns
--       where table_schema = 'public' and (table_name, column_name) in
--       (('upcat_questions','question_id'), ('flashcards','id'), ('flashcard_topics','id'));
--       -- expect text, uuid, uuid
--     select status, count(*) from public.upcat_questions group by 1;  -- only draft/published
--     select policyname, tablename, cmd from pg_policies where schemaname = 'public'
--       and tablename in ('upcat_questions','upcat_passages','flashcards','flashcard_topics');
--       -- expect only the four *_read SELECT policies
--   After applying:
--   1. As anon (SQL editor: set role anon;):
--        select count(*) from public.upcat_questions;                         -- = published count
--        select count(*) from public.upcat_questions where status <> 'published'; -- 0
--        select count(*) from public.flashcards where status <> 'published';  -- 0
--        select count(*) from public.content_tombstones;                      -- permission denied
--        select * from public.content_status_feed('1970-01-01', 5);           -- 5 id/status rows
--      reset role;
--   2. Unpublish one question in the admin, then (as anon)
--        select * from public.content_status_feed(now() - interval '5 minutes');
--      shows ('question', <id>, 'draft', <time>). Publish it again: it leaves the feed.
--   3. Delete a throwaway flashcard (service role); the feed shows
--      ('flashcard', <id>, 'deleted', <time>). Re-insert a row with the same id:
--      its tombstone is gone (select * from public.content_tombstones).
--   4. insert into public.upcat_questions (question_id, subtest, question_text,
--      options, correct_index, explanation) values ('ZZ-TEST','Mathematics','q',
--      array['a','b'],0,'e') returning status;   -- 'draft'; then delete it.
--   5. App: sign out, clear app data, launch: practice shows published questions
--      only; unpublish a question, relaunch: it is gone from practice.

-- ── 1. Published-only read policies ────────────────────────────────────────────
DROP POLICY IF EXISTS upcat_questions_read ON public.upcat_questions;
CREATE POLICY upcat_questions_read ON public.upcat_questions
  FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "flashcards_public_read" ON public.flashcards;
CREATE POLICY "flashcards_public_read" ON public.flashcards
  FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "topics_public_read" ON public.flashcard_topics;
CREATE POLICY "topics_public_read" ON public.flashcard_topics
  FOR SELECT
  USING (status = 'published');

-- idx_upcat_questions_set (016) serves the set_id lookup.
DROP POLICY IF EXISTS upcat_passages_read ON public.upcat_passages;
CREATE POLICY upcat_passages_read ON public.upcat_passages
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.upcat_questions q
    WHERE q.set_id = upcat_passages.set_id
      AND q.status = 'published'
  ));

-- ── 2. upcat_questions.status: draft/published only, default draft ─────────────
ALTER TABLE public.upcat_questions DROP CONSTRAINT IF EXISTS upcat_questions_status_check;
ALTER TABLE public.upcat_questions
  ADD CONSTRAINT upcat_questions_status_check
  CHECK (status IN ('draft', 'published')) NOT VALID;
ALTER TABLE public.upcat_questions VALIDATE CONSTRAINT upcat_questions_status_check;
ALTER TABLE public.upcat_questions ALTER COLUMN status SET DEFAULT 'draft';

-- ── 3. Tombstones for hard deletes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_tombstones (
  kind       text        NOT NULL CHECK (kind IN ('question', 'flashcard', 'topic')),
  id         text        NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);
ALTER TABLE public.content_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_tombstones FROM public, anon, authenticated;

-- Trigger args: (kind, id column). The id is read through to_jsonb so one
-- function serves question_id (text) and id (uuid) tables alike.
CREATE OR REPLACE FUNCTION public.content_tombstone_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.content_tombstones (kind, id, deleted_at)
  VALUES (TG_ARGV[0], to_jsonb(OLD) ->> TG_ARGV[1], now())
  ON CONFLICT (kind, id) DO UPDATE SET deleted_at = now();
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.content_tombstone_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.content_tombstones
  WHERE kind = TG_ARGV[0] AND id = to_jsonb(NEW) ->> TG_ARGV[1];
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.content_tombstone_on_delete() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.content_tombstone_on_insert() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS upcat_questions_tombstone_delete ON public.upcat_questions;
CREATE TRIGGER upcat_questions_tombstone_delete
  AFTER DELETE ON public.upcat_questions
  FOR EACH ROW EXECUTE FUNCTION public.content_tombstone_on_delete('question', 'question_id');
DROP TRIGGER IF EXISTS upcat_questions_tombstone_insert ON public.upcat_questions;
CREATE TRIGGER upcat_questions_tombstone_insert
  AFTER INSERT ON public.upcat_questions
  FOR EACH ROW EXECUTE FUNCTION public.content_tombstone_on_insert('question', 'question_id');

DROP TRIGGER IF EXISTS flashcards_tombstone_delete ON public.flashcards;
CREATE TRIGGER flashcards_tombstone_delete
  AFTER DELETE ON public.flashcards
  FOR EACH ROW EXECUTE FUNCTION public.content_tombstone_on_delete('flashcard', 'id');
DROP TRIGGER IF EXISTS flashcards_tombstone_insert ON public.flashcards;
CREATE TRIGGER flashcards_tombstone_insert
  AFTER INSERT ON public.flashcards
  FOR EACH ROW EXECUTE FUNCTION public.content_tombstone_on_insert('flashcard', 'id');

-- A topic delete cascades to its flashcards (001), which fire their own trigger.
DROP TRIGGER IF EXISTS flashcard_topics_tombstone_delete ON public.flashcard_topics;
CREATE TRIGGER flashcard_topics_tombstone_delete
  AFTER DELETE ON public.flashcard_topics
  FOR EACH ROW EXECUTE FUNCTION public.content_tombstone_on_delete('topic', 'id');
DROP TRIGGER IF EXISTS flashcard_topics_tombstone_insert ON public.flashcard_topics;
CREATE TRIGGER flashcard_topics_tombstone_insert
  AFTER INSERT ON public.flashcard_topics
  FOR EACH ROW EXECUTE FUNCTION public.content_tombstone_on_insert('topic', 'id');

-- ── 4. Status feed (ids + status only) ─────────────────────────────────────────
-- Tombstone existence checks cast to uuid inside CASE so a 'question' id (not a
-- uuid) is never cast, and the primary-key index is still used.
CREATE OR REPLACE FUNCTION public.content_status_feed(
  p_since      timestamptz,
  p_limit      int  DEFAULT 1000,
  p_after_kind text DEFAULT NULL,
  p_after_id   text DEFAULT NULL
)
RETURNS TABLE (kind text, id text, status text, changed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH feed AS (
    SELECT 'question'::text AS kind, q.question_id AS id, q.status AS status, q.updated_at AS changed_at
    FROM public.upcat_questions q
    WHERE q.status <> 'published' AND q.updated_at >= p_since
    UNION ALL
    SELECT 'flashcard'::text, f.id::text, f.status, f.updated_at
    FROM public.flashcards f
    WHERE f.status <> 'published' AND f.updated_at >= p_since
    UNION ALL
    SELECT 'topic'::text, t.id::text, t.status, t.updated_at
    FROM public.flashcard_topics t
    WHERE t.status <> 'published' AND t.updated_at >= p_since
    UNION ALL
    SELECT d.kind, d.id, 'deleted'::text, d.deleted_at
    FROM public.content_tombstones d
    WHERE d.deleted_at >= p_since
      AND NOT EXISTS (SELECT 1 FROM public.upcat_questions x
                      WHERE x.question_id = CASE WHEN d.kind = 'question' THEN d.id END)
      AND NOT EXISTS (SELECT 1 FROM public.flashcards x
                      WHERE x.id = CASE WHEN d.kind = 'flashcard' THEN d.id::uuid END)
      AND NOT EXISTS (SELECT 1 FROM public.flashcard_topics x
                      WHERE x.id = CASE WHEN d.kind = 'topic' THEN d.id::uuid END)
  )
  SELECT fd.kind, fd.id, fd.status, fd.changed_at
  FROM feed fd
  WHERE fd.changed_at > p_since
     OR (p_after_id IS NOT NULL
         AND fd.changed_at = p_since
         AND (fd.kind, fd.id) > (COALESCE(p_after_kind, ''), p_after_id))
  ORDER BY fd.changed_at, fd.kind, fd.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000);
$$;

REVOKE ALL ON FUNCTION public.content_status_feed(timestamptz, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.content_status_feed(timestamptz, int, text, text) TO anon, authenticated, service_role;

-- ── 5. Indexes for the feed ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_upcat_questions_unpublished_updated_at
  ON public.upcat_questions (updated_at) WHERE status <> 'published';
CREATE INDEX IF NOT EXISTS idx_flashcards_unpublished_updated_at
  ON public.flashcards (updated_at) WHERE status <> 'published';
CREATE INDEX IF NOT EXISTS idx_flashcard_topics_unpublished_updated_at
  ON public.flashcard_topics (updated_at) WHERE status <> 'published';
