# CSV Knowledgebase Import — Design

**Date:** 2026-05-30
**Author:** session brainstorming with user
**Replaces:** PDF upload feature (`/admin/flashcards/upload` + PDF processing pipeline)

## 1. Goal

Replace the unreliable PDF-extraction pipeline with a structured CSV upload that gives admins precise control over extracted data. CSV is the source of truth for everything except MCQ distractors, which Gemini fills in asynchronously when missing. Exam/scholarship tagging stays manual at publish time.

## 2. Why CSV over PDF

| Concern | PDF (current) | CSV (proposed) |
|---|---|---|
| Extraction accuracy | AI-guessed Q&A pairs, often wrong | Admin authors exact text |
| Subject/topic structure | AI-inferred from PDF headings | Admin assigns per row |
| Distractor quality | None — leaves cards as free-form Q&A | Optional inline; Gemini fills gaps |
| Error rate | Silent — admin reviews after extraction | Caught at upload via row-level validation |
| Time per study guide | 30-60s extraction + heavy review | Instant insert; lightweight review |
| Tooling for admins | None — black-box PDF | Excel, Google Sheets, Numbers, any text editor |

## 3. User workflow

```
1. Admin nav: "Import CSV" + "Drafts" replace "Upload PDF"
2. Admin uploads a .csv file via drag-and-drop or file-picker
3. Browser parses with papaparse, shows preview:
     - First 10 rows in a table
     - Validation errors per row (red highlight)
     - Footer: "32 rows valid · 2 rows have errors"
4. "Import" button is disabled until all errors are fixed
5. Admin clicks "Import 34 cards"
6. Server route inserts in a transaction:
     - Upsert subjects by name
     - Insert topics (status='draft', source_type='csv')
     - Insert flashcards (status='draft', listing_slugs=[])
7. Server fires async POST to /api/flashcards/enhance-batch per topic
8. Admin redirected to /admin/flashcards/drafts
9. Drafts page polls every 5s:
     - Each row shows "Enhancing… 12/40" until distractors complete
10. Admin clicks "Review & Publish" on a draft
11. Review page shows all cards + exam slug multi-select
12. Admin picks slugs, clicks "Publish" — status flips to 'published'
13. Mobile users sync the published cards on next launch
```

## 4. CSV format

```csv
subject,topic,question,answer,explanation,distractors
Math,Algebra,What is 2+2?,4,Basic addition,3|5|6
Math,Algebra,Capital of PH?,Manila,,
Sci,Physics,Speed of light?,3x10^8 m/s,c is constant,2x10^8|4x10^8|1x10^9
```

### Columns

| Column | Required | Type | Notes |
|---|---|---|---|
| `subject` | yes | text, ≤200 chars | Looked up by name; created if new |
| `topic` | yes | text, ≤200 chars | New topic per (subject, topic) pair |
| `question` | yes | text, ≤2000 chars | The card prompt |
| `answer` | yes | text, ≤500 chars | The correct answer text |
| `explanation` | no | text, ≤1000 chars | Optional rationale shown after answer |
| `distractors` | no | text | Pipe-separated, exactly 3 wrong answers if present; if empty Gemini generates |

### Validation rules

1. UTF-8 encoding (BOM tolerated and stripped).
2. Max file size: **5 MB**.
3. Max rows: **1000** (1001 lines including header).
4. Header row required and must match exactly: `subject,topic,question,answer,explanation,distractors`. Order matters.
5. Required columns must be non-empty after trimming.
6. `distractors` column either empty or has **exactly 3** pipe-separated values, each ≤500 chars.
7. No duplicate (subject, topic, question) within the same CSV (admin warned, blocked).
8. All-or-nothing: any single validation error blocks the import button. Admin fixes CSV, re-uploads.

### Failure modes

- Encoding error → "Could not decode file. Save as UTF-8 and re-upload."
- Wrong header → "Header row must be: subject,topic,question,answer,explanation,distractors"
- Per-row errors → row-by-row error list in preview table

### How `answer` + `distractors` become the 4-option array

