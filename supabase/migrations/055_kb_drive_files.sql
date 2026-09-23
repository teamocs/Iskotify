-- 055_kb_drive_files.sql
--
-- Ledger for the Google Drive → question bank sync (apps/admin/lib/kb/).
-- One row per Drive file seen in the knowledge-base folder. The sync compares a
-- file's md5 checksum against this ledger, so only new or changed files are
-- re-imported, and a run that times out resumes where it stopped.
--
-- status:
--   imported       parsed and upserted (as drafts)
--   needs_mapping  headers not recognised — never guessed, needs a dialect
--   skipped        deliberately excluded (e.g. out-of-audience exam, non-CSV)
--   error          parse/import failed; see message
-- Service-role only (admin API routes); no client policies.

CREATE TABLE IF NOT EXISTS kb_drive_files (
  drive_file_id   text PRIMARY KEY,
  name            text NOT NULL,
  path            text NOT NULL DEFAULT '',
  mime_type       text NOT NULL DEFAULT '',
  md5_checksum    text,
  drive_modified_at timestamptz,
  dialect         text,
  status          text NOT NULL DEFAULT 'imported'
                  CHECK (status IN ('imported', 'needs_mapping', 'skipped', 'error')),
  rows_total      int NOT NULL DEFAULT 0,
  rows_imported   int NOT NULL DEFAULT 0,
  rows_missing_media int NOT NULL DEFAULT 0,
  rows_drafted    int NOT NULL DEFAULT 0,
  question_ids    text[] NOT NULL DEFAULT '{}',
  message         text,
  imported_at     timestamptz,
  published_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kb_drive_files ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS kb_drive_files_updated_at ON kb_drive_files;
CREATE TRIGGER kb_drive_files_updated_at
  BEFORE UPDATE ON kb_drive_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
