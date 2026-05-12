# Sprint 2B — PDF-to-Flashcard Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin knowledge-base pipeline — PDF upload → Gemini extraction → review & publish — plus manual Q&A entry, so the mobile app can later consume the `flashcards` table via Gemma 3n RAG.

**Architecture:** Two async routes handle PDF processing (upload returns jobId immediately; process route calls Gemini and writes drafts; client polls jobs route every 3 s). Admin reviews extracted cards and must select at least one exam/scholarship tag before publishing. Manual entry skips the draft step and publishes immediately.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, Supabase JS v2 (`@iskotify/utils createServerClient()`), `@google/generative-ai` (Gemini 1.5 Flash), Vitest (node environment)

---

## File Map

**New files:**

| Path | Responsibility |
|---|---|
| `supabase/migrations/005_flashcard_pipeline.sql` | Add `status` + `listing_slugs` columns; create `pdf_jobs` table; create storage bucket |
| `apps/admin/app/api/flashcards/upload/route.ts` | POST: validate PDF, upload to Storage, create job row |
| `apps/admin/app/api/flashcards/upload/__tests__/route.test.ts` | Vitest tests for upload route |
| `apps/admin/app/api/flashcards/process/[id]/route.ts` | POST: download PDF, call Gemini, write draft subject/topic/cards |
| `apps/admin/app/api/flashcards/process/[id]/__tests__/route.test.ts` | Vitest tests for process route |
| `apps/admin/app/api/flashcards/jobs/[id]/route.ts` | GET: return job status for polling |
| `apps/admin/app/api/flashcards/publish/[jobId]/route.ts` | POST: flip topic + cards to published |
| `apps/admin/app/api/flashcards/jobs-publish/__tests__/route.test.ts` | Vitest tests for jobs + publish routes |
| `apps/admin/app/api/flashcards/manual/route.ts` | POST: create subject + topic + cards, published immediately |
| `apps/admin/app/api/flashcards/cards/[id]/route.ts` | PATCH + DELETE: edit / soft-delete individual draft cards |
| `apps/admin/app/api/flashcards/manual-cards/__tests__/route.test.ts` | Vitest tests for manual + cards routes |
| `apps/admin/components/flashcards/ExamTagSelector.tsx` | Pill multi-select for listing slugs |
| `apps/admin/components/flashcards/CardReviewTable.tsx` | Editable Q&A table with inline edit rows |
| `apps/admin/app/admin/flashcards/page.tsx` | Server Component: subjects list |
| `apps/admin/app/admin/flashcards/upload/page.tsx` | Client Component: upload + 4-state UI |
| `apps/admin/app/admin/flashcards/review/[jobId]/page.tsx` | Client Component: review + exam tags + publish |
| `apps/admin/app/admin/flashcards/new/page.tsx` | Client Component: manual Q&A entry form |

**Modified files:**

| Path | Change |
|---|---|
| `apps/admin/components/admin/Sidebar.tsx` | Remove `disabled: true` from both flashcard nav items |
| `apps/admin/.env.example` | Add `GEMINI_API_KEY=` |

---

## Task 1: Install `@google/generative-ai` + update `.env.example`

**Files:**
- Modify: `apps/admin/package.json` (via pnpm install)
- Modify: `apps/admin/.env.example`

- [ ] **Step 1: Install the package**

```bash
pnpm --filter @iskotify/admin add @google/generative-ai
```

Expected: `packages/utils/node_modules` and `apps/admin/node_modules` updated. `apps/admin/package.json` now has `"@google/generative-ai": "^0.x.x"` under `dependencies`.

- [ ] **Step 2: Add env var to .env.example**

In `apps/admin/.env.example`, append after the last existing entry:

```
GEMINI_API_KEY=        # get free at aistudio.google.com
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml apps/admin/.env.example
git commit -m "chore(admin): add @google/generative-ai, document GEMINI_API_KEY"
```

---

## Task 2: DB migration 005 — add status columns, listing_slugs, pdf_jobs table, storage bucket

**Files:**
- Create: `supabase/migrations/005_flashcard_pipeline.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/005_flashcard_pipeline.sql`:

```sql
-- Add draft/published status to topics
ALTER TABLE flashcard_topics
  ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Add draft/published status and exam-tag array to flashcards
ALTER TABLE flashcards
  ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

ALTER TABLE flashcards
  ADD COLUMN listing_slugs text[] NOT NULL DEFAULT '{}';

-- Job tracking table for async PDF processing
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

-- Create private storage bucket for uploaded PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'flashcard-pdfs',
  'flashcard-pdfs',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP (`mcp__supabase__apply_migration`) or run:

```bash
supabase db push
```

Verify in Supabase dashboard:
- `flashcard_topics` has a `status` column
- `flashcards` has `status` and `listing_slugs` columns
- `pdf_jobs` table exists with RLS enabled
- `flashcard-pdfs` bucket exists in Storage

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_flashcard_pipeline.sql
git commit -m "feat(db): migration 005 — status, listing_slugs, pdf_jobs, storage bucket"
```

---

## Task 3: `POST /api/flashcards/upload` route + tests

**Files:**
- Create: `apps/admin/app/api/flashcards/upload/route.ts`
- Create: `apps/admin/app/api/flashcards/upload/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/app/api/flashcards/upload/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockUpload = vi.fn()
const mockInsertSingle = vi.fn()
const mockSelectSingle = vi.fn(() => ({ single: mockInsertSingle }))
const mockInsert = vi.fn(() => ({ select: mockSelectSingle }))
const mockStorageBucket = vi.fn(() => ({ upload: mockUpload }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: mockInsert })),
    storage: { from: mockStorageBucket },
  })),
}))

async function importRoute() {
  const mod = await import('../route')
  return mod.POST
}

function makePdfRequest(file?: File) {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return new NextRequest('http://localhost/api/flashcards/upload', {
    method: 'POST',
    body: fd,
  })
}

describe('POST /api/flashcards/upload', () => {
  beforeEach(() => {
    vi.resetModules()
    mockUpload.mockClear()
    mockInsert.mockClear()
    mockSelectSingle.mockClear()
    mockInsertSingle.mockClear()
    mockStorageBucket.mockClear()
  })

  it('returns 400 when no file is provided', async () => {
    const POST = await importRoute()
    const res = await POST(makePdfRequest())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No file provided')
  })

  it('returns 400 when file is not a PDF', async () => {
    const POST = await importRoute()
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' })
    const res = await POST(makePdfRequest(file))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Only PDF files are supported')
  })

  it('returns 400 when file exceeds 20 MB', async () => {
    const POST = await importRoute()
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    const res = await POST(makePdfRequest(big))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('File too large (max 20MB)')
  })

  it('returns { jobId } on success', async () => {
    mockUpload.mockResolvedValue({ error: null })
    mockInsertSingle.mockResolvedValue({ data: { id: 'job-abc' }, error: null })
    const POST = await importRoute()
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })
    const res = await POST(makePdfRequest(file))
    expect(res.status).toBe(200)
    expect((await res.json()).jobId).toBe('job-abc')
  })

  it('returns 500 when Storage upload fails', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'quota exceeded' } })
    const POST = await importRoute()
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })
    const res = await POST(makePdfRequest(file))
    expect(res.status).toBe(500)
  })

  it('returns 500 when DB insert fails', async () => {
    mockUpload.mockResolvedValue({ error: null })
    mockInsertSingle.mockResolvedValue({ data: null, error: { message: 'constraint' } })
    const POST = await importRoute()
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })
    const res = await POST(makePdfRequest(file))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (route does not exist)**

```bash
pnpm --filter @iskotify/admin test -- --reporter=verbose
```

Expected: `Cannot find module '../route'`

- [ ] **Step 3: Implement the upload route**

Create `apps/admin/app/api/flashcards/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { randomUUID } from 'crypto'