When `distractors` is present (3 wrong answers): the import composes the 4-option `options` column as `[answer, ...distractors]` then shuffles with a deterministic seed (`hash(question)`) so the correct index is reproducible. `correct_answer_index` is set to the post-shuffle position of `answer`. This way mobile users always see consistent option order across devices for the same card.

When `distractors` is empty: `options=[]` and `correct_answer_index=NULL` at insert time. Gemini fills `ai_options` + `ai_correct_index` asynchronously. Mobile prefers `ai_options` when present, else falls back to `options`.

## 5. Database changes

### Migration 013 — `flashcard_topics.source_type`

```sql
ALTER TABLE flashcard_topics
  ADD COLUMN source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('csv', 'pdf', 'manual', 'ai'));

-- Backfill existing topics from pdf_jobs
UPDATE flashcard_topics t SET source_type = 'pdf'
  FROM pdf_jobs j WHERE j.topic_id = t.id;

CREATE INDEX idx_flashcard_topics_status_source
  ON flashcard_topics(status, source_type);
```

### Kept for legacy data (no new writes)

- `pdf_jobs` table — historical reference
- `flashcards.source_pdf_url` column — legacy traceability
- `flashcard-pdfs` storage bucket — existing files

### No new tables

Progress tracking for distractor enhancement is **derived** from `flashcards` rows on demand. No `import_jobs` or `distractor_jobs` table needed.

## 6. API routes

