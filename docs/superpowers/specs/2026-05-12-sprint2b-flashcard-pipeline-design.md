# Sprint 2B Design Spec — PDF-to-Flashcard Knowledge Base Pipeline

**Date:** 2026-05-12
**Author:** chrisraro
**Status:** Approved — ready for implementation

---

## 1. Scope

Sprint 2B builds the **Admin Knowledge Base Pipeline** inside `apps/admin`. It covers:

1. **PDF Upload + Extraction** — Admin uploads a PDF; Gemini API extracts Q&A pairs asynchronously.
2. **Review & Publish** — Admin reviews, edits, and tags extracted cards with target exams before publishing.
3. **Manual Entry** — Admin can add Q&A pairs without a PDF.
4. **Subjects List** — Admin can browse all published and draft topics.

**Out of scope (Sprint 3+):** Mobile app Gemma 3n generation, offline sync, on-device RAG. The `flashcards` table built here is the knowledge base that the mobile app will consume in later sprints.

---

## 2. Architecture

### 2.1 Concept

The pipeline separates two concerns that were conflated in the original spec:

- **Admin (Sprint 2B):** Extract and curate source Q&A pairs → store as knowledge base
- **Mobile (Sprint 3+):** Gemma 3n reads knowledge base via RAG and generates difficulty-adapted, exam-personalized flashcards on-device

The `flashcards` table holds canonical Q&A pairs, not final rendered cards. Gemma 3n rewrites them at runtime based on the student's chosen difficulty and target exam.

### 2.2 Processing Flow

```
Admin uploads PDF
      ↓
POST /api/flashcards/upload
  - Validate (PDF, ≤20MB)
  - Save to Supabase Storage: flashcard-pdfs/{uuid}.pdf
  - Insert pdf_jobs row (status: pending)
  - Return { jobId }
      ↓
Client calls POST /api/flashcards/process/[jobId]
  - Update job status → processing
  - Download PDF bytes from Storage
  - Send to Gemini 1.5 Flash as base64 document
  - Parse JSON response → { subject, topic, cards[] }
  - Upsert flashcard_subjects (by name)
  - Insert flashcard_topics (status: draft)
  - Insert flashcards (status: draft, source_pdf_url set)
  - Update job → { status: done, subject_id, topic_id, card_count }
      ↓
Client polling (GET /api/flashcards/jobs/[jobId] every 3s)
detects status: done → navigate to /admin/flashcards/review/[jobId]
      ↓
Admin reviews, edits cards, selects exam tags (required)
      ↓
POST /api/flashcards/publish/[jobId]
  - Flip flashcard_topics.status → published
  - Flip all linked flashcards.status → published
  - Redirect to /admin/flashcards
```

### 2.3 File Structure

```
apps/admin/
├── app/
│   ├── admin/
│   │   └── flashcards/
│   │       ├── page.tsx                    # subjects list
│   │       ├── upload/
│   │       │   └── page.tsx                # upload + processing status
│   │       ├── review/
│   │       │   └── [jobId]/
│   │       │       └── page.tsx            # review + edit + publish
│   │       └── new/
│   │           └── page.tsx                # manual Q&A entry
│   └── api/
│       └── flashcards/
│           ├── upload/
│           │   └── route.ts                # POST: save PDF, create job
│           ├── process/
│           │   └── [id]/
│           │       └── route.ts            # POST: Gemini API, write drafts
│           ├── jobs/
│           │   └── [id]/
│           │       └── route.ts            # GET: job status (polling)
│           └── publish/
│               └── [jobId]/
│                   └── route.ts            # POST: draft → published
├── components/
│   └── flashcards/
│       ├── UploadDropzone.tsx              # drag-and-drop with 3-state UI
│       ├── ProcessingStatus.tsx            # polling spinner
│       ├── CardReviewTable.tsx             # editable Q&A table
│       └── ExamTagSelector.tsx             # multi-select listing pills
```

---

## 3. Database Changes

### 3.1 Migration 005 (`005_flashcard_pipeline.sql`)

```sql
-- Add draft/published status to topics
ALTER TABLE flashcard_topics
  ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Add draft/published status and exam tags to flashcards
ALTER TABLE flashcards
  ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

ALTER TABLE flashcards
  ADD COLUMN listing_slugs text[] NOT NULL DEFAULT '{}';

-- Job tracking table
CREATE TABLE pdf_jobs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_url     text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  subject_id  uuid        REFERENCES flashcard_subjects(id),
  topic_id    uuid        REFERENCES flashcard_topics(id),
  card_count  int,
  error_msg   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pdf_jobs ENABLE ROW LEVEL SECURITY;
-- No public RLS policies — accessed via service role only
```

