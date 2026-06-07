-- listings exam-date / deadline refresh — sourced from Jun-3, 2026 admissions digest
--
-- Assumed slugs (best-effort, no-op if slug does not exist):
--   upcat   → UPCAT 2027, exam confirmed August 1, 2026
--
-- ACET/DCAT exam dates for next cycle are not yet confirmed in this digest
-- (next cycles expected Q3–Q4 2026); no update emitted for those rows.
-- All statements are idempotent UPDATE … WHERE slug = '…'.

UPDATE listings
SET    exam_date  = '2026-08-01',
       status     = 'upcoming',
       updated_at = now()
WHERE  slug = 'upcat';