### New

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/flashcards/import-csv` | POST | admin role | Multipart CSV upload. Parses, validates, inserts in transaction, returns `{ topic_ids: string[], total_cards: number, cards_needing_enhancement: number }`. Fires async POST to `/api/flashcards/enhance-batch` per topic without awaiting. |
| `/api/flashcards/enhance-batch` | POST | admin role | Body: `{ topic_id: string }`. Fetches cards in topic with empty `options` AND empty `ai_options`. Calls `generateDistractorsForCard` per card at max 6 req/sec. Writes results to `ai_options`/`ai_correct_index`/`ai_explanation`/`ai_enhanced_at`. Returns when done. |
| `/api/flashcards/drafts` | GET | admin role | Returns array of `{ topic_id, topic_name, subject_id, subject_name, source_type, total_cards, cards_with_options, cards_enhanced, cards_needing_enhancement, created_at }` for every topic where `status='draft'`. |
| `/api/flashcards/publish/[topicId]` | POST | admin role | Body: `{ listing_slugs: string[] }`. Sets `listing_slugs` on all cards in the topic, flips topic + all its cards to `status='published'`. Validates ≥1 slug. |

### Deleted

- `/api/flashcards/upload` (PDF upload + job creation)
- `/api/flashcards/process/[id]` (PDF processing pipeline)
- `/api/flashcards/jobs/[id]` (PDF job polling)
- `/api/flashcards/publish/[jobId]` (replaced by `/api/flashcards/publish/[topicId]`)

## 7. UI pages

### `/admin/flashcards/import` (NEW)

- Dropzone for `.csv` file
- "Download sample CSV" link below dropzone
- After file selected: preview table (first 10 rows + validation errors)
- Footer summary: "N rows valid · M rows have errors"
- "Import N cards" button (primary, disabled if errors)
- On success: navigate to `/admin/flashcards/drafts`

### `/admin/flashcards/drafts` (NEW)

Table with columns:
- Subject
- Topic
- Cards (e.g. "40")
- Enhancement (e.g. "32/40 — 8 pending" with progress bar, or "✓ Complete")
- Source (badge: CSV / PDF / Manual / AI)
- Created (relative time)
- Action ("Review & Publish" button → `/admin/flashcards/review/{topic_id}`)

Empty state: "No drafts. Import a CSV to get started."

Polling: refetch every 5s while any row has pending enhancement; stop polling when all complete.

### `/admin/flashcards/review/[topicId]` (NEW, generic)

Replaces `[jobId]` version. Works for any draft topic regardless of source.

- Header: subject · topic name (editable)
- Card list (one row per card): question, answer, explanation, current options (if any), AI options (if enhanced)
- Below: ExamTagSelector multi-select (existing component)
- "Publish" button (disabled until at least one tag selected)

### Deleted UI

- `/admin/flashcards/upload` (PDF page)
- `/admin/flashcards/review/[jobId]` (replaced by `[topicId]`)
- `UploadDropzone` PDF version (replaced by CSV dropzone)

### Nav update

`apps/admin/components/nav.tsx` (or wherever): replace "Upload PDF" link with two links:
- "Import CSV" → `/admin/flashcards/import`
- "Drafts" → `/admin/flashcards/drafts`

## 8. Async Gemini enhancement

### Pattern: fire-and-forget batch

1. CSV import route commits all flashcard inserts.
2. For each newly created topic_id, route fires:
   ```ts
   fetch(`${baseUrl}/api/flashcards/enhance-batch`, {
     method: 'POST',
     body: JSON.stringify({ topic_id }),
     headers: { 'Content-Type': 'application/json' },
   }).catch(err => console.error('[enhance-batch] dispatch failed:', err))
   ```
3. Import route returns immediately to admin.
4. Enhance-batch route processes cards using existing `generateDistractorsForCard` helper.
5. Drafts page polls and observes the `cards_enhanced` count climbing.

### Rate limiting

- 6 requests per second (matches existing backfill behavior; well within Gemini free-tier 15rpm/1500rpd).
- Sequential per topic, parallel across topics is not implemented in v1.

### Failure handling

- Per-card failures logged to server console; card stays without `ai_options`.
- No automatic retry in v1; admin can manually re-trigger via a "Retry enhancement" button on the review page (out-of-scope for v1 minimum).
- Vercel function timeout: enhance-batch capped at 60s. For very large topics (>100 cards), enhance-batch will be re-invoked by the drafts page's "Continue enhancement" button (also v2).

## 9. Code paths to delete

```
apps/admin/app/api/flashcards/upload/route.ts
apps/admin/app/api/flashcards/process/[id]/route.ts
apps/admin/app/api/flashcards/jobs/[id]/route.ts
apps/admin/app/api/flashcards/publish/[jobId]/route.ts
apps/admin/app/admin/flashcards/upload/page.tsx
apps/admin/app/admin/flashcards/review/[jobId]/page.tsx
apps/admin/components/flashcards/UploadDropzone.tsx  (or refactor for CSV)
```

## 10. Code paths to keep (legacy)

```
pdf_jobs table
flashcards.source_pdf_url column
Supabase Storage bucket "flashcard-pdfs"
```

These ensure existing PDF-imported drafts (UPCAT Science Review, UPCAT Science Reviewer, etc.) remain traceable. No new writes will land here.

## 11. Dependencies

Add to `apps/admin/package.json`:
- `papaparse@^5.4.1` — CSV parsing (browser + server)
- `@types/papaparse@^5.3.14` — TypeScript types

No other new dependencies.

## 12. Testing strategy

### Unit tests

- `parseCsvRow` (pure helper) — validates a single row, returns errors array
- `validateCsvFile` (pure helper) — file-level checks (size, encoding, header)
- `composeOptionsArray` (pure helper) — given answer + distractors → 4-option shuffled array + correct_index

### Integration tests

- API route handlers tested with mock Supabase client + mock Gemini client
- CSV parsing happy path: valid 40-row CSV → 40 cards inserted, 40 enhance jobs fired
- CSV parsing error path: row 5 missing question → import blocked, error returned

### Manual smoke tests

- Upload sample.csv with 5 cards, 2 with distractors and 3 without
- Verify drafts page shows progress climbing
- Verify enhanced cards in review page show 4 options
- Publish, verify mobile sync pulls the new cards

## 13. Out of scope (v2 candidates)

- Manual "Retry enhancement" per card
- Bulk publish from drafts page (current: per-topic)
- CSV edit-in-place after upload (current: re-upload to fix errors)
- Multi-CSV merge into single topic
- Distractor quality review UI (current: trust Gemini output)
- CSV template generator from existing topic (e.g., export → edit → re-import)