const MAX_BYTES = 20 * 1024 * 1024

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  const supabase = createServerClient()
  const path = `${randomUUID()}.pdf`

  const bytes = await file.arrayBuffer()
  const { error: storageError } = await supabase.storage
    .from('flashcard-pdfs')
    .upload(path, bytes, { contentType: 'application/pdf' })

  if (storageError) {
    return NextResponse.json({ error: 'Storage error' }, { status: 500 })
  }

  const { data: job, error: dbError } = await supabase
    .from('pdf_jobs')
    .insert({ pdf_url: path, status: 'pending' })
    .select('id')
    .single()

  if (dbError || !job) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ jobId: job.id })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @iskotify/admin test -- --reporter=verbose
```

Expected: 6 tests pass in `upload/__tests__/route.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/api/flashcards/upload/
git commit -m "feat(admin): add POST /api/flashcards/upload with tests"
```

---

## Task 4: `POST /api/flashcards/process/[id]` route + tests

**Files:**
- Create: `apps/admin/app/api/flashcards/process/[id]/route.ts`
- Create: `apps/admin/app/api/flashcards/process/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/app/api/flashcards/process/[id]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('GEMINI_API_KEY', 'fake-gemini-key')

// ---------- Gemini mock ----------
const mockGenerateContent = vi.fn()

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({ generateContent: mockGenerateContent }),
  })),
}))

// ---------- Supabase mock ----------
// single() is called 3 times in the happy path:
//   1. update(processing) + select job row
//   2. upsert subject → subject id
//   3. insert topic → topic id
const mockSingle = vi.fn()
const mockSelectChain = vi.fn(() => ({ single: mockSingle }))
const mockEqChain = vi.fn(() => ({ select: mockSelectChain }))
const mockUpdate = vi.fn(() => ({ eq: mockEqChain }))
const mockUpsert = vi.fn(() => ({ select: mockSelectChain }))
const mockInsertSelect = vi.fn(() => ({ select: mockSelectChain }))
const mockInsertFlat = vi.fn().mockResolvedValue({ error: null })
const mockDownload = vi.fn()
const mockStorageBucket = vi.fn(() => ({ download: mockDownload }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'flashcard_subjects') return { upsert: mockUpsert }
  if (table === 'flashcard_topics')   return { insert: mockInsertSelect }
  if (table === 'flashcards')         return { insert: mockInsertFlat }
  // pdf_jobs
  return { update: mockUpdate }
})

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
    storage: { from: mockStorageBucket },
  })),
}))

const VALID_GEMINI_JSON = JSON.stringify({
  subject: 'Science',
  topic: 'Cell Biology',
  cards: [
    { question: 'Q1', answer: 'A1', explanation: '', difficulty: 1 },
  ],
})

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeReq(id = 'job-1') {
  return new NextRequest(`http://localhost/api/flashcards/process/${id}`, { method: 'POST' })
}

async function importRoute() {
  const mod = await import('../route')
  return mod.POST
}

describe('POST /api/flashcards/process/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockSelectChain.mockClear()
    mockEqChain.mockClear()
    mockUpdate.mockClear()
    mockUpsert.mockClear()
    mockInsertSelect.mockClear()
    mockInsertFlat.mockClear()
    mockDownload.mockClear()
    mockStorageBucket.mockClear()
    mockFrom.mockClear()
    mockGenerateContent.mockClear()
  })

  it('returns 404 when job does not exist', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('missing'))
    expect(res.status).toBe(404)
  })

  it('returns 200 and writes draft cards on success', async () => {
    // update job → processing: returns job row
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'job-1', pdf_url: 'abc.pdf' }, error: null })
      // upsert subject
      .mockResolvedValueOnce({ data: { id: 'subj-1' }, error: null })
      // insert topic
      .mockResolvedValueOnce({ data: { id: 'topic-1' }, error: null })

    mockDownload.mockResolvedValue({
      data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      error: null,
    })

    mockGenerateContent.mockResolvedValue({
      response: { text: () => VALID_GEMINI_JSON },
    })

    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('job-1'))
    expect(res.status).toBe(200)
    expect(mockInsertFlat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ question: 'Q1', status: 'draft', topic_id: 'topic-1' }),
      ])
    )
  })

  it('marks job failed when Gemini returns malformed JSON', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'job-1', pdf_url: 'abc.pdf' }, error: null })
    mockDownload.mockResolvedValue({
      data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      error: null,
    })
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'not json at all' },
    })

    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('job-1'))
    expect(res.status).toBe(500)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error_msg: 'Gemini returned unexpected format' })
    )
  })

  it('marks job failed when Gemini returns empty cards array', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'job-1', pdf_url: 'abc.pdf' }, error: null })
    mockDownload.mockResolvedValue({
      data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      error: null,
    })
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ subject: 'X', topic: 'Y', cards: [] }) },
    })

    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('job-1'))
    expect(res.status).toBe(500)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    )
  })

  it('marks job failed when PDF download fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'job-1', pdf_url: 'abc.pdf' }, error: null })
    mockDownload.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('job-1'))
    expect(res.status).toBe(500)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (route does not exist)**

```bash
pnpm --filter @iskotify/admin test -- --reporter=verbose
```

Expected: `Cannot find module '../route'`

- [ ] **Step 3: Implement the process route**

Create `apps/admin/app/api/flashcards/process/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { GoogleGenerativeAI } from '@google/generative-ai'

const PROMPT = `You are extracting Q&A flashcard pairs from a study material PDF for Filipino students
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

