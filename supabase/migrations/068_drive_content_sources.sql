-- 068_drive_content_sources.sql
--
-- The admin console's Google Drive sync reads more than questions. Staff list
-- the Drive folders to read and what each holds; the daily cron and "Sync now"
-- route every file by its folder's content type:
--
--   questions      the existing question-bank pipeline (kb_drive_files, 055/063),
--                  unchanged. KB_DRIVE_FOLDER_ID stays an implicit questions
--                  source, so nothing is seeded here.
--   listings       each Google Sheet / CSV / .xlsx becomes a listings preview
--                  batch (listing_import_batches, 063), tagged with its Drive file.
--   announcements  each Google Doc (a weekly admissions report) is read by the
--                  AI into admissions_updates rows, held in an announcement
--                  preview batch. Nothing is published without an admin.
--
-- public.drive_sources: one row per (folder, content type). folder_id shape is
--   validated in app code (it is interpolated into a Drive files.list query).
--
-- public.drive_content_files: per-file ledger for the listings/announcements
--   files, keyed by (content_type, drive_file_id), so an unchanged file (same
--   md5, or same modifiedTime for native Google files) makes no new preview and
--   a run that hits its time budget resumes. A parallel ledger rather than
--   kb_drive_files: that table's columns, statuses and readers are all
--   question-specific, and the same file could sit in two sources.
--   status:
--     previewed   a preview batch was created (batch_id)
--     no_changes  read fine; nothing differs from what is live
--     held        needs a person: unreadable AI output, no usable rows, …
--     skipped     unsupported file type or too large
--     error       Drive/DB failure; retried next run
--
-- public.announcement_import_batches: mirrors listing_import_batches. rows:
--   [{id, action: new|update|unchanged, changes: [field…], section, quote,
--     update: {admissions_updates row}}]; skipped: [{title, reason}] — items
--   the validator left out (e.g. a quote not found in the document).
--   Publish upserts admissions_updates on id. One live preview per Drive file.
--
-- listing_import_batches gets source ('sheet_link' for the pasted-link page,
--   'drive' for the sync) and drive_file_id, with one live preview per file.
--   Existing rows default to 'sheet_link'.
--
-- All three new tables are service-role only (RLS on, no policies, no client
-- grants), like kb_drive_files: the admin console reads and writes them
-- server-side.
--
-- ── MANUAL VERIFICATION ───────────────────────────────────────────────────────
--   1. As service_role:
--        insert into public.drive_sources (content_type, folder_id, label)
--          values ('announcements', 'manual-test-folder-0000000000', 'test');
--        insert into public.drive_sources (content_type, folder_id, label)
--          values ('announcements', 'manual-test-folder-0000000000', 'dup');
--                                                -- fails 23505 (unique)
--        insert into public.drive_sources (content_type, folder_id)
--          values ('schools', 'manual-test-folder-0000000000');
--                                                -- fails 23514 (check)
--   2. Signed in as any app user (authenticated REST), and as anon:
--        select * from drive_sources;               -- permission denied
--        select * from drive_content_files;         -- permission denied
--        select * from announcement_import_batches; -- permission denied
--   3. One live preview per file, as service_role:
--        insert into public.announcement_import_batches (drive_file_id, file_name)
--          values ('f-test', 'a'), ('f-test', 'b');  -- fails 23505
--        select source, count(*) from public.listing_import_batches group by 1;
--                                                -- existing rows: sheet_link
--   4. Clean up:
--        delete from public.announcement_import_batches where drive_file_id = 'f-test';
--        delete from public.drive_sources where folder_id = 'manual-test-folder-0000000000';
--   5. In the console: /admin/sync → Drive sources → add a folder → Sync now.

CREATE TABLE IF NOT EXISTS public.drive_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type  text NOT NULL CHECK (content_type IN ('questions', 'listings', 'announcements')),
  folder_id     text NOT NULL,
  label         text,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (folder_id, content_type)
);
ALTER TABLE public.drive_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_sources FROM anon, authenticated;

DROP TRIGGER IF EXISTS drive_sources_updated_at ON public.drive_sources;
CREATE TRIGGER drive_sources_updated_at
  BEFORE UPDATE ON public.drive_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS public.drive_content_files (
  content_type       text NOT NULL CHECK (content_type IN ('listings', 'announcements')),
  drive_file_id      text NOT NULL,
  source_id          uuid REFERENCES public.drive_sources (id) ON DELETE SET NULL,
  name               text NOT NULL,
  path               text NOT NULL DEFAULT '',
  mime_type          text NOT NULL DEFAULT '',
  md5_checksum       text,
  drive_modified_at  timestamptz,
  status             text NOT NULL CHECK (status IN ('previewed', 'no_changes', 'held', 'skipped', 'error')),
  message            text,
  batch_id           uuid,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_type, drive_file_id)
);
ALTER TABLE public.drive_content_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_content_files FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.announcement_import_batches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id      text NOT NULL,
  file_name          text NOT NULL,
  report_date        date,
  status             text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'published', 'discarded')),
  rows               jsonb NOT NULL DEFAULT '[]'::jsonb,
  skipped            jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_count          integer NOT NULL DEFAULT 0,
  update_count       integer NOT NULL DEFAULT 0,
  unchanged_count    integer NOT NULL DEFAULT 0,
  skipped_count      integer NOT NULL DEFAULT 0,
  published_count    integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  published_by       uuid,
  published_at       timestamptz,
  discarded_at       timestamptz
);
ALTER TABLE public.announcement_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcement_import_batches FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS announcement_import_batches_status_idx
  ON public.announcement_import_batches (status, created_at desc);
CREATE UNIQUE INDEX IF NOT EXISTS announcement_import_batches_one_preview
  ON public.announcement_import_batches (drive_file_id) WHERE status = 'preview';

ALTER TABLE public.listing_import_batches
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sheet_link'
    CHECK (source IN ('sheet_link', 'drive')),
  ADD COLUMN IF NOT EXISTS drive_file_id text;
CREATE UNIQUE INDEX IF NOT EXISTS listing_import_batches_one_drive_preview
  ON public.listing_import_batches (drive_file_id) WHERE status = 'preview' AND drive_file_id IS NOT NULL;
