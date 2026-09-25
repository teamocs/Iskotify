-- 058_kb_missing_figures.sql
--
-- The Drive sync now records every question whose figure it could not find
-- ({question_id, file, caption}), not just the first five names in `message`,
-- so /admin/sync can hand the content author a complete upload list
-- (GET /api/kb/missing-figures).

ALTER TABLE kb_drive_files ADD COLUMN IF NOT EXISTS missing_figures jsonb NOT NULL DEFAULT '[]';