Generate between 15 and 40 cards. Prioritize high-yield concepts for competitive exams.`

interface GeminiCard {
  question: string
  answer: string
  explanation: string
  difficulty: number
}

interface GeminiResponse {
  subject: string
  topic: string
  cards: GeminiCard[]
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: job, error: fetchError } = await supabase
    .from('pdf_jobs')
    .update({ status: 'processing' })
    .eq('id', id)
    .select('id, pdf_url')
    .single()

  if (fetchError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  async function failJob(msg: string) {
    await supabase
      .from('pdf_jobs')
      .update({ status: 'failed', error_msg: msg })
      .eq('id', id)
  }

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('flashcard-pdfs')
      .download(job.pdf_url)

    if (downloadError || !fileBlob) throw new Error('Failed to download PDF')

    const buffer = await fileBlob.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const result = await model.generateContent([
      { text: PROMPT },
      { inlineData: { data: base64, mimeType: 'application/pdf' } },
    ])

    const raw = result.response.text()
    let parsed: GeminiResponse
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('Gemini returned unexpected format')
    }

    if (!parsed.cards || parsed.cards.length === 0) {
      throw new Error('Gemini returned unexpected format')
    }

    const { data: subject, error: subjectError } = await supabase
      .from('flashcard_subjects')
      .upsert({ name: parsed.subject }, { onConflict: 'name' })
      .select('id')
      .single()

    if (subjectError || !subject) throw new Error('Failed to upsert subject')

    const { data: topic, error: topicError } = await supabase
      .from('flashcard_topics')
      .insert({ name: parsed.topic, subject_id: subject.id, status: 'draft' })
      .select('id')
      .single()

    if (topicError || !topic) throw new Error('Failed to insert topic')

    const cards = parsed.cards.map((c) => ({
      topic_id: topic.id,
      question: c.question,
      answer: c.answer,
      explanation: c.explanation,
      difficulty: c.difficulty,
      status: 'draft',
      source_pdf_url: job.pdf_url,
      listing_slugs: [],
    }))

    const { error: cardsError } = await supabase.from('flashcards').insert(cards)
    if (cardsError) throw new Error('Failed to insert flashcards')

    await supabase
      .from('pdf_jobs')
      .update({ status: 'done', subject_id: subject.id, topic_id: topic.id, card_count: cards.length })
      .eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    await failJob(err instanceof Error ? err.message : 'Unknown error')
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @iskotify/admin test -- --reporter=verbose
```

Expected: 4 tests pass in `process/[id]/__tests__/route.test.ts` (plus all earlier tests still green)

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/api/flashcards/process/
git commit -m "feat(admin): add POST /api/flashcards/process/[id] with Gemini extraction and tests"
```

---

## Task 5: `GET /api/flashcards/jobs/[id]` + `POST /api/flashcards/publish/[jobId]` + tests

**Files:**
- Create: `apps/admin/app/api/flashcards/jobs/[id]/route.ts`
- Create: `apps/admin/app/api/flashcards/publish/[jobId]/route.ts`
- Create: `apps/admin/app/api/flashcards/jobs-publish/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/app/api/flashcards/jobs-publish/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

// ---------- Shared mock building blocks ----------
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockEqFlat = vi.fn().mockResolvedValue({ error: null })
const mockUpdateEqFlat = vi.fn(() => ({ eq: mockEqFlat }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'pdf_jobs') return { select: mockSelect, update: mockUpdateEqFlat }
      if (table === 'flashcard_subjects') return { update: mockUpdateEqFlat }
      if (table === 'flashcard_topics') return { update: mockUpdateEqFlat }
      if (table === 'flashcards') return { select: mockSelect, update: mockUpdateEqFlat }
      return { select: mockSelect, update: mockUpdateEqFlat }
    }),
  })),
}))

// ---------- Jobs route ----------
describe('GET /api/flashcards/jobs/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockEq.mockClear()
    mockSelect.mockClear()
  })

  it('returns job fields when found', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { status: 'done', card_count: 28, error_msg: null, subject_id: 'subj-1', topic_id: 'topic-1' },
      error: null,
    })
    const { GET } = await import('../../jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/jobs/job-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'job-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('done')
    expect(body.card_count).toBe(28)
  })

  it('returns 404 when job not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    const { GET } = await import('../../jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/jobs/bad')
    const res = await GET(req, { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })
})

// ---------- Publish route ----------
describe('POST /api/flashcards/publish/[jobId]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockEq.mockClear()
    mockSelect.mockClear()
    mockEqFlat.mockClear()
    mockUpdateEqFlat.mockClear()
  })

  function makePublishReq(jobId: string, body: object) {
    return new NextRequest(`http://localhost/api/flashcards/publish/${jobId}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 400 when listing_slugs is empty', async () => {
    const { POST } = await import('../../publish/[jobId]/route')
    const res = await POST(
      makePublishReq('job-1', { listing_slugs: [], subject_name: 'Science', topic_name: 'Cell Bio' }),
      { params: Promise.resolve({ jobId: 'job-1' }) }
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/exam tag/i)
  })

  it('returns 400 when there are no cards to publish', async () => {
    // job lookup → returns job row
    mockSingle
      .mockResolvedValueOnce({ data: { topic_id: 'topic-1', subject_id: 'subj-1' }, error: null })
      // flashcards select → empty
      .mockResolvedValueOnce({ data: [], error: null })
    const { POST } = await import('../../publish/[jobId]/route')
    const res = await POST(
      makePublishReq('job-1', { listing_slugs: ['dost-2026'], subject_name: 'Science', topic_name: 'Cell Bio' }),
      { params: Promise.resolve({ jobId: 'job-1' }) }
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no cards/i)
  })

  it('publishes topic and cards and returns { ok, published }', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { topic_id: 'topic-1', subject_id: 'subj-1' }, error: null })
      .mockResolvedValueOnce({ data: [{ id: 'card-1' }, { id: 'card-2' }], error: null })
    const { POST } = await import('../../publish/[jobId]/route')
    const res = await POST(
      makePublishReq('job-1', {
        listing_slugs: ['dost-2026'],
        subject_name: 'Science',
        topic_name: 'Cell Biology',
      }),
      { params: Promise.resolve({ jobId: 'job-1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.published).toBe(2)
  })

  it('returns 404 when job not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    const { POST } = await import('../../publish/[jobId]/route')
    const res = await POST(
      makePublishReq('bad', { listing_slugs: ['x'], subject_name: 'S', topic_name: 'T' }),
      { params: Promise.resolve({ jobId: 'bad' }) }
    )
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @iskotify/admin test -- --reporter=verbose
```

Expected: `Cannot find module '../../jobs/[id]/route'` and similar.

- [ ] **Step 3: Implement jobs route**

Create `apps/admin/app/api/flashcards/jobs/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: job, error } = await supabase
    .from('pdf_jobs')
    .select('status, card_count, error_msg, subject_id, topic_id')
    .eq('id', id)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json(job)
}
```

- [ ] **Step 4: Implement publish route**

Create `apps/admin/app/api/flashcards/publish/[jobId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const body = await req.json()
  const { listing_slugs, subject_name, topic_name } = body as {
    listing_slugs: string[]
    subject_name: string
    topic_name: string
  }

  if (!listing_slugs || listing_slugs.length === 0) {
    return NextResponse.json(
      { error: 'Select at least one exam tag before publishing' },
      { status: 400 }
    )
  }

  const supabase = createServerClient()

  const { data: job, error: jobError } = await supabase
    .from('pdf_jobs')
    .select('topic_id, subject_id')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { data: cards, error: cardsError } = await supabase
    .from('flashcards')
    .select('id')
    .eq('topic_id', job.topic_id)
    .single()

  if (cardsError) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  const cardList = Array.isArray(cards) ? cards : cards ? [cards] : []
  if (cardList.length === 0) {
    return NextResponse.json({ error: 'No cards to publish' }, { status: 400 })
  }

  const { error: subjErr } = await supabase
    .from('flashcard_subjects')
    .update({ name: subject_name })
    .eq('id', job.subject_id)

  if (subjErr) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  const { error: topicErr } = await supabase
    .from('flashcard_topics')
    .update({ name: topic_name, status: 'published' })
    .eq('id', job.topic_id)

  if (topicErr) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  const { error: cardsUpdateErr } = await supabase
    .from('flashcards')
    .update({ status: 'published', listing_slugs })
    .eq('topic_id', job.topic_id)

  if (cardsUpdateErr) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  return NextResponse.json({ ok: true, published: cardList.length })
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm --filter @iskotify/admin test -- --reporter=verbose
```

Expected: 6 new tests pass, all earlier tests still green.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/api/flashcards/jobs/ apps/admin/app/api/flashcards/publish/ apps/admin/app/api/flashcards/jobs-publish/
git commit -m "feat(admin): add jobs + publish API routes with tests"
```

---

## Task 6: `POST /api/flashcards/manual` + `PATCH/DELETE /api/flashcards/cards/[id]` + tests

**Files:**
- Create: `apps/admin/app/api/flashcards/manual/route.ts`
- Create: `apps/admin/app/api/flashcards/cards/[id]/route.ts`
- Create: `apps/admin/app/api/flashcards/manual-cards/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/app/api/flashcards/manual-cards/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockSingle = vi.fn()
const mockSelectSingle = vi.fn(() => ({ single: mockSingle }))
const mockUpsert = vi.fn(() => ({ select: mockSelectSingle }))
const mockInsert = vi.fn(() => ({ select: mockSelectSingle }))
const mockInsertFlat = vi.fn().mockResolvedValue({ error: null })
const mockEqFlat = vi.fn().mockResolvedValue({ error: null })
const mockUpdateEq = vi.fn(() => ({ eq: mockEqFlat }))
const mockDeleteEq = vi.fn(() => ({ eq: mockEqFlat }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'flashcard_subjects') return { upsert: mockUpsert }
      if (table === 'flashcard_topics')   return { insert: mockInsert }
      if (table === 'flashcards')         return { insert: mockInsertFlat, update: mockUpdateEq, delete: () => ({ eq: mockEqFlat }) }
      return {}
    }),
  })),
}))