### 3.2 Supabase Storage

- Bucket: `flashcard-pdfs`
- Access: private (no public URL)
- Files accessed via service role in API routes only
- Naming: `{uuid}.pdf` (UUID generated at upload time)

### 3.3 `listing_slugs` field

Each flashcard stores a `listing_slugs text[]` array referencing `listings.slug` values. Mobile app filters knowledge base by the student's saved listing slugs. Admin must select at least one listing slug before publishing (enforced in review UI and publish route).

---

## 4. API Routes

### `POST /api/flashcards/upload`

- Accepts `multipart/form-data` with a `file` field
- Validates: content-type must be `application/pdf`, size ≤ 20MB
- Uploads to Supabase Storage at `flashcard-pdfs/{uuid}.pdf`
- Inserts `pdf_jobs` row with `status: pending`
- Returns `{ jobId: string }`
- Returns 400 if file missing, wrong type, or oversized
- Returns 500 on Storage or DB error

### `POST /api/flashcards/process/[id]`

- Updates job status to `processing`
- Downloads PDF bytes from Supabase Storage using the `pdf_url` from the job row
- Sends to Gemini 1.5 Flash as an inline base64 document block
- Parses JSON response (see prompt in §5)
- Upserts `flashcard_subjects` by `name` (case-insensitive match)
- Inserts `flashcard_topics` with `status: draft`, linked to subject
- Inserts all `flashcards` with `status: draft`, `source_pdf_url` set
- Updates job: `status: done`, `subject_id`, `topic_id`, `card_count`
- On any error: updates job `status: failed`, `error_msg` set; returns 500

### `GET /api/flashcards/jobs/[id]`

- Returns `{ status, card_count, error_msg, subject_id, topic_id }`
- Used by client for polling (every 3 seconds)
- Returns 404 if job not found

### `POST /api/flashcards/publish/[jobId]`

Accepts `{ listing_slugs: string[], subject_name: string, topic_name: string }` in the request body.

- Returns 400 if `listing_slugs` is empty: `{ error: 'Select at least one exam tag before publishing' }`
- Reads `topic_id` from the job row
- Updates `flashcard_topics` record: `name = topic_name, status = 'published'`
- Updates linked `flashcard_subjects` record: `name = subject_name` (allows admin edits to persist)
- Updates all linked `flashcards`: `status = 'published', listing_slugs = listing_slugs`
- Returns `{ ok: true, published: number }`

---

## 5. Gemini API Integration

### 5.1 Package

```
@google/generative-ai
```

Installed in `apps/admin`. New env var: `GEMINI_API_KEY` (free at aistudio.google.com).

### 5.2 Model

`gemini-1.5-flash` — free tier, supports PDF document input, reliable structured JSON output.

### 5.3 Prompt

```
You are extracting Q&A flashcard pairs from a study material PDF for Filipino students
preparing for scholarship and qualifying exams (DOST-SEI, UPCAT, PUPCET, CSE, etc.).

Analyze the entire document and extract the most important concepts as question-answer pairs.

Return ONLY valid JSON with this exact structure — no markdown, no explanation, no extra text:
{
  "subject": "<subject area, e.g. Science, Mathematics, Filipino, English, General Knowledge>",
  "topic": "<specific topic, e.g. Cell Biology, Algebra, Panitikang Filipino>",
  "cards": [
    {
      "question": "<clear, specific question>",
      "answer": "<concise, accurate answer>",
      "explanation": "<brief context or elaboration — empty string if not needed>",
      "difficulty": 1
    }
  ]
}

Difficulty levels:
  1 = Basic recall (definition, fact)
  2 = Application (explain, compare, compute)
  3 = Analysis/synthesis (evaluate, connect concepts)

Generate between 15 and 40 cards. Prioritize high-yield concepts for competitive exams.
```

### 5.4 PDF Delivery

PDF bytes downloaded from Supabase Storage are base64-encoded and sent as an `inlineData` part:

```typescript
{
  inlineData: {
    data: base64PdfString,
    mimeType: 'application/pdf'
  }
}
```

### 5.5 JSON Parsing

The process route wraps the Gemini response in a try/catch JSON.parse. If parsing fails or the `cards` array is missing/empty, the job is marked `failed` with `error_msg: 'Gemini returned unexpected format'`.

---

## 6. Admin UI

### 6.1 Sidebar

Remove `disabled: true` from both flashcard nav items in `Sidebar.tsx`:

```typescript
{ href: '/admin/flashcards',        icon: '🃏', label: 'Subjects' }
{ href: '/admin/flashcards/upload', icon: '📚', label: 'Upload PDF' }
```

### 6.2 Subjects List (`/admin/flashcards`)

Server Component, no cache. Table columns: Subject | Topics | Cards | Status | Actions.
- Status badge: green `PUBLISHED` or amber `DRAFT`
- Actions: "View topics" → drills into topic list with card table

### 6.3 Upload PDF (`/admin/flashcards/upload`)

Client Component. Three UI states managed in local React state:

| State | UI |
|---|---|
| `idle` | Drag-and-drop zone: "Drop PDF here or click to browse" · max 20MB label |
| `processing` | Spinner + filename + "Extracting flashcards… Gemini is reading" |
| `done` | Green success banner: "✓ N cards extracted · Subject · Topic" + "Review →" button |
| `failed` | Red error banner: error message + "Try again" button (resets to idle) |

On file select: calls `POST /api/flashcards/upload`, gets `jobId`, calls `POST /api/flashcards/process/[jobId]`, starts polling `GET /api/flashcards/jobs/[jobId]` every 3 seconds. On `status: done` poll result, transitions to `done` state.

### 6.4 Review & Publish (`/admin/flashcards/review/[jobId]`)

Client Component. Loads job data on mount.

**Header bar:** "← Upload PDF" back link · "Review Extracted Cards" title · card count badge · "Publish to Knowledge Base →" button (disabled until exam tags selected)

**Subject + Topic panel:** Two editable text inputs pre-filled with Gemini's inferred values. Admin can correct before publishing.

**Exam Tags panel:** Pill buttons for all active/upcoming listings fetched from Supabase. Maroon = selected, grey = unselected. Toggle on click. At least one required — "Publish" button stays disabled and shows inline prompt until one is selected.

**Card table:** Columns: Question | Answer | Difficulty | Actions (Edit · Delete)
- Edit: opens an inline edit row (question, answer, explanation, difficulty dropdown)
- Delete: removes the card immediately (soft-delete from draft state)
- "+ Add manually" button: appends a blank edit row

**Publish action:** Calls `POST /api/flashcards/publish/[jobId]` with selected `listing_slugs`. On success: `router.push('/admin/flashcards')`.

### 6.5 Manual Entry (`/admin/flashcards/new`)

Simple form: Subject (text input) · Topic name · repeating rows of Question / Answer / Explanation / Difficulty. "Add card" button appends a new blank row. Exam tags selector (same pill UI as review page, same required rule — at least one tag before submitting).

Submit calls `POST /api/flashcards/manual` with `{ subject_name, topic_name, listing_slugs, cards[] }`. This route creates the subject (upsert by name), topic (published immediately — no draft step for manual entries), and all cards (published) in a single transaction. Returns `{ ok: true, topic_id }`. On success: `router.push('/admin/flashcards')`.

---

## 7. Environment Variables

One new variable needed in `apps/admin/.env.local`:

```
GEMINI_API_KEY=        # get free at aistudio.google.com
```

No changes to existing variables.

---

## 8. Error Handling

| Scenario | Behaviour |
|---|---|
| PDF > 20MB | Upload route returns 400 before Storage upload; UI shows "File too large (max 20MB)" |
| Non-PDF file type | Upload route returns 400; UI shows "Only PDF files are supported" |
| Gemini returns malformed JSON | Job marked `failed`, `error_msg` set; upload page shows red banner + retry button |
| Gemini 429 / timeout | Same — job `failed`, retry resets to `idle` state |
| No exam tags on publish | Publish button disabled; inline note: "Select at least one exam or scholarship" |
| Admin navigates away mid-processing | On return to upload page, last job status shown if `jobId` is in localStorage |
| Publish route finds 0 cards | Returns 400 "No cards to publish" |

---

## 9. New Packages

| Package | Location | Purpose |
|---|---|---|
| `@google/generative-ai` | `apps/admin` | Gemini API client |

---

## 10. Success Criteria

- Admin can upload a PDF and receive extracted Q&A pairs within 60 seconds for a typical 10–30 page document
- Admin can edit subject, topic, individual cards, and delete unwanted cards before publishing
- Admin cannot publish without selecting at least one exam/scholarship tag
- Published cards appear in `/admin/flashcards` subjects list with correct counts
- Admin can manually add Q&A pairs without uploading a PDF
- Draft cards are not visible to mobile clients (RLS / status filter)
- All new API routes have unit tests (Vitest, same pattern as existing routes)
- `pnpm build` passes with no TypeScript errors