// ---------- Manual route ----------
describe('POST /api/flashcards/manual', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockUpsert.mockClear()
    mockInsert.mockClear()
    mockInsertFlat.mockClear()
  })

  function makeManualReq(body: object) {
    return new NextRequest('http://localhost/api/flashcards/manual', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('../../manual/route')
    const res = await POST(makeManualReq({ subject_name: 'Science' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is empty', async () => {
    const { POST } = await import('../../manual/route')
    const res = await POST(
      makeManualReq({
        subject_name: 'Science',
        topic_name: 'Physics',
        listing_slugs: [],
        cards: [{ question: 'Q', answer: 'A', explanation: '', difficulty: 1 }],
      })
    )
    expect(res.status).toBe(400)
  })

  it('creates subject, topic, and cards; returns { ok, topic_id }', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'subj-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'topic-1' }, error: null })

    const { POST } = await import('../../manual/route')
    const res = await POST(
      makeManualReq({
        subject_name: 'Science',
        topic_name: 'Physics',
        listing_slugs: ['dost-2026'],
        cards: [{ question: 'Q', answer: 'A', explanation: '', difficulty: 1 }],
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.topic_id).toBe('topic-1')
    expect(mockInsertFlat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'published', listing_slugs: ['dost-2026'] }),
      ])
    )
  })

  it('returns 500 when Supabase fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    const { POST } = await import('../../manual/route')
    const res = await POST(
      makeManualReq({
        subject_name: 'Science',
        topic_name: 'Physics',
        listing_slugs: ['x'],
        cards: [{ question: 'Q', answer: 'A', explanation: '', difficulty: 1 }],
      })
    )
    expect(res.status).toBe(500)
  })
})

// ---------- Cards PATCH/DELETE route ----------
describe('PATCH /api/flashcards/cards/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockEqFlat.mockClear()
    mockUpdateEq.mockClear()
  })

  it('updates card and returns 200', async () => {
    mockEqFlat.mockResolvedValueOnce({ error: null })
    const { PATCH } = await import('../../cards/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/cards/card-1', {
      method: 'PATCH',
      body: JSON.stringify({ answer: 'Updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'card-1' }) })
    expect(res.status).toBe(200)
    expect(mockEqFlat).toHaveBeenCalledWith('id', 'card-1')
  })

  it('returns 500 when update fails', async () => {
    mockEqFlat.mockResolvedValueOnce({ error: { message: 'DB error' } })
    const { PATCH } = await import('../../cards/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/cards/card-1', {
      method: 'PATCH',
      body: JSON.stringify({ answer: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'card-1' }) })
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/flashcards/cards/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockEqFlat.mockClear()
  })

  it('deletes card and returns 200', async () => {
    mockEqFlat.mockResolvedValueOnce({ error: null })
    const { DELETE } = await import('../../cards/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/cards/card-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'card-1' }) })
    expect(res.status).toBe(200)
  })

  it('returns 500 when delete fails', async () => {
    mockEqFlat.mockResolvedValueOnce({ error: { message: 'DB error' } })
    const { DELETE } = await import('../../cards/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/cards/card-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'card-1' }) })
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @iskotify/admin test -- --reporter=verbose
```

Expected: `Cannot find module '../../manual/route'`

- [ ] **Step 3: Implement manual route**

Create `apps/admin/app/api/flashcards/manual/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

interface CardInput {
  question: string
  answer: string
  explanation?: string
  difficulty: number
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { subject_name, topic_name, listing_slugs, cards } = body as {
    subject_name?: string
    topic_name?: string
    listing_slugs?: string[]
    cards?: CardInput[]
  }

  if (!subject_name || !topic_name || !listing_slugs || listing_slugs.length === 0 || !cards || cards.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: subject, error: subjectError } = await supabase
    .from('flashcard_subjects')
    .upsert({ name: subject_name }, { onConflict: 'name' })
    .select('id')
    .single()

  if (subjectError || !subject) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const { data: topic, error: topicError } = await supabase
    .from('flashcard_topics')
    .insert({ name: topic_name, subject_id: subject.id, status: 'published' })
    .select('id')
    .single()

  if (topicError || !topic) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const flashcards = cards.map((c) => ({
    topic_id: topic.id,
    question: c.question,
    answer: c.answer,
    explanation: c.explanation ?? '',
    difficulty: c.difficulty,
    status: 'published',
    listing_slugs,
  }))

  const { error: cardsError } = await supabase.from('flashcards').insert(flashcards)
  if (cardsError) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, topic_id: topic.id })
}
```

- [ ] **Step 4: Implement cards route**

Create `apps/admin/app/api/flashcards/cards/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const supabase = createServerClient()

  const { error } = await supabase
    .from('flashcards')
    .update(body)
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { error } = await supabase
    .from('flashcards')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm --filter @iskotify/admin test -- --reporter=verbose
```

Expected: 8 new tests pass, all earlier tests still green.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/api/flashcards/manual/ apps/admin/app/api/flashcards/cards/ apps/admin/app/api/flashcards/manual-cards/
git commit -m "feat(admin): add manual entry + card PATCH/DELETE routes with tests"
```

---

## Task 7: Subjects list page + enable sidebar nav items

**Files:**
- Create: `apps/admin/app/admin/flashcards/page.tsx`
- Modify: `apps/admin/components/admin/Sidebar.tsx`

- [ ] **Step 1: Remove `disabled: true` from flashcard nav items in Sidebar**

In `apps/admin/components/admin/Sidebar.tsx`, replace:

```typescript
  {
    section: 'FLASHCARDS',
    items: [
      { href: '/admin/flashcards', icon: '🃏', label: 'Subjects', disabled: true },
      { href: '/admin/flashcards/upload', icon: '📚', label: 'Upload PDF', disabled: true }
    ]
  }
```

With:

```typescript
  {
    section: 'FLASHCARDS',
    items: [
      { href: '/admin/flashcards', icon: '🃏', label: 'Subjects' },
      { href: '/admin/flashcards/upload', icon: '📚', label: 'Upload PDF' }
    ]
  }
```

- [ ] **Step 2: Implement subjects list page**

Create `apps/admin/app/admin/flashcards/page.tsx`:

```typescript
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getData() {
  const db = createServerClient()
  const { data: subjects } = await db
    .from('flashcard_subjects')
    .select(`
      id,
      name,
      flashcard_topics (
        id,
        name,
        status,
        flashcards (id, status)
      )
    `)
    .order('name')
  return subjects ?? []
}

type Subject = Awaited<ReturnType<typeof getData>>[number]

function statusBadge(status: string) {
  return status === 'published'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">PUBLISHED</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">DRAFT</span>
}

export default async function FlashcardsPage() {
  const subjects = await getData()

  return (
    <>
      <Topbar title="Knowledge Base" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#6e6e73]">{subjects.length} subject{subjects.length !== 1 ? 's' : ''}</p>
          <div className="flex gap-2">
            <Link
              href="/admin/flashcards/new"
              className="px-3 py-1.5 text-xs font-semibold border border-[#d1d5db] rounded-lg text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors"
            >
              + Add manually
            </Link>
            <Link
              href="/admin/flashcards/upload"
              className="px-3 py-1.5 text-xs font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] transition-colors"
            >
              Upload PDF
            </Link>
          </div>
        </div>

        {subjects.length === 0 ? (
          <div className="text-center py-16 text-[#6e6e73] text-sm">
            No subjects yet. Upload a PDF or add cards manually.
          </div>
        ) : (
          <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Subject</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Topics</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Cards</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Status</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((subject) => {
                  const topics = (subject.flashcard_topics ?? []) as Array<{ id: string; name: string; status: string; flashcards: Array<{ id: string; status: string }> }>
                  const totalCards = topics.reduce((sum, t) => sum + (t.flashcards?.length ?? 0), 0)
                  const hasPublished = topics.some(t => t.status === 'published')
                  const overallStatus = hasPublished ? 'published' : 'draft'
                  return (
                    <tr key={subject.id} className="border-b border-[#f3f4f6] last:border-0">
                      <td className="px-5 py-3 font-medium text-[#1d1d1f]">{subject.name}</td>
                      <td className="px-5 py-3 text-[#374151]">{topics.length}</td>
                      <td className="px-5 py-3 text-[#374151]">{totalCards}</td>
                      <td className="px-5 py-3">{statusBadge(overallStatus)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Run build to confirm no TypeScript errors**

```bash
pnpm --filter @iskotify/admin build
```

Expected: build succeeds; `/admin/flashcards` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/admin/flashcards/page.tsx apps/admin/components/admin/Sidebar.tsx
git commit -m "feat(admin): add subjects list page, enable flashcard sidebar nav"
```

---

## Task 8: UploadDropzone component + Upload page (4 states)

**Files:**
- Create: `apps/admin/components/flashcards/UploadDropzone.tsx`
- Create: `apps/admin/app/admin/flashcards/upload/page.tsx`

- [ ] **Step 1: Implement UploadDropzone**

Create `apps/admin/components/flashcards/UploadDropzone.tsx`:

```typescript
'use client'

import { useRef } from 'react'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

export function UploadDropzone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
        disabled
          ? 'border-[#d1d5db] cursor-default opacity-50'
          : 'border-[#ccc] hover:border-[#800000] cursor-pointer'
      }`}
    >
      <div className="text-3xl mb-2">📄</div>
      <p className="font-semibold text-[#1d1d1f] text-sm">Drop PDF here or click to browse</p>
      <p className="text-[#6e6e73] text-xs mt-1">Max 20MB · PDF only</p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
```

- [ ] **Step 2: Implement upload page**

Create `apps/admin/app/admin/flashcards/upload/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { UploadDropzone } from '@/components/flashcards/UploadDropzone'

type UIState = 'idle' | 'processing' | 'done' | 'failed'

interface DoneData {
  cardCount: number
  subject: string
  topic: string
  jobId: string
}

const JOB_KEY = 'iskotify_last_job_id'
const POLL_MS = 3000

export default function UploadPDFPage() {
  const router = useRouter()
  const [uiState, setUiState] = useState<UIState>('idle')
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [doneData, setDoneData] = useState<DoneData | null>(null)

  useEffect(() => {
    const savedJobId = localStorage.getItem(JOB_KEY)
    if (savedJobId) resumePolling(savedJobId)
  }, [])

  async function handleFile(file: File) {
    setFileName(file.name)
    setUiState('processing')

    const fd = new FormData()
    fd.append('file', file)

    const uploadRes = await fetch('/api/flashcards/upload', { method: 'POST', body: fd })
    if (!uploadRes.ok) {
      const { error } = await uploadRes.json()
      setErrorMsg(error ?? 'Upload failed')
      setUiState('failed')
      return
    }

    const { jobId } = await uploadRes.json()
    localStorage.setItem(JOB_KEY, jobId)

    await fetch(`/api/flashcards/process/${jobId}`, { method: 'POST' })
    resumePolling(jobId)
  }

  function resumePolling(jobId: string) {
    setUiState('processing')
    const timer = setInterval(async () => {
      const res = await fetch(`/api/flashcards/jobs/${jobId}`)
      if (!res.ok) return
      const job = await res.json()

      if (job.status === 'done') {
        clearInterval(timer)
        localStorage.removeItem(JOB_KEY)
        const subjectRes = await fetch(
          `/api/flashcards/jobs/${jobId}`
        )
        const jobData = await subjectRes.json()
        setDoneData({
          cardCount: jobData.card_count,
          subject: '',
          topic: '',
          jobId,
        })
        setUiState('done')
      } else if (job.status === 'failed') {
        clearInterval(timer)
        localStorage.removeItem(JOB_KEY)
        setErrorMsg(job.error_msg ?? 'Extraction failed')
        setUiState('failed')
      }
    }, POLL_MS)
  }

  return (
    <>
      <Topbar title="Upload PDF" />
      <div className="flex-1 overflow-y-auto p-6 max-w-xl">
        {uiState === 'idle' && (
          <UploadDropzone onFile={handleFile} />
        )}

        {uiState === 'processing' && (
          <div className="border border-[#e5e7eb] rounded-xl p-5 bg-white flex items-center gap-4">
            <div className="w-8 h-8 border-[3px] border-[#800000] border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="font-semibold text-[#1d1d1f] text-sm">Extracting flashcards…</p>
              <p className="text-[#6e6e73] text-xs mt-0.5">{fileName} · Gemini is reading</p>
            </div>
          </div>
        )}

        {uiState === 'done' && doneData && (
          <div className="border border-[#bbf7d0] rounded-xl p-5 bg-[#f0fdf4] flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-[#166534] text-sm">✓ {doneData.cardCount} cards extracted</p>
              <p className="text-[#6e6e73] text-xs mt-0.5">Ready to review</p>
            </div>
            <button
              onClick={() => router.push(`/admin/flashcards/review/${doneData.jobId}`)}
              className="px-4 py-2 bg-[#800000] text-white text-xs font-semibold rounded-lg hover:bg-[#6b0000] transition-colors"
            >
              Review →
            </button>
          </div>
        )}

        {uiState === 'failed' && (
          <div className="border border-[#fecaca] rounded-xl p-5 bg-[#fef2f2] flex items-center justify-between gap-4">
            <p className="text-[#800000] text-sm font-medium">{errorMsg}</p>
            <button
              onClick={() => { setUiState('idle'); setErrorMsg('') }}
              className="px-3 py-1.5 text-xs font-semibold border border-[#fecaca] rounded-lg text-[#800000] hover:bg-[#fee2e2] transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Run build check**

```bash
pnpm --filter @iskotify/admin build
```

Expected: build succeeds; `/admin/flashcards/upload` route appears.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/flashcards/UploadDropzone.tsx apps/admin/app/admin/flashcards/upload/
git commit -m "feat(admin): add upload PDF page with 4-state UI"
```

---

## Task 9: `ExamTagSelector` component

**Files:**
- Create: `apps/admin/components/flashcards/ExamTagSelector.tsx`

- [ ] **Step 1: Implement ExamTagSelector**

Create `apps/admin/components/flashcards/ExamTagSelector.tsx`:

```typescript
'use client'

interface Listing {
  slug: string
  title: string
}

interface Props {
  listings: Listing[]
  selected: string[]
  onChange: (slugs: string[]) => void
}

export function ExamTagSelector({ listings, selected, onChange }: Props) {
  function toggle(slug: string) {
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug))
    } else {
      onChange([...selected, slug])
    }
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
      <p className="text-[11px] font-bold text-[#800000] uppercase tracking-wider mb-1">
        Relevant Exams &amp; Scholarships
      </p>
      <p className="text-[11px] text-[#6e6e73] mb-3">
        Mobile app uses these tags to surface cards to students based on their target exam.
      </p>
      <div className="flex flex-wrap gap-2">
        {listings.map((l) => {
          const active = selected.includes(l.slug)
          return (
            <button
              key={l.slug}
              onClick={() => toggle(l.slug)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                active
                  ? 'bg-[#fef2f2] text-[#800000] border-[#fecaca]'
                  : 'bg-[#f5f5f7] text-[#6e6e73] border-[#e5e7eb]'
              }`}
            >
              {active ? '✓ ' : '+ '}{l.title}
            </button>
          )
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-[11px] text-[#800000] mt-2">Select at least one exam or scholarship</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/components/flashcards/ExamTagSelector.tsx
git commit -m "feat(admin): add ExamTagSelector pill multi-select component"
```

---

## Task 10: `CardReviewTable` component

**Files:**
- Create: `apps/admin/components/flashcards/CardReviewTable.tsx`

- [ ] **Step 1: Implement CardReviewTable**

Create `apps/admin/components/flashcards/CardReviewTable.tsx`:

```typescript
'use client'

import { useState } from 'react'

export interface Card {
  id: string
  question: string
  answer: string
  explanation: string
  difficulty: number
}

interface Props {
  cards: Card[]
  onUpdate: (id: string, updates: Partial<Card>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAdd: () => void
}

const DIFFICULTY_LABELS: Record<number, { label: string; className: string }> = {
  1: { label: 'Easy',   className: 'bg-green-100 text-green-800' },
  2: { label: 'Medium', className: 'bg-amber-100 text-amber-800' },
  3: { label: 'Hard',   className: 'bg-red-100 text-red-800' },
}

export function CardReviewTable({ cards, onUpdate, onDelete, onAdd }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Card>>({})

  function startEdit(card: Card) {
    setEditingId(card.id)
    setDraft({ question: card.question, answer: card.answer, explanation: card.explanation, difficulty: card.difficulty })
  }

  async function saveEdit(id: string) {
    await onUpdate(id, draft)
    setEditingId(null)
    setDraft({})
  }

  const diff = DIFFICULTY_LABELS

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#f3f4f6] flex items-center justify-between">
        <span className="font-bold text-xs text-[#1d1d1f]">Extracted Cards</span>
        <button
          onClick={onAdd}
          className="border border-[#d1d5db] rounded-lg px-3 py-1 text-xs text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors"
        >
          + Add manually
        </button>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
            <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[35%]">Question</th>
            <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[35%]">Answer</th>
            <th className="px-4 py-2.5 text-center text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[10%]">Difficulty</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[20%]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) =>
            editingId === card.id ? (
              <tr key={card.id} className="border-b border-[#f3f4f6] bg-[#fffbeb]">
                <td className="px-4 py-2">
                  <textarea
                    value={draft.question ?? ''}
                    onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                    className="w-full border border-[#d1d5db] rounded-md p-1.5 text-xs resize-none"
                    rows={3}
                  />
                </td>
                <td className="px-4 py-2">
                  <textarea
                    value={draft.answer ?? ''}
                    onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                    className="w-full border border-[#d1d5db] rounded-md p-1.5 text-xs resize-none"
                    rows={3}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <select
                    value={draft.difficulty ?? 1}
                    onChange={(e) => setDraft({ ...draft, difficulty: Number(e.target.value) })}
                    className="border border-[#d1d5db] rounded-md px-1 py-1 text-xs"
                  >
                    <option value={1}>Easy</option>
                    <option value={2}>Medium</option>
                    <option value={3}>Hard</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => saveEdit(card.id)}
                      className="bg-[#800000] text-white rounded-md px-2 py-1 text-[11px] font-semibold"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="border border-[#d1d5db] rounded-md px-2 py-1 text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={card.id} className="border-b border-[#f3f4f6] last:border-0">
                <td className="px-4 py-2.5 text-[#1d1d1f]">{card.question}</td>
                <td className="px-4 py-2.5 text-[#374151]">{card.answer}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${diff[card.difficulty]?.className ?? diff[1].className}`}>
                    {diff[card.difficulty]?.label ?? 'Easy'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => startEdit(card)}
                      className="bg-[#f5f5f7] border-0 rounded-md px-2 py-1 text-[11px]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(card.id)}
                      className="bg-[#fff0f0] border-0 rounded-md px-2 py-1 text-[11px] text-[#800000]"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/components/flashcards/CardReviewTable.tsx
git commit -m "feat(admin): add CardReviewTable editable Q&A component"
```

---

## Task 11: Review & Publish page

**Files:**
- Create: `apps/admin/app/admin/flashcards/review/[jobId]/page.tsx`

- [ ] **Step 1: Implement the review page**

Create `apps/admin/app/admin/flashcards/review/[jobId]/page.tsx`:

```typescript
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExamTagSelector } from '@/components/flashcards/ExamTagSelector'
import { CardReviewTable, type Card } from '@/components/flashcards/CardReviewTable'

interface Listing {
  slug: string
  title: string
}

interface PageProps {
  params: Promise<{ jobId: string }>
}

export default function ReviewPage({ params }: PageProps) {
  const { jobId } = use(params)
  const router = useRouter()

  const [cards, setCards] = useState<Card[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [subjectName, setSubjectName] = useState('')
  const [topicName, setTopicName] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [jobRes, listingsRes] = await Promise.all([
        fetch(`/api/flashcards/jobs/${jobId}`),
        fetch('/api/admin/listings'),
      ])
      const job = await jobRes.json()
      const listingsData = await listingsRes.json()

      if (job.topic_id) {
        const [cardsRes, topicRes, subjectRes] = await Promise.all([
          fetch(`/api/flashcards/cards?topic_id=${job.topic_id}`),
          fetch(`/api/flashcards/topics/${job.topic_id}`),
          fetch(`/api/flashcards/subjects/${job.subject_id}`),
        ])
        if (cardsRes.ok) setCards(await cardsRes.json())
        if (topicRes.ok) setTopicName((await topicRes.json()).name ?? '')
        if (subjectRes.ok) setSubjectName((await subjectRes.json()).name ?? '')
      }

      setListings((listingsData ?? []).map((l: { slug: string; title: string }) => ({ slug: l.slug, title: l.title })))
      setLoading(false)
    }
    load()
  }, [jobId])

  async function handleUpdate(id: string, updates: Partial<Card>) {
    await fetch(`/api/flashcards/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
      headers: { 'Content-Type': 'application/json' },
    })
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/flashcards/cards/${id}`, { method: 'DELETE' })
    setCards((prev) => prev.filter((c) => c.id !== id))
  }

  function handleAdd() {
    const blank: Card = {
      id: `new-${Date.now()}`,
      question: '',
      answer: '',
      explanation: '',
      difficulty: 1,
    }
    setCards((prev) => [...prev, blank])
  }

  async function handlePublish() {
    if (selectedSlugs.length === 0 || publishing) return
    setPublishing(true)
    const res = await fetch(`/api/flashcards/publish/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ listing_slugs: selectedSlugs, subject_name: subjectName, topic_name: topicName }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (res.ok) {
      router.push('/admin/flashcards')
    } else {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="w-8 h-8 border-[3px] border-[#800000] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e7eb] bg-[#fafafa]">
        <div className="flex items-center gap-3">
          <Link href="/admin/flashcards/upload" className="text-xs text-[#6e6e73]">← Upload PDF</Link>
          <span className="text-[#ccc]">|</span>
          <span className="font-bold text-[#1d1d1f] text-sm">Review Extracted Cards</span>
          <span className="bg-green-100 text-green-800 text-[10px] font-semibold rounded-full px-2 py-0.5">
            {cards.length} cards
          </span>
        </div>
        <button
          onClick={handlePublish}
          disabled={selectedSlugs.length === 0 || publishing}
          className="px-4 py-2 bg-[#800000] text-white text-xs font-semibold rounded-full hover:bg-[#6b0000] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {publishing ? 'Publishing…' : 'Publish to Knowledge Base →'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Subject / Topic inputs */}
        <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
          <p className="text-[11px] font-bold text-[#800000] uppercase tracking-wider mb-3">
            Inferred by Gemini — edit if needed
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">SUBJECT</label>
              <input
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full font-semibold text-[#1d1d1f]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">TOPIC</label>
              <input
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                className="border border-[#800000] rounded-lg px-3 py-2 text-sm w-full font-semibold text-[#1d1d1f]"
              />
            </div>
          </div>
        </div>

        <ExamTagSelector
          listings={listings}
          selected={selectedSlugs}
          onChange={setSelectedSlugs}
        />

        <CardReviewTable
          cards={cards}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      </div>
    </div>
  )
}
```

**Note:** The review page fetches cards, topic, and subject via three additional routes that read draft data. Add these three read-only GET routes before running the build check:

Create `apps/admin/app/api/flashcards/cards/route.ts` (GET cards by topic):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(req: NextRequest) {
  const topicId = req.nextUrl.searchParams.get('topic_id')
  if (!topicId) return NextResponse.json({ error: 'topic_id required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcards')
    .select('id, question, answer, explanation, difficulty')
    .eq('topic_id', topicId)
    .order('created_at')

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

Create `apps/admin/app/api/flashcards/topics/[id]/route.ts` (GET single topic):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcard_topics')
    .select('id, name, status')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
```

Create `apps/admin/app/api/flashcards/subjects/[id]/route.ts` (GET single subject):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcard_subjects')
    .select('id, name')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Run build check**

```bash
pnpm --filter @iskotify/admin build
```

Expected: build succeeds; `/admin/flashcards/review/[jobId]` appears in the route list.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/admin/flashcards/review/ apps/admin/app/api/flashcards/cards/route.ts apps/admin/app/api/flashcards/topics/ apps/admin/app/api/flashcards/subjects/
git commit -m "feat(admin): add review & publish page with subject/topic/card read routes"
```

---

## Task 12: Manual entry page

**Files:**
- Create: `apps/admin/app/admin/flashcards/new/page.tsx`

- [ ] **Step 1: Implement manual entry page**

Create `apps/admin/app/admin/flashcards/new/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { ExamTagSelector } from '@/components/flashcards/ExamTagSelector'

interface CardRow {
  question: string
  answer: string
  explanation: string
  difficulty: number
}

interface Listing {
  slug: string
  title: string
}

const BLANK_CARD: CardRow = { question: '', answer: '', explanation: '', difficulty: 1 }

export default function NewFlashcardsPage() {
  const router = useRouter()
  const [subjectName, setSubjectName] = useState('')
  const [topicName, setTopicName] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [cards, setCards] = useState<CardRow[]>([{ ...BLANK_CARD }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/listings')
      .then((r) => r.json())
      .then((data) => setListings((data ?? []).map((l: { slug: string; title: string }) => ({ slug: l.slug, title: l.title }))))
  }, [])

  function updateCard(index: number, field: keyof CardRow, value: string | number) {
    setCards((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  async function handleSubmit() {
    if (!subjectName.trim() || !topicName.trim()) {
      setError('Subject and topic name are required')
      return
    }
    if (selectedSlugs.length === 0) {
      setError('Select at least one exam or scholarship')
      return
    }
    const validCards = cards.filter((c) => c.question.trim() && c.answer.trim())
    if (validCards.length === 0) {
      setError('Add at least one card with a question and answer')
      return
    }

    setSubmitting(true)
    setError('')
    const res = await fetch('/api/flashcards/manual', {
      method: 'POST',
      body: JSON.stringify({ subject_name: subjectName, topic_name: topicName, listing_slugs: selectedSlugs, cards: validCards }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (res.ok) {
      router.push('/admin/flashcards')
    } else {
      const body = await res.json()
      setError(body.error ?? 'Submission failed')
      setSubmitting(false)
    }
  }

  return (
    <>
      <Topbar title="Add Cards Manually" />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl space-y-5">

        {/* Subject + Topic */}
        <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4 space-y-3">
          <div>
            <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">SUBJECT</label>
            <input
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="e.g. Science"
              className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">TOPIC</label>
            <input
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="e.g. Cell Biology"
              className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full"
            />
          </div>
        </div>

        <ExamTagSelector listings={listings} selected={selectedSlugs} onChange={setSelectedSlugs} />

        {/* Cards */}
        <div className="space-y-3">
          {cards.map((card, index) => (
            <div key={index} className="bg-white border border-[#e5e7eb] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#800000] uppercase tracking-wider">Card {index + 1}</span>
                {cards.length > 1 && (
                  <button
                    onClick={() => setCards((prev) => prev.filter((_, i) => i !== index))}
                    className="text-[11px] text-[#800000] hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div>
                <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">QUESTION</label>
                <textarea
                  value={card.question}
                  onChange={(e) => updateCard(index, 'question', e.target.value)}
                  rows={2}
                  className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">ANSWER</label>
                <textarea
                  value={card.answer}
                  onChange={(e) => updateCard(index, 'answer', e.target.value)}
                  rows={2}
                  className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">EXPLANATION (optional)</label>
                  <input
                    value={card.explanation}
                    onChange={(e) => updateCard(index, 'explanation', e.target.value)}
                    className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">DIFFICULTY</label>
                  <select
                    value={card.difficulty}
                    onChange={(e) => updateCard(index, 'difficulty', Number(e.target.value))}
                    className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full"
                  >
                    <option value={1}>1 — Easy (recall)</option>
                    <option value={2}>2 — Medium (apply)</option>
                    <option value={3}>3 — Hard (analyze)</option>
                  </select>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => setCards((prev) => [...prev, { ...BLANK_CARD }])}
            className="w-full border-2 border-dashed border-[#d1d5db] rounded-xl py-3 text-xs text-[#6e6e73] hover:border-[#800000] hover:text-[#800000] transition-colors"
          >
            + Add card
          </button>
        </div>

        {error && <p className="text-xs text-[#800000] font-medium">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 bg-[#800000] text-white text-sm font-semibold rounded-xl hover:bg-[#6b0000] transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Publish to Knowledge Base'}
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run build check**

```bash
pnpm --filter @iskotify/admin build
```

Expected: build succeeds; `/admin/flashcards/new` appears in the route list.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/admin/flashcards/new/
git commit -m "feat(admin): add manual flashcard entry page"
```

---

## Task 13: Final build + test pass check

**Files:** None new

- [ ] **Step 1: Run full test suite**

```bash
pnpm --filter @iskotify/admin test -- --reporter=verbose
```

Expected: all tests pass (≥ 24 tests across all route test files)

- [ ] **Step 2: Run production build**

```bash
pnpm --filter @iskotify/admin build
```

Expected: build succeeds with no TypeScript errors. New routes visible in the output:

```
├ ƒ /admin/flashcards
├ ƒ /admin/flashcards/new
├ ƒ /admin/flashcards/review/[jobId]
├ ƒ /admin/flashcards/upload
├ ƒ /api/flashcards/cards
├ ƒ /api/flashcards/cards/[id]
├ ƒ /api/flashcards/jobs/[id]
├ ƒ /api/flashcards/manual
├ ƒ /api/flashcards/process/[id]
├ ƒ /api/flashcards/publish/[jobId]
├ ƒ /api/flashcards/subjects/[id]
├ ƒ /api/flashcards/topics/[id]
└ ƒ /api/flashcards/upload
```

- [ ] **Step 3: Fix any TypeScript errors**

If the build reports type errors, fix them before committing. Common causes:
- Missing `await` on `params` in route handlers (always do `const { id } = await params`)
- Type mismatch on Supabase query results (cast with `as` or add null checks)

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "chore(admin): sprint 2B complete — PDF pipeline + knowledge base admin"
git push origin master
```

---

## Spec Coverage Checklist

| Requirement | Task |
|---|---|
| PDF upload with validation (PDF type, ≤20MB) | Task 3 |
| Async processing with job tracking | Task 4 |
| Gemini 1.5 Flash extraction with structured prompt | Task 4 |
| Polling route for job status | Task 5 |
| Draft → published workflow | Task 5 |
| `listing_slugs` required before publish | Task 5 |
| Card edit (inline) and delete | Task 10 |
| Manual Q&A entry (published immediately) | Task 6, Task 12 |
| Subjects list page (server component) | Task 7 |
| Upload page with 4 UI states | Task 8 |
| Exam tag pill selector (required) | Task 9 |
| Review page with editable subject/topic/cards | Task 11 |
| Sidebar flashcard nav enabled | Task 7 |
| Migration 005 (status, listing_slugs, pdf_jobs) | Task 2 |
| `flashcard-pdfs` storage bucket (private) | Task 2 |
| `GEMINI_API_KEY` env var documented | Task 1 |
| Unit tests for all API routes | Tasks 3–6 |
| `pnpm build` passes | Task 13 |
