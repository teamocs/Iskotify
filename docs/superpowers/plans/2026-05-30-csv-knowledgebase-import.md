# CSV Knowledgebase Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin's PDF upload flow with a CSV import that parses synchronously, fires Gemini distractor enhancement in the background, and gives admins a Drafts page to review/publish.

**Architecture:** Compact 6-column CSV (subject/topic/question/answer/explanation/distractors). Pure-helper validation, transactional Supabase inserts, fire-and-forget enhancement batches, derived progress (no job table). Hard-deletes legacy PDF code paths while keeping `pdf_jobs` table for historical traceability.

**Tech Stack:** Next.js 15 App Router · Supabase (`@supabase/ssr` + `createServerClient` from `@iskotify/utils`) · Vitest · papaparse · Gemini via existing `generateDistractorsForCard` helper · Tailwind for UI.

**Spec:** [docs/superpowers/specs/2026-05-30-csv-knowledgebase-import-design.md](../specs/2026-05-30-csv-knowledgebase-import-design.md)

**Working directory for all commands:** `apps/admin/`

---

## File map

### New files

```
apps/admin/lib/csv/composeOptions.ts                                   pure: shuffle answer+distractors
apps/admin/lib/csv/parseCsvRow.ts                                      pure: validate one row
apps/admin/lib/csv/validateCsvFile.ts                                  pure: file/header/duplicates
apps/admin/lib/csv/__tests__/composeOptions.test.ts
apps/admin/lib/csv/__tests__/parseCsvRow.test.ts
apps/admin/lib/csv/__tests__/validateCsvFile.test.ts
apps/admin/lib/csv/importCsvCore.ts                                    pure-ish: insert orchestration (testable w/ mock client)
apps/admin/lib/csv/__tests__/importCsvCore.test.ts
apps/admin/app/api/flashcards/import-csv/route.ts                      POST handler
apps/admin/app/api/flashcards/enhance-batch/route.ts                   POST handler (Gemini)
apps/admin/app/api/flashcards/drafts/route.ts                          GET handler
apps/admin/app/api/flashcards/publish/[topicId]/route.ts               POST handler
apps/admin/app/api/flashcards/import-csv/__tests__/route.test.ts
apps/admin/app/api/flashcards/drafts/__tests__/route.test.ts
apps/admin/app/api/flashcards/publish/[topicId]/__tests__/route.test.ts
apps/admin/components/flashcards/CsvDropzone.tsx                       dropzone + file picker
apps/admin/components/flashcards/CsvPreviewTable.tsx                   preview rows + error highlights
apps/admin/components/flashcards/DraftsTable.tsx                       drafts list w/ polling
apps/admin/app/admin/flashcards/import/page.tsx                        the new CSV import page
apps/admin/app/admin/flashcards/drafts/page.tsx                        the new drafts inbox
apps/admin/app/admin/flashcards/review/[topicId]/page.tsx              generic review (replaces [jobId])
apps/admin/public/sample-flashcards.csv                                downloadable template
supabase/migrations/013_flashcard_topics_source_type.sql               schema change
```

### Deleted files (Task 19)

```
apps/admin/app/api/flashcards/upload/route.ts
apps/admin/app/api/flashcards/upload/__tests__/route.test.ts
apps/admin/app/api/flashcards/process/[id]/route.ts
apps/admin/app/api/flashcards/jobs/[id]/route.ts
apps/admin/app/api/flashcards/publish/[jobId]/route.ts
apps/admin/app/admin/flashcards/upload/page.tsx
apps/admin/app/admin/flashcards/review/[jobId]/page.tsx
apps/admin/components/flashcards/UploadDropzone.tsx
```

### Modified

```
apps/admin/package.json                                                add papaparse + types
apps/admin/components/admin/SidebarContent.tsx:23                     swap one link for two
```

---

## Task 1: Add papaparse dependency

**Files:**
- Modify: `apps/admin/package.json` (dependencies)

- [ ] **Step 1: Install papaparse + types**

Run:
```bash
cd apps/admin && pnpm add papaparse@5.4.1 && pnpm add -D @types/papaparse@5.3.14
```

Expected: package.json gets two new entries (papaparse under dependencies, @types/papaparse under devDependencies). pnpm-lock.yaml updates.

- [ ] **Step 2: Verify install**

Run:
```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no errors. (papaparse is unused but importable.)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml
git commit -m "chore(admin): add papaparse for CSV import"
```

---

## Task 2: Sample CSV template

**Files:**
- Create: `apps/admin/public/sample-flashcards.csv`

- [ ] **Step 1: Create sample**

Create `apps/admin/public/sample-flashcards.csv` with content:

```csv
subject,topic,question,answer,explanation,distractors
Mathematics,Algebra,What is 2 + 2?,4,Basic addition,3|5|6
Mathematics,Algebra,Solve x: x + 3 = 7,4,Subtract 3 from both sides,3|5|7
Science,Biology,What gas do plants release during photosynthesis?,Oxygen,Photosynthesis converts CO2 and water into glucose and oxygen,Carbon dioxide|Nitrogen|Hydrogen
Science,Biology,Powerhouse of the cell?,Mitochondria,Mitochondria produce ATP through cellular respiration,Nucleus|Ribosome|Chloroplast
Filipino,Panitikan,Sino ang pambansang bayani ng Pilipinas?,Jose Rizal,,Andres Bonifacio|Emilio Aguinaldo|Apolinario Mabini
English,Grammar,Plural form of "child"?,Children,,Childs|Childes|Childrens
History,Philippine History,Year of Philippine independence from Spain?,1898,Declared by Aguinaldo in Kawit,1872|1896|1946
General Knowledge,Geography,Capital of the Philippines?,Manila,,Cebu|Davao|Quezon City
```

- [ ] **Step 2: Verify file is accessible**

Run:
```bash
cd apps/admin && pnpm dev
```

Wait for "Ready". In another terminal: `curl http://localhost:3000/sample-flashcards.csv | head -3`

Expected: the header row + first 2 lines print.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/public/sample-flashcards.csv
git commit -m "feat(admin): sample CSV template for knowledgebase import"
```

---

## Task 3: Migration 013 — `flashcard_topics.source_type`

**Files:**
- Create: `supabase/migrations/013_flashcard_topics_source_type.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/013_flashcard_topics_source_type.sql`:

```sql
-- Track where each topic came from so the Drafts admin page can show provenance.
ALTER TABLE flashcard_topics
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('csv', 'pdf', 'manual', 'ai'));

-- Backfill historical PDF imports from pdf_jobs.
UPDATE flashcard_topics t
SET source_type = 'pdf'
FROM pdf_jobs j
WHERE j.topic_id = t.id
  AND t.source_type = 'manual';

CREATE INDEX IF NOT EXISTS idx_flashcard_topics_status_source
  ON flashcard_topics(status, source_type);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

In Claude: call `mcp__supabase__apply_migration` with:
- project_id: `dtugrsbarruizgzowgso`
- name: `013_flashcard_topics_source_type`
- query: the SQL above

Expected: success, no errors.

- [ ] **Step 3: Verify column exists + backfill worked**

In Claude: call `mcp__supabase__execute_sql` with:
```sql
SELECT source_type, COUNT(*) AS topic_count
FROM flashcard_topics
GROUP BY source_type
ORDER BY source_type;
```

Expected: at least one row each for `pdf` (the 2 backfilled UPCAT Science Review/Reviewer topics) and `manual` (older manually-added topics).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_flashcard_topics_source_type.sql
git commit -m "feat(db): add flashcard_topics.source_type + backfill PDF origins"
```

---

## Task 4: `composeOptions` pure helper

**Files:**
- Create: `apps/admin/lib/csv/composeOptions.ts`
- Test: `apps/admin/lib/csv/__tests__/composeOptions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/lib/csv/__tests__/composeOptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { composeOptions } from '../composeOptions'

describe('composeOptions', () => {
  it('returns 4 options with the correct index pointing to answer', () => {
    const { options, correctIndex } = composeOptions('4', ['3', '5', '6'], 'q-seed')
    expect(options).toHaveLength(4)
    expect(options).toContain('4')
    expect(options).toContain('3')
    expect(options).toContain('5')
    expect(options).toContain('6')
    expect(options[correctIndex]).toBe('4')
  })

  it('throws when distractors length is not exactly 3', () => {
    expect(() => composeOptions('4', ['3', '5'], 'q')).toThrow()
    expect(() => composeOptions('4', ['3', '5', '6', '7'], 'q')).toThrow()
    expect(() => composeOptions('4', [], 'q')).toThrow()
  })

  it('is deterministic — same inputs produce same shuffle', () => {
    const a = composeOptions('Manila', ['Cebu', 'Davao', 'Quezon City'], 'capital-of-ph')
    const b = composeOptions('Manila', ['Cebu', 'Davao', 'Quezon City'], 'capital-of-ph')
    expect(a.options).toEqual(b.options)
    expect(a.correctIndex).toBe(b.correctIndex)
  })

  it('different seeds produce different shuffles (most of the time)', () => {
    const a = composeOptions('4', ['3', '5', '6'], 'seed-A')
    const b = composeOptions('4', ['3', '5', '6'], 'seed-B-distinct')
    // Not always different — but for THESE specific seeds we picked, they should differ
    expect(a.options).not.toEqual(b.options)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/admin && pnpm vitest run lib/csv/__tests__/composeOptions.test.ts
```

Expected: FAIL — "Cannot find module '../composeOptions'".

- [ ] **Step 3: Implement composeOptions**

Create `apps/admin/lib/csv/composeOptions.ts`:

```ts
export interface ComposedOptions {
  options: string[]
  correctIndex: number
}

/**
 * Combine the answer with exactly 3 distractors into a 4-option array, shuffled
 * deterministically by `seed` so the same question always produces the same option
 * order across devices/sessions.
 */
export function composeOptions(answer: string, distractors: string[], seed: string): ComposedOptions {
  if (distractors.length !== 3) {
    throw new Error(`composeOptions: distractors must have exactly 3 entries, got ${distractors.length}`)
  }
  const all = [answer, ...distractors]
  const rng = mulberry32(hashString(seed))
  const shuffled = [...all]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return { options: shuffled, correctIndex: shuffled.indexOf(answer) }
}

function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return h >>> 0
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run:
```bash
cd apps/admin && pnpm vitest run lib/csv/__tests__/composeOptions.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/csv/composeOptions.ts apps/admin/lib/csv/__tests__/composeOptions.test.ts
git commit -m "feat(admin/csv): composeOptions helper (deterministic shuffle of answer + distractors)"
```

---

## Task 5: `parseCsvRow` pure helper

**Files:**
- Create: `apps/admin/lib/csv/parseCsvRow.ts`
- Test: `apps/admin/lib/csv/__tests__/parseCsvRow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/lib/csv/__tests__/parseCsvRow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseCsvRow } from '../parseCsvRow'

describe('parseCsvRow', () => {
  it('accepts a fully populated valid row', () => {
    const result = parseCsvRow({
      subject: 'Math', topic: 'Algebra', question: 'What is 2+2?',
      answer: '4', explanation: 'Basic', distractors: '3|5|6',
    }, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.subject).toBe('Math')
      expect(result.value.distractors).toEqual(['3', '5', '6'])
    }
  })

  it('accepts a row with empty optional fields', () => {
    const result = parseCsvRow({
      subject: 'Sci', topic: 'Bio', question: 'Q?', answer: 'A', explanation: '', distractors: '',
    }, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.explanation).toBe('')
      expect(result.value.distractors).toEqual([])
    }
  })

  it('trims whitespace from all fields', () => {
    const result = parseCsvRow({
      subject: '  Math  ', topic: ' Algebra ', question: ' Q ',
      answer: ' A ', explanation: '  ', distractors: '',
    }, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.subject).toBe('Math')
  })

  it('rejects missing required fields', () => {
    const result = parseCsvRow({ subject: '', topic: '', question: '', answer: '' }, 3)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const fields = result.errors.map(e => e.field).sort()
      expect(fields).toEqual(['answer', 'question', 'subject', 'topic'])
      expect(result.errors.every(e => e.rowIndex === 3)).toBe(true)
    }
  })

  it('rejects fields that exceed length limits', () => {
    const long = 'x'.repeat(201)
    const result = parseCsvRow({
      subject: long, topic: 'T', question: 'Q', answer: 'A',
    }, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]?.field).toBe('subject')
  })

  it('rejects distractors that are not exactly 3 pipe-separated values', () => {
    const r1 = parseCsvRow({ subject: 'S', topic: 'T', question: 'Q', answer: 'A', distractors: 'a|b' }, 0)
    expect(r1.ok).toBe(false)
    const r2 = parseCsvRow({ subject: 'S', topic: 'T', question: 'Q', answer: 'A', distractors: 'a|b|c|d' }, 0)
    expect(r2.ok).toBe(false)
  })

  it('rejects empty distractor entries', () => {
    const r = parseCsvRow({ subject: 'S', topic: 'T', question: 'Q', answer: 'A', distractors: 'a||c' }, 0)
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/admin && pnpm vitest run lib/csv/__tests__/parseCsvRow.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement parseCsvRow**

Create `apps/admin/lib/csv/parseCsvRow.ts`:

```ts
export interface RawCsvRow {
  subject?: string
  topic?: string
  question?: string
  answer?: string
  explanation?: string
  distractors?: string
}

export interface ValidatedRow {
  subject: string
  topic: string
  question: string
  answer: string
  explanation: string
  distractors: string[]  // length 0 (empty) or 3
}

export interface RowError {
  rowIndex: number
  field: keyof RawCsvRow
  message: string
}

const LIMITS = {
  subject: 200, topic: 200, question: 2000, answer: 500, explanation: 1000, distractorEach: 500,
} as const

export function parseCsvRow(
  row: RawCsvRow,
  rowIndex: number,
): { ok: true; value: ValidatedRow } | { ok: false; errors: RowError[] } {
  const errors: RowError[] = []
  const trim = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  const subject = trim(row.subject)
  const topic = trim(row.topic)
  const question = trim(row.question)
  const answer = trim(row.answer)
  const explanation = trim(row.explanation)
  const distractorsRaw = trim(row.distractors)

  const requireNonEmpty = (val: string, field: keyof RawCsvRow) => {
    if (!val) errors.push({ rowIndex, field, message: `${field} is required` })
  }
  const requireMax = (val: string, max: number, field: keyof RawCsvRow) => {
    if (val.length > max) errors.push({ rowIndex, field, message: `${field} exceeds max length of ${max}` })
  }

  requireNonEmpty(subject, 'subject'); requireMax(subject, LIMITS.subject, 'subject')
  requireNonEmpty(topic, 'topic');     requireMax(topic, LIMITS.topic, 'topic')
  requireNonEmpty(question, 'question'); requireMax(question, LIMITS.question, 'question')
  requireNonEmpty(answer, 'answer');   requireMax(answer, LIMITS.answer, 'answer')
  requireMax(explanation, LIMITS.explanation, 'explanation')

  let distractors: string[] = []
  if (distractorsRaw) {
    distractors = distractorsRaw.split('|').map(d => d.trim())
    if (distractors.length !== 3) {
      errors.push({ rowIndex, field: 'distractors',
        message: `distractors must be exactly 3 pipe-separated values (got ${distractors.length})` })
    }
    if (distractors.some(d => !d)) {
      errors.push({ rowIndex, field: 'distractors', message: 'distractors cannot contain empty values' })
    }
    if (distractors.some(d => d.length > LIMITS.distractorEach)) {
      errors.push({ rowIndex, field: 'distractors', message: `each distractor exceeds max length of ${LIMITS.distractorEach}` })
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { subject, topic, question, answer, explanation, distractors } }
}
```

- [ ] **Step 4: Run test to verify pass**

Run:
```bash
cd apps/admin && pnpm vitest run lib/csv/__tests__/parseCsvRow.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/csv/parseCsvRow.ts apps/admin/lib/csv/__tests__/parseCsvRow.test.ts
git commit -m "feat(admin/csv): parseCsvRow helper with field-level validation"
```

---

## Task 6: `validateCsvFile` pure helper

**Files:**
- Create: `apps/admin/lib/csv/validateCsvFile.ts`
- Test: `apps/admin/lib/csv/__tests__/validateCsvFile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/lib/csv/__tests__/validateCsvFile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateCsvFile, validateHeader, checkDuplicates, EXPECTED_HEADER } from '../validateCsvFile'

describe('validateCsvFile', () => {
  it('accepts a normal-sized .csv file', () => {
    expect(validateCsvFile({ name: 'cards.csv', size: 1024 })).toBeNull()
  })

  it('rejects files over 5MB', () => {
    const err = validateCsvFile({ name: 'big.csv', size: 6 * 1024 * 1024 })
    expect(err?.message).toMatch(/5 ?MB/i)
  })

  it('rejects non-.csv extensions (case-insensitive)', () => {
    expect(validateCsvFile({ name: 'cards.txt', size: 100 })?.message).toMatch(/\.csv/i)
    expect(validateCsvFile({ name: 'cards.CSV', size: 100 })).toBeNull()
  })
})

describe('validateHeader', () => {
  it('accepts the exact expected header', () => {
    expect(validateHeader(EXPECTED_HEADER as unknown as string[])).toBeNull()
  })

  it('strips BOM from first column', () => {
    expect(validateHeader(['﻿subject', 'topic', 'question', 'answer', 'explanation', 'distractors'])).toBeNull()
  })

  it('rejects missing columns', () => {
    const err = validateHeader(['subject', 'topic', 'question'])
    expect(err).not.toBeNull()
  })

  it('rejects extra columns', () => {
    const err = validateHeader([...EXPECTED_HEADER, 'extra'] as unknown as string[])
    expect(err).not.toBeNull()
  })

  it('rejects misspellings', () => {
    const err = validateHeader(['subjects', 'topic', 'question', 'answer', 'explanation', 'distractors'])
    expect(err).not.toBeNull()
  })
})

describe('checkDuplicates', () => {
  it('returns no errors when all rows are unique', () => {
    const errs = checkDuplicates([
      { subject: 'Math', topic: 'Algebra', question: 'Q1' },
      { subject: 'Math', topic: 'Algebra', question: 'Q2' },
      { subject: 'Sci', topic: 'Bio', question: 'Q1' },
    ])
    expect(errs).toEqual([])
  })

  it('detects duplicates within the same subject+topic+question (case-insensitive)', () => {
    const errs = checkDuplicates([
      { subject: 'Math', topic: 'Algebra', question: 'What is 2+2?' },
      { subject: 'math', topic: 'algebra', question: 'WHAT IS 2+2?' },
    ])
    expect(errs).toHaveLength(1)
    expect(errs[0]?.rowIndex).toBe(1)
    expect(errs[0]?.message).toMatch(/duplicate/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/admin && pnpm vitest run lib/csv/__tests__/validateCsvFile.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement validateCsvFile**

Create `apps/admin/lib/csv/validateCsvFile.ts`:

```ts
import type { RowError } from './parseCsvRow'

export interface FileError {
  message: string
}

export const EXPECTED_HEADER = ['subject', 'topic', 'question', 'answer', 'explanation', 'distractors'] as const

export function validateCsvFile(file: { name: string; size: number }): FileError | null {
  if (file.size > 5 * 1024 * 1024) {
    return { message: 'File too large (max 5MB)' }
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { message: 'File must have a .csv extension' }
  }
  return null
}

export function validateHeader(headerRow: string[]): FileError | null {
  const normalized = headerRow.map(h => h.trim().toLowerCase().replace(/^﻿/, ''))
  if (normalized.length !== EXPECTED_HEADER.length) {
    return { message: `Header must be exactly: ${EXPECTED_HEADER.join(',')}. Got: ${headerRow.join(',')}` }
  }
  for (let i = 0; i < EXPECTED_HEADER.length; i++) {
    if (normalized[i] !== EXPECTED_HEADER[i]) {
      return { message: `Header must be exactly: ${EXPECTED_HEADER.join(',')}. Got: ${headerRow.join(',')}` }
    }
  }
  return null
}

export function checkDuplicates(
  rows: Array<{ subject: string; topic: string; question: string }>,
): RowError[] {
  const seen = new Map<string, number>()
  const errors: RowError[] = []
  rows.forEach((row, i) => {
    const key = `${row.subject.toLowerCase()}|${row.topic.toLowerCase()}|${row.question.toLowerCase()}`
    const prev = seen.get(key)
    if (prev != null) {
      errors.push({ rowIndex: i, field: 'question', message: `duplicate of row ${prev + 1}` })
    } else {
      seen.set(key, i)
    }
  })
  return errors
}
```

- [ ] **Step 4: Run test to verify pass**

Run:
```bash
cd apps/admin && pnpm vitest run lib/csv/__tests__/validateCsvFile.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/csv/validateCsvFile.ts apps/admin/lib/csv/__tests__/validateCsvFile.test.ts
git commit -m "feat(admin/csv): validateCsvFile + header + duplicate-detection helpers"
```

---

## Task 7: `importCsvCore` orchestrator (testable insert layer)

**Files:**
- Create: `apps/admin/lib/csv/importCsvCore.ts`
- Test: `apps/admin/lib/csv/__tests__/importCsvCore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/lib/csv/__tests__/importCsvCore.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { importCsvCore } from '../importCsvCore'
import type { ValidatedRow } from '../parseCsvRow'

function rows(...partial: Partial<ValidatedRow>[]): ValidatedRow[] {
  return partial.map((p, i) => ({
    subject: p.subject ?? 'Math',
    topic: p.topic ?? 'Algebra',
    question: p.question ?? `Q${i}`,
    answer: p.answer ?? `A${i}`,
    explanation: p.explanation ?? '',
    distractors: p.distractors ?? [],
  }))
}

function makeMockClient() {
  const inserted = { subjects: [] as any[], topics: [] as any[], cards: [] as any[] }
  const client = {
    from(table: string) {
      return {
        upsert(values: any) {
          if (table === 'flashcard_subjects') {
            inserted.subjects.push(values)
            const id = `sub-${inserted.subjects.length}`
            return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) }
          }
          throw new Error(`unexpected upsert on ${table}`)
        },
        insert(values: any) {
          if (table === 'flashcard_topics') {
            inserted.topics.push(values)
            const id = `top-${inserted.topics.length}`
            return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) }
          }
          if (table === 'flashcards') {
            inserted.cards.push(...(Array.isArray(values) ? values : [values]))
            return Promise.resolve({ data: null, error: null })
          }
          throw new Error(`unexpected insert on ${table}`)
        },
      }
    },
  }
  return { client, inserted }
}

describe('importCsvCore', () => {
  it('upserts subjects, inserts topics, inserts cards, returns ids + counters', async () => {
    const { client, inserted } = makeMockClient()
    const result = await importCsvCore(client as any, rows(
      { subject: 'Math', topic: 'Algebra', question: 'Q1', answer: '4', distractors: ['3', '5', '6'] },
      { subject: 'Math', topic: 'Algebra', question: 'Q2', answer: '7', distractors: [] },
      { subject: 'Sci', topic: 'Bio', question: 'Q3', answer: 'Mito', distractors: [] },
    ))

    expect(inserted.subjects).toHaveLength(2)
    expect(inserted.topics).toHaveLength(2)
    expect(inserted.cards).toHaveLength(3)
    expect(result.topic_ids).toHaveLength(2)
    expect(result.total_cards).toBe(3)
    expect(result.cards_needing_enhancement).toBe(2)
  })

  it('populates options + correct_answer_index when distractors present', async () => {
    const { client, inserted } = makeMockClient()
    await importCsvCore(client as any, rows(
      { question: 'pi?', answer: '3.14', distractors: ['2.71', '1.41', '1.62'] },
    ))
    const card = inserted.cards[0]
    expect(card.options).toHaveLength(4)
    expect(card.options).toContain('3.14')
    expect(card.correct_answer_index).toBe(card.options.indexOf('3.14'))
  })

  it('leaves options empty and correct_answer_index null when distractors absent', async () => {
    const { client, inserted } = makeMockClient()
    await importCsvCore(client as any, rows({ distractors: [] }))
    const card = inserted.cards[0]
    expect(card.options).toEqual([])
    expect(card.correct_answer_index).toBeNull()
  })

  it('all inserted cards have status=draft and empty listing_slugs', async () => {
    const { client, inserted } = makeMockClient()
    await importCsvCore(client as any, rows({}, {}))
    expect(inserted.cards.every(c => c.status === 'draft')).toBe(true)
    expect(inserted.cards.every(c => Array.isArray(c.listing_slugs) && c.listing_slugs.length === 0)).toBe(true)
  })

  it('all inserted topics have status=draft and source_type=csv', async () => {
    const { client, inserted } = makeMockClient()
    await importCsvCore(client as any, rows({}))
    expect(inserted.topics[0].status).toBe('draft')
    expect(inserted.topics[0].source_type).toBe('csv')
  })

  it('throws when a subject upsert returns error', async () => {
    const client = {
      from() {
        return {
          upsert() { return { select: () => ({ single: async () => ({ data: null, error: { message: 'boom' } }) }) } },
        }
      },
    }
    await expect(importCsvCore(client as any, rows({}))).rejects.toThrow(/boom/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/admin && pnpm vitest run lib/csv/__tests__/importCsvCore.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement importCsvCore**

Create `apps/admin/lib/csv/importCsvCore.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ValidatedRow } from './parseCsvRow'
import { composeOptions } from './composeOptions'

export interface ImportCsvResult {
  topic_ids: string[]
  total_cards: number
  cards_needing_enhancement: number
}

/**
 * Insert all validated CSV rows into Supabase. Upserts subjects by name, inserts
 * new draft topics tagged source_type='csv', inserts cards in batch. Returns the
 * created topic_ids so the caller can fire async Gemini enhancement jobs.
 *
 * Not transactional (Supabase REST doesn't expose tx); inserts run sequentially.
 * If a step fails, partial inserts remain — caller should treat this as best-effort.
 */
export async function importCsvCore(
  client: SupabaseClient,
  validatedRows: ValidatedRow[],
): Promise<ImportCsvResult> {
  // 1. Group rows by subject name
  const subjectNames = Array.from(new Set(validatedRows.map(r => r.subject)))
  const subjectIdByName = new Map<string, string>()
  for (const name of subjectNames) {
    const { data, error } = await client
      .from('flashcard_subjects')
      .upsert({ name }, { onConflict: 'name' })
      .select('id')
      .single()
    if (error) throw new Error(`Failed to upsert subject "${name}": ${error.message}`)
    if (!data) throw new Error(`Subject upsert returned no data for "${name}"`)
    subjectIdByName.set(name, data.id)
  }

  // 2. Group rows by (subject, topic). New topic per pair.
  type TopicGroup = { subjectId: string; topicName: string; rows: ValidatedRow[]; topicId?: string }
  const topicGroups = new Map<string, TopicGroup>()
  for (const row of validatedRows) {
    const subjectId = subjectIdByName.get(row.subject)!
    const key = `${subjectId}::${row.topic}`
    if (!topicGroups.has(key)) {
      topicGroups.set(key, { subjectId, topicName: row.topic, rows: [] })
    }
    topicGroups.get(key)!.rows.push(row)
  }

  // 3. Insert one topic per group
  for (const group of topicGroups.values()) {
    const { data, error } = await client
      .from('flashcard_topics')
      .insert({ subject_id: group.subjectId, name: group.topicName, status: 'draft', source_type: 'csv' })
      .select('id')
      .single()
    if (error) throw new Error(`Failed to insert topic "${group.topicName}": ${error.message}`)
    group.topicId = data!.id
  }

  // 4. Build card inserts
  const cardInserts: any[] = []
  let cardsNeedingEnhancement = 0
  for (const group of topicGroups.values()) {
    for (const row of group.rows) {
      const insert: any = {
        topic_id: group.topicId,
        question: row.question,
        answer: row.answer,
        explanation: row.explanation,
        status: 'draft',
        listing_slugs: [],
      }
      if (row.distractors.length === 3) {
        const { options, correctIndex } = composeOptions(row.answer, row.distractors, row.question)
        insert.options = options
        insert.correct_answer_index = correctIndex
      } else {
        insert.options = []
        insert.correct_answer_index = null
        cardsNeedingEnhancement++
      }
      cardInserts.push(insert)
    }
  }

  // 5. Batch insert all cards
  const { error: cardErr } = await client.from('flashcards').insert(cardInserts)
  if (cardErr) throw new Error(`Failed to insert ${cardInserts.length} cards: ${cardErr.message}`)

  return {
    topic_ids: Array.from(topicGroups.values()).map(g => g.topicId!),
    total_cards: cardInserts.length,
    cards_needing_enhancement: cardsNeedingEnhancement,
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run:
```bash
cd apps/admin && pnpm vitest run lib/csv/__tests__/importCsvCore.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/csv/importCsvCore.ts apps/admin/lib/csv/__tests__/importCsvCore.test.ts
git commit -m "feat(admin/csv): importCsvCore orchestrator (subjects → topics → cards)"
```

---

## Task 8: POST `/api/flashcards/import-csv` handler

**Files:**
- Create: `apps/admin/app/api/flashcards/import-csv/route.ts`
- Test: `apps/admin/app/api/flashcards/import-csv/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/api/flashcards/import-csv/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @iskotify/utils server client + auth/profile chain
const mockServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({
  createServerClient: () => mockServerClient(),
}))

// Mock importCsvCore so we don't exercise DB writes again
vi.mock('@/lib/csv/importCsvCore', () => ({
  importCsvCore: vi.fn(async () => ({ topic_ids: ['top-1'], total_cards: 2, cards_needing_enhancement: 1 })),
}))

import { POST } from '../route'

function makeAuthedClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }
      }
      return {}
    },
  }
}

function makeReq(formData: FormData): any {
  return {
    url: 'http://localhost/api/flashcards/import-csv',
    formData: async () => formData,
    headers: new Headers({ cookie: '' }),
  }
}

beforeEach(() => { mockServerClient.mockReset(); mockServerClient.mockImplementation(makeAuthedClient) })

describe('POST /api/flashcards/import-csv', () => {
  it('returns 401 when user is unauthenticated', async () => {
    mockServerClient.mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: null } }) },
    }))
    const fd = new FormData()
    fd.append('file', new File(['x'], 'a.csv', { type: 'text/csv' }))
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is authenticated but not admin', async () => {
    mockServerClient.mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'user' } }) }) }) }),
    }))
    const fd = new FormData()
    fd.append('file', new File(['x'], 'a.csv'))
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(403)
  })

  it('returns 400 when no file is sent', async () => {
    const res = await POST(makeReq(new FormData()))
    expect(res.status).toBe(400)
  })

  it('returns 400 when file fails size check', async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.csv')
    const fd = new FormData()
    fd.append('file', big)
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(400)
  })

  it('returns 400 with rowErrors when CSV has invalid rows', async () => {
    const csv = `subject,topic,question,answer,explanation,distractors
,Algebra,Q1,A1,,
Math,Algebra,Q2,,,
`
    const fd = new FormData()
    fd.append('file', new File([csv], 'cards.csv'))
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.rowErrors).toBeDefined()
    expect(body.rowErrors.length).toBeGreaterThan(0)
  })

  it('returns 200 with topic_ids on valid CSV', async () => {
    const csv = `subject,topic,question,answer,explanation,distractors
Math,Algebra,What is 2+2?,4,,3|5|6
Math,Algebra,What is 3+3?,6,,4|5|7
`
    const fd = new FormData()
    fd.append('file', new File([csv], 'cards.csv'))
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.topic_ids).toEqual(['top-1'])
    expect(body.total_cards).toBe(2)
    expect(body.cards_needing_enhancement).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/admin && pnpm vitest run app/api/flashcards/import-csv/__tests__/route.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

Create `apps/admin/app/api/flashcards/import-csv/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createServerClient } from '@iskotify/utils'
import { parseCsvRow, type ValidatedRow, type RawCsvRow } from '@/lib/csv/parseCsvRow'
import { validateCsvFile, validateHeader, checkDuplicates, EXPECTED_HEADER } from '@/lib/csv/validateCsvFile'
import { importCsvCore } from '@/lib/csv/importCsvCore'

export const runtime = 'nodejs'  // papaparse + File polyfill rely on Node runtime

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  // 1. Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 2. File extraction
  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  const fileErr = validateCsvFile(file)
  if (fileErr) return NextResponse.json({ error: fileErr.message }, { status: 400 })

  // 3. Parse with papaparse
  const text = await file.text()
  const parsed = Papa.parse<RawCsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase().replace(/^﻿/, ''),
  })

  // 4. Header check
  if (parsed.meta.fields) {
    const headerErr = validateHeader(parsed.meta.fields)
    if (headerErr) return NextResponse.json({ error: headerErr.message }, { status: 400 })
  } else {
    return NextResponse.json({ error: 'CSV has no header row' }, { status: 400 })
  }

  // 5. Row count
  if (parsed.data.length === 0) {
    return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })
  }
  if (parsed.data.length > 1000) {
    return NextResponse.json({ error: `Too many rows (max 1000, got ${parsed.data.length})` }, { status: 400 })
  }

  // 6. Per-row validation
  const rowErrors: any[] = []
  const validated: ValidatedRow[] = []
  parsed.data.forEach((row, i) => {
    const result = parseCsvRow(row, i)
    if (result.ok) validated.push(result.value)
    else rowErrors.push(...result.errors)
  })

  // 7. Cross-row duplicate check (only when individual rows are clean)
  if (rowErrors.length === 0) {
    rowErrors.push(...checkDuplicates(validated))
  }

  if (rowErrors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', rowErrors }, { status: 400 })
  }

  // 8. Insert
  let result
  try {
    result = await importCsvCore(supabase, validated)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Import failed' }, { status: 500 })
  }

  // 9. Fire async Gemini enhancement per topic (fire-and-forget)
  const origin = new URL(req.url).origin
  const cookie = req.headers.get('cookie') ?? ''
  for (const topic_id of result.topic_ids) {
    fetch(`${origin}/api/flashcards/enhance-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ topic_id }),
    }).catch(err => console.error('[import-csv] enhance-batch dispatch failed:', err))
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 4: Run test to verify pass**

Run:
```bash
cd apps/admin && pnpm vitest run app/api/flashcards/import-csv/__tests__/route.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/api/flashcards/import-csv apps/admin/lib/csv
git commit -m "feat(admin): POST /api/flashcards/import-csv (auth + parse + validate + insert + enhance)"
```

---

## Task 9: POST `/api/flashcards/enhance-batch` handler

**Files:**
- Create: `apps/admin/app/api/flashcards/enhance-batch/route.ts`

- [ ] **Step 1: Implement the route**

Create `apps/admin/app/api/flashcards/enhance-batch/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { generateDistractorsForCard } from '@/lib/gemini/generateDistractors'

export const runtime = 'nodejs'
export const maxDuration = 60  // Vercel cap

const RATE_DELAY_MS = 170  // ~6 req/sec — under Gemini free-tier 15rpm/1500rpd

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  // Auth — same admin guard
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const topicId = body?.topic_id
  if (typeof topicId !== 'string') {
    return NextResponse.json({ error: 'topic_id required' }, { status: 400 })
  }

  // Fetch topic + subject names for prompt context
  const { data: topic, error: topicErr } = await supabase
    .from('flashcard_topics')
    .select('id, name, flashcard_subjects(name)')
    .eq('id', topicId)
    .single()
  if (topicErr || !topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

  const subjectName = (topic as any).flashcard_subjects?.name ?? 'General'
  const topicName = topic.name

  // Fetch cards needing enhancement
  const { data: cards, error: cardsErr } = await supabase
    .from('flashcards')
    .select('id, question, answer')
    .eq('topic_id', topicId)
    .or('options.is.null,options.eq.{}')
    .is('ai_options', null)
  if (cardsErr) return NextResponse.json({ error: cardsErr.message }, { status: 500 })

  const list = cards ?? []
  let enhanced = 0
  let failed = 0

  for (const card of list) {
    try {
      const result = await generateDistractorsForCard({
        subject: subjectName,
        topic: topicName,
        question: card.question,
        answer: card.answer,
      })
      if (!result) {
        failed++
      } else {
        await supabase.from('flashcards').update({
          ai_options: result.options,
          ai_correct_index: result.correctIndex,
          ai_explanation: result.explanation,
          ai_enhanced_at: new Date().toISOString(),
        }).eq('id', card.id)
        enhanced++
      }
    } catch (err) {
      console.error('[enhance-batch] card failed:', card.id, err)
      failed++
    }
    await new Promise(r => setTimeout(r, RATE_DELAY_MS))
  }

  return NextResponse.json({ topic_id: topicId, attempted: list.length, enhanced, failed })
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/api/flashcards/enhance-batch
git commit -m "feat(admin): POST /api/flashcards/enhance-batch (Gemini distractor generation, rate-limited)"
```

---

## Task 10: GET `/api/flashcards/drafts` handler

**Files:**
- Create: `apps/admin/app/api/flashcards/drafts/route.ts`
- Test: `apps/admin/app/api/flashcards/drafts/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/api/flashcards/drafts/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({
  createServerClient: () => mockServerClient(),
}))

import { GET } from '../route'

function makeReq(): any {
  return { url: 'http://localhost/api/flashcards/drafts', headers: new Headers() }
}

beforeEach(() => { mockServerClient.mockReset() })

describe('GET /api/flashcards/drafts', () => {
  it('returns 403 when caller is not admin', async () => {
    mockServerClient.mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'user' } }) }) }) }),
    }))
    const res = await GET(makeReq())
    expect(res.status).toBe(403)
  })

  it('returns rows for every draft topic with derived progress counters', async () => {
    mockServerClient.mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from(table: string) {
        if (table === 'profiles') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }
        }
        if (table === 'flashcard_topics') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({
                  data: [
                    {
                      id: 'top-1', name: 'Algebra', source_type: 'csv', created_at: '2026-05-30T00:00:00Z',
                      flashcard_subjects: { id: 'sub-1', name: 'Math' },
                      flashcards: [
                        { options: ['a','b','c','d'], ai_options: null },
                        { options: [], ai_options: ['a','b','c','d'] },
                        { options: [], ai_options: null },
                      ],
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }
        return {}
      },
    }))
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.drafts).toHaveLength(1)
    const draft = body.drafts[0]
    expect(draft).toMatchObject({
      topic_id: 'top-1',
      topic_name: 'Algebra',
      subject_id: 'sub-1',
      subject_name: 'Math',
      source_type: 'csv',
      total_cards: 3,
      cards_with_options: 1,
      cards_enhanced: 1,
      cards_needing_enhancement: 1,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/admin && pnpm vitest run app/api/flashcards/drafts/__tests__/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `apps/admin/app/api/flashcards/drafts/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  const supabase = createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch all draft topics with their subject + raw cards array.
  // We derive counters in JS to keep the query simple and to avoid Postgres array tricks.
  const { data, error } = await supabase
    .from('flashcard_topics')
    .select(`
      id, name, source_type, created_at,
      flashcard_subjects:flashcard_subjects!subject_id (id, name),
      flashcards (options, ai_options)
    `)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const drafts = (data ?? []).map((t: any) => {
    const cards: Array<{ options: string[] | null; ai_options: string[] | null }> = t.flashcards ?? []
    const total_cards = cards.length
    const cards_with_options = cards.filter(c => Array.isArray(c.options) && c.options.length >= 4).length
    const cards_enhanced = cards.filter(c => Array.isArray(c.ai_options) && c.ai_options.length >= 4).length
    const cards_needing_enhancement = cards.filter(
      c => (!Array.isArray(c.options) || c.options.length < 4) && (!Array.isArray(c.ai_options) || c.ai_options.length < 4),
    ).length
    return {
      topic_id: t.id,
      topic_name: t.name,
      subject_id: t.flashcard_subjects?.id ?? null,
      subject_name: t.flashcard_subjects?.name ?? 'Unknown',
      source_type: t.source_type,
      created_at: t.created_at,
      total_cards,
      cards_with_options,
      cards_enhanced,
      cards_needing_enhancement,
    }
  })

  return NextResponse.json({ drafts })
}
```

- [ ] **Step 4: Run test to verify pass**

Run:
```bash
cd apps/admin && pnpm vitest run app/api/flashcards/drafts/__tests__/route.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/api/flashcards/drafts
git commit -m "feat(admin): GET /api/flashcards/drafts (lists every draft topic with progress counters)"
```

---

## Task 11: POST `/api/flashcards/publish/[topicId]` handler

**Files:**
- Create: `apps/admin/app/api/flashcards/publish/[topicId]/route.ts`
- Test: `apps/admin/app/api/flashcards/publish/[topicId]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/api/flashcards/publish/[topicId]/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({
  createServerClient: () => mockServerClient(),
}))

import { POST } from '../route'

function makeReq(body: any): any {
  return {
    url: 'http://localhost/api/flashcards/publish/top-1',
    json: async () => body,
    headers: new Headers(),
  }
}

function makeAdmin() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }
      }
      const chain = {
        update: vi.fn(() => chain),
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }
      ;(chain as any)._table = table
      return chain as any
    },
  }
}

beforeEach(() => { mockServerClient.mockReset() })

describe('POST /api/flashcards/publish/[topicId]', () => {
  it('returns 400 when listing_slugs is empty', async () => {
    mockServerClient.mockImplementation(makeAdmin)
    const res = await POST(makeReq({ listing_slugs: [] }), { params: Promise.resolve({ topicId: 'top-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is missing', async () => {
    mockServerClient.mockImplementation(makeAdmin)
    const res = await POST(makeReq({}), { params: Promise.resolve({ topicId: 'top-1' }) })
    expect(res.status).toBe(400)
  })

  it('updates topic + flashcards to published with provided slugs', async () => {
    const calls: Array<{ table: string; payload: any }> = []
    mockServerClient.mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from(table: string) {
        if (table === 'profiles') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }
        }
        return {
          update(payload: any) {
            calls.push({ table, payload })
            return { eq: () => Promise.resolve({ data: null, error: null }) }
          },
        }
      },
    }))
    const res = await POST(
      makeReq({ listing_slugs: ['upcat', 'dost-sei'] }),
      { params: Promise.resolve({ topicId: 'top-1' }) },
    )
    expect(res.status).toBe(200)
    expect(calls.find(c => c.table === 'flashcard_topics')?.payload.status).toBe('published')
    expect(calls.find(c => c.table === 'flashcards')?.payload.status).toBe('published')
    expect(calls.find(c => c.table === 'flashcards')?.payload.listing_slugs).toEqual(['upcat', 'dost-sei'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/admin && pnpm vitest run app/api/flashcards/publish/[topicId]/__tests__/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `apps/admin/app/api/flashcards/publish/[topicId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params
  const supabase = createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const slugs: unknown = body?.listing_slugs
  if (!Array.isArray(slugs) || slugs.length === 0 || !slugs.every(s => typeof s === 'string')) {
    return NextResponse.json({ error: 'listing_slugs must be a non-empty array of strings' }, { status: 400 })
  }

  const { error: topicErr } = await supabase
    .from('flashcard_topics')
    .update({ status: 'published' })
    .eq('id', topicId)
  if (topicErr) return NextResponse.json({ error: topicErr.message }, { status: 500 })

  const { error: cardErr } = await supabase
    .from('flashcards')
    .update({ status: 'published', listing_slugs: slugs })
    .eq('topic_id', topicId)
  if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 })

  return NextResponse.json({ topic_id: topicId, listing_slugs: slugs })
}
```

- [ ] **Step 4: Run test to verify pass**

Run:
```bash
cd apps/admin && pnpm vitest run app/api/flashcards/publish/[topicId]/__tests__/route.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/api/flashcards/publish/[topicId]
git commit -m "feat(admin): POST /api/flashcards/publish/[topicId] (generic publish replaces job-based version)"
```

---

## Task 12: `CsvDropzone` component

**Files:**
- Create: `apps/admin/components/flashcards/CsvDropzone.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/admin/components/flashcards/CsvDropzone.tsx`:

```tsx
'use client'

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'

interface Props {
  onFileSelected: (file: File) => void
  disabled?: boolean
}

export function CsvDropzone({ onFileSelected, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handlePicked(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onFileSelected(f)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onFileSelected(f)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      className={`
        cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition
        ${dragOver ? 'border-[#800000] bg-[#800000]/5' : 'border-white/15 bg-white/[0.02]'}
        ${disabled ? 'opacity-50 pointer-events-none' : 'hover:border-white/30'}
      `}
    >
      <div className="text-3xl mb-2">📄</div>
      <div className="text-white font-semibold mb-1">Drop CSV here or click to browse</div>
      <div className="text-white/40 text-sm">Max 5MB · max 1000 rows · UTF-8</div>
      <a
        href="/sample-flashcards.csv"
        onClick={e => e.stopPropagation()}
        download
        className="inline-block mt-4 text-sm text-[#ff8aa0] underline"
      >
        Download sample CSV
      </a>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handlePicked}
        disabled={disabled}
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/components/flashcards/CsvDropzone.tsx
git commit -m "feat(admin): CsvDropzone component (drag-drop + file picker + sample link)"
```

---

## Task 13: `CsvPreviewTable` component

**Files:**
- Create: `apps/admin/components/flashcards/CsvPreviewTable.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/admin/components/flashcards/CsvPreviewTable.tsx`:

```tsx
'use client'

interface RowError {
  rowIndex: number
  field: string
  message: string
}

interface Props {
  rows: Array<Record<string, string>>  // first 10 rows of CSV (parsed by papaparse)
  totalRows: number
  rowErrors: RowError[]
}

export function CsvPreviewTable({ rows, totalRows, rowErrors }: Props) {
  const errorsByRow = new Map<number, RowError[]>()
  for (const e of rowErrors) {
    if (!errorsByRow.has(e.rowIndex)) errorsByRow.set(e.rowIndex, [])
    errorsByRow.get(e.rowIndex)!.push(e)
  }

  const validRows = totalRows - new Set(rowErrors.map(e => e.rowIndex)).size

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-green-400">{validRows} rows valid</span>
        {rowErrors.length > 0 && (
          <span className="text-red-400">{new Set(rowErrors.map(e => e.rowIndex)).size} rows have errors</span>
        )}
        <span className="text-white/40">· showing first {rows.length} of {totalRows}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/[0.04] text-white/60">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">subject</th>
              <th className="px-3 py-2 text-left">topic</th>
              <th className="px-3 py-2 text-left">question</th>
              <th className="px-3 py-2 text-left">answer</th>
              <th className="px-3 py-2 text-left">explanation</th>
              <th className="px-3 py-2 text-left">distractors</th>
              <th className="px-3 py-2 text-left">errors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const errs = errorsByRow.get(i) ?? []
              const hasErr = errs.length > 0
              return (
                <tr key={i} className={hasErr ? 'bg-red-500/10' : 'odd:bg-white/[0.02]'}>
                  <td className="px-3 py-2 text-white/40">{i + 1}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate">{r.subject ?? ''}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate">{r.topic ?? ''}</td>
                  <td className="px-3 py-2 max-w-[280px] truncate">{r.question ?? ''}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate">{r.answer ?? ''}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{r.explanation ?? ''}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{r.distractors ?? ''}</td>
                  <td className="px-3 py-2 text-red-400 text-xs">
                    {errs.map((e, j) => <div key={j}>{e.field}: {e.message}</div>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/components/flashcards/CsvPreviewTable.tsx
git commit -m "feat(admin): CsvPreviewTable component (first-10-rows preview + per-row errors)"
```

---

## Task 14: Page `/admin/flashcards/import`

**Files:**
- Create: `apps/admin/app/admin/flashcards/import/page.tsx`

- [ ] **Step 1: Implement the page**

Create `apps/admin/app/admin/flashcards/import/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'
import { CsvPreviewTable } from '@/components/flashcards/CsvPreviewTable'

interface RowError { rowIndex: number; field: string; message: string }

export default function ImportCsvPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([])
  const [totalRows, setTotalRows] = useState(0)
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  function handleFile(f: File) {
    setFile(f); setFileError(null); setRowErrors([])
    if (f.size > 5 * 1024 * 1024) { setFileError('File too large (max 5MB)'); return }

    f.text().then(text => {
      const parsed = Papa.parse(text, {
        header: true, skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase().replace(/^﻿/, ''),
      })
      const all = parsed.data as Array<Record<string, string>>
      setTotalRows(all.length)
      setPreviewRows(all.slice(0, 10))
    })
  }

  async function handleImport() {
    if (!file) return
    setImporting(true); setRowErrors([])
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/flashcards/import-csv', { method: 'POST', body: fd })
    const body = await res.json()
    if (!res.ok) {
      if (Array.isArray(body.rowErrors)) setRowErrors(body.rowErrors)
      else setFileError(body.error ?? 'Import failed')
      setImporting(false)
      return
    }
    router.push('/admin/flashcards/drafts')
  }

  const canImport = file && !fileError && rowErrors.length === 0 && totalRows > 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Import CSV</h1>
        <p className="text-white/50 text-sm mt-1">Upload a 6-column CSV of flashcards. Subjects + topics auto-created, distractors filled by Gemini when missing.</p>
      </div>

      <CsvDropzone onFileSelected={handleFile} disabled={importing} />

      {fileError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
          {fileError}
        </div>
      )}

      {file && previewRows.length > 0 && (
        <CsvPreviewTable rows={previewRows} totalRows={totalRows} rowErrors={rowErrors} />
      )}

      {file && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={!canImport || importing}
            className={`
              rounded-lg px-5 py-2.5 text-sm font-semibold transition
              ${canImport && !importing
                ? 'bg-[#800000] text-white hover:bg-[#9a0a1f]'
                : 'bg-white/10 text-white/30 cursor-not-allowed'}
            `}
          >
            {importing ? 'Importing…' : `Import ${totalRows} card${totalRows === 1 ? '' : 's'}`}
          </button>
          {rowErrors.length > 0 && (
            <span className="text-red-400 text-sm">Fix errors and re-upload</span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check + lint**

Run:
```bash
cd apps/admin && pnpm exec tsc --noEmit && pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/admin/flashcards/import
git commit -m "feat(admin): /admin/flashcards/import page (dropzone + preview + submit)"
```

---

## Task 15: `DraftsTable` component (with polling)

**Files:**
- Create: `apps/admin/components/flashcards/DraftsTable.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/admin/components/flashcards/DraftsTable.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Draft {
  topic_id: string
  topic_name: string
  subject_id: string | null
  subject_name: string
  source_type: 'csv' | 'pdf' | 'manual' | 'ai'
  created_at: string
  total_cards: number
  cards_with_options: number
  cards_enhanced: number
  cards_needing_enhancement: number
}

export function DraftsTable() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetchDrafts() {
    try {
      const res = await fetch('/api/flashcards/drafts')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to load drafts')
      setDrafts(body.drafts)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load drafts')
    }
  }

  useEffect(() => {
    fetchDrafts()
    const iv = setInterval(() => {
      // Only poll when at least one draft still has pending enhancement
      setDrafts(curr => {
        const stillPending = curr?.some(d => d.cards_needing_enhancement > 0)
        if (stillPending) fetchDrafts()
        return curr ?? null
      })
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  if (error) {
    return <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm">{error}</div>
  }
  if (drafts === null) {
    return <div className="text-white/40 text-sm">Loading drafts…</div>
  }
  if (drafts.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
        <div className="text-3xl mb-2">📥</div>
        <div className="text-white font-semibold mb-1">No drafts</div>
        <div className="text-white/40 text-sm">Import a CSV to get started.</div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-white/[0.04] text-white/60">
          <tr>
            <th className="px-3 py-2 text-left">Subject</th>
            <th className="px-3 py-2 text-left">Topic</th>
            <th className="px-3 py-2 text-left">Cards</th>
            <th className="px-3 py-2 text-left">Enhancement</th>
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">Created</th>
            <th className="px-3 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map(d => (
            <tr key={d.topic_id} className="odd:bg-white/[0.02]">
              <td className="px-3 py-2 text-white/80">{d.subject_name}</td>
              <td className="px-3 py-2 text-white">{d.topic_name}</td>
              <td className="px-3 py-2">{d.total_cards}</td>
              <td className="px-3 py-2">
                <EnhancementCell draft={d} />
              </td>
              <td className="px-3 py-2">
                <SourceBadge source={d.source_type} />
              </td>
              <td className="px-3 py-2 text-white/40 text-xs">{relTime(d.created_at)}</td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/admin/flashcards/review/${d.topic_id}`}
                  className="rounded bg-[#800000]/80 hover:bg-[#9a0a1f] text-white px-3 py-1 text-xs"
                >
                  Review & Publish
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EnhancementCell({ draft }: { draft: Draft }) {
  const ready = draft.cards_with_options + draft.cards_enhanced
  if (draft.cards_needing_enhancement === 0) return <span className="text-green-400">✓ Complete ({ready}/{draft.total_cards})</span>
  const pct = Math.round((ready / draft.total_cards) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-[#800000]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-white/60 text-xs">{ready}/{draft.total_cards}</span>
    </div>
  )
}

function SourceBadge({ source }: { source: Draft['source_type'] }) {
  const map: Record<Draft['source_type'], string> = {
    csv: 'bg-blue-500/20 text-blue-300',
    pdf: 'bg-amber-500/20 text-amber-300',
    manual: 'bg-white/10 text-white/60',
    ai: 'bg-purple-500/20 text-purple-300',
  }
  return <span className={`px-2 py-0.5 rounded text-xs ${map[source]}`}>{source.toUpperCase()}</span>
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/components/flashcards/DraftsTable.tsx
git commit -m "feat(admin): DraftsTable component (5s polling, progress bars, source badge)"
```

---

## Task 16: Page `/admin/flashcards/drafts`

**Files:**
- Create: `apps/admin/app/admin/flashcards/drafts/page.tsx`

- [ ] **Step 1: Implement the page**

Create `apps/admin/app/admin/flashcards/drafts/page.tsx`:

```tsx
import { DraftsTable } from '@/components/flashcards/DraftsTable'
import Link from 'next/link'

export default function DraftsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Drafts</h1>
          <p className="text-white/50 text-sm mt-1">
            Every unpublished topic. Tag exam slugs and publish to ship to mobile.
          </p>
        </div>
        <Link
          href="/admin/flashcards/import"
          className="rounded-lg bg-[#800000] hover:bg-[#9a0a1f] text-white px-4 py-2 text-sm font-semibold"
        >
          + Import CSV
        </Link>
      </div>

      <DraftsTable />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/admin/flashcards/drafts
git commit -m "feat(admin): /admin/flashcards/drafts page (inbox of all unpublished topics)"
```

---

## Task 17: Page `/admin/flashcards/review/[topicId]`

**Files:**
- Create: `apps/admin/app/admin/flashcards/review/[topicId]/page.tsx`

The page below renders its own exam-tag pill buttons inline (reading from `/api/listings`). We don't import the existing `ExamTagSelector` to keep the new generic review page fully self-contained.

- [ ] **Step 1: Verify `/api/listings` exists and returns the expected shape**

Run:
```bash
cd apps/admin && find app/api/listings -name "route.ts"
```

Expected: a route file exists. Quick sanity check on shape:
```bash
cd apps/admin && grep -n "title\|slug\|type" app/api/listings/route.ts | head -10
```

Expected: `slug`, `title`, `type` appear in the SELECT or response. If the response shape differs (e.g. wraps listings under a different key), adjust the `setListings(listingsBody.listings ?? [])` line in step 2 accordingly.

- [ ] **Step 2: Implement the page**

Create `apps/admin/app/admin/flashcards/review/[topicId]/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Card {
  id: string
  question: string
  answer: string
  explanation: string | null
  options: string[] | null
  correct_answer_index: number | null
  ai_options: string[] | null
  ai_correct_index: number | null
  ai_explanation: string | null
}

interface Topic { id: string; name: string; subject_name: string }
interface Listing { slug: string; title: string; type: string }

export default function ReviewPage() {
  const params = useParams<{ topicId: string }>()
  const router = useRouter()
  const topicId = params.topicId

  const [topic, setTopic] = useState<Topic | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [topicRes, cardsRes, listingsRes] = await Promise.all([
          fetch(`/api/flashcards/topics/${topicId}`),
          fetch(`/api/flashcards/cards?topic_id=${topicId}`),
          fetch('/api/listings'),
        ])
        const topicBody = await topicRes.json()
        const cardsBody = await cardsRes.json()
        const listingsBody = await listingsRes.json()
        setTopic(topicBody.topic ?? null)
        setCards(cardsBody.cards ?? [])
        setListings(listingsBody.listings ?? [])
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load')
      }
    }
    load()
  }, [topicId])

  async function handlePublish() {
    if (selectedSlugs.size === 0) return
    setPublishing(true)
    const res = await fetch(`/api/flashcards/publish/${topicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_slugs: Array.from(selectedSlugs) }),
    })
    setPublishing(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Publish failed')
      return
    }
    router.push('/admin/flashcards/drafts')
  }

  function toggleSlug(slug: string) {
    setSelectedSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      return next
    })
  }

  if (error) {
    return <div className="p-6 text-red-300">{error}</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">{topic?.subject_name ?? '—'} · {topic?.name ?? '—'}</h1>
        <p className="text-white/50 text-sm mt-1">{cards.length} cards · pick exam/scholarship tags, then publish.</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-2">Tag to exams/scholarships</h2>
        <div className="flex flex-wrap gap-2">
          {listings.map(l => {
            const on = selectedSlugs.has(l.slug)
            return (
              <button
                key={l.slug}
                onClick={() => toggleSlug(l.slug)}
                className={`px-3 py-1.5 rounded-full text-xs border transition
                  ${on ? 'bg-[#800000] text-white border-[#800000]' : 'bg-white/5 text-white/70 border-white/15 hover:border-white/30'}
                `}
              >
                {l.title}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-2">Cards</h2>
        <div className="space-y-3">
          {cards.map((c, i) => {
            const opts = (c.ai_options && c.ai_options.length >= 4) ? c.ai_options : (c.options ?? [])
            const correct = (c.ai_correct_index ?? c.correct_answer_index)
            return (
              <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-white/40 text-xs mb-1">Card {i + 1}</div>
                <div className="text-white font-medium mb-2">{c.question}</div>
                <div className="text-white/70 text-sm mb-2">Answer: <span className="text-green-400">{c.answer}</span></div>
                {opts.length > 0 && (
                  <ul className="text-sm space-y-0.5 mt-2">
                    {opts.map((o, j) => (
                      <li key={j} className={j === correct ? 'text-green-400' : 'text-white/50'}>
                        {String.fromCharCode(65 + j)}. {o}
                      </li>
                    ))}
                  </ul>
                )}
                {opts.length === 0 && (
                  <div className="text-amber-400 text-xs">No distractors yet — Gemini will fill in shortly.</div>
                )}
                {c.explanation && <div className="text-white/50 text-xs mt-2">📝 {c.explanation}</div>}
              </div>
            )
          })}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePublish}
          disabled={selectedSlugs.size === 0 || publishing}
          className={`
            rounded-lg px-5 py-2.5 text-sm font-semibold transition
            ${selectedSlugs.size > 0 && !publishing
              ? 'bg-green-700 text-white hover:bg-green-600'
              : 'bg-white/10 text-white/30 cursor-not-allowed'}
          `}
        >
          {publishing ? 'Publishing…' : `Publish ${cards.length} cards`}
        </button>
        <span className="text-white/40 text-xs">Tag at least one exam/scholarship to enable publish</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run:
```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no errors. If `useParams<{topicId: string}>` type errors, change to `const params = useParams() as { topicId: string }`.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/admin/flashcards/review/[topicId]
git commit -m "feat(admin): /admin/flashcards/review/[topicId] page (generic publish UI)"
```

---

## Task 18: Update nav — replace PDF link with Import + Drafts

**Files:**
- Modify: `apps/admin/components/admin/SidebarContent.tsx` (line 23)

- [ ] **Step 1: Update nav config**

Edit `apps/admin/components/admin/SidebarContent.tsx`, replace the KNOWLEDGEBASE section block (lines 19-25):

**Find:**
```ts
  {
    section: 'KNOWLEDGEBASE',
    items: [
      { href: '/admin/flashcards', icon: '🃏', label: 'Knowledgebase' },
      { href: '/admin/flashcards/upload', icon: '📚', label: 'Upload PDF' },
    ],
  },
```

**Replace with:**
```ts
  {
    section: 'KNOWLEDGEBASE',
    items: [
      { href: '/admin/flashcards', icon: '🃏', label: 'Knowledgebase' },
      { href: '/admin/flashcards/import', icon: '📥', label: 'Import CSV' },
      { href: '/admin/flashcards/drafts', icon: '📝', label: 'Drafts' },
    ],
  },
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/components/admin/SidebarContent.tsx
git commit -m "feat(admin/nav): replace Upload PDF with Import CSV + Drafts links"
```

---

## Task 19: Delete legacy PDF code paths

**Files to delete:**
- `apps/admin/app/api/flashcards/upload/`
- `apps/admin/app/api/flashcards/process/`
- `apps/admin/app/api/flashcards/jobs/`
- `apps/admin/app/api/flashcards/publish/[jobId]/`
- `apps/admin/app/admin/flashcards/upload/`
- `apps/admin/app/admin/flashcards/review/[jobId]/`
- `apps/admin/components/flashcards/UploadDropzone.tsx`

- [ ] **Step 1: Delete the directories**

Run:
```bash
cd apps/admin
rm -rf app/api/flashcards/upload
rm -rf app/api/flashcards/process
rm -rf app/api/flashcards/jobs
rm -rf "app/api/flashcards/publish/[jobId]"
rm -rf app/admin/flashcards/upload
rm -rf "app/admin/flashcards/review/[jobId]"
rm -f components/flashcards/UploadDropzone.tsx
```

- [ ] **Step 2: Grep for stale references**

Run:
```bash
cd apps/admin && grep -r "UploadDropzone\|flashcards/upload\|review/\[jobId\]\|/api/flashcards/jobs\|/api/flashcards/process\|/api/flashcards/publish/\[jobId\]" --include="*.tsx" --include="*.ts" .
```

Expected: no matches (besides any docs/specs/plans).

If any code matches: trace + clean up before proceeding.

- [ ] **Step 3: Build the admin app**

Run:
```bash
cd apps/admin && pnpm build
```

Expected: clean build, no missing-module errors.

- [ ] **Step 4: Run full admin test suite**

Run:
```bash
cd apps/admin && pnpm test
```

Expected: PASS. Tests for the deleted PDF routes/components should no longer exist (deletes in step 1 took out `__tests__` subfolders too).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(admin): remove legacy PDF upload code paths"
```

---

## Task 20: Manual smoke test + push

**Files:** none

- [ ] **Step 1: Start dev server**

Run:
```bash
cd apps/admin && pnpm dev
```

Wait for "Ready".

- [ ] **Step 2: Smoke test happy path**

In browser:
1. Visit `http://localhost:3000/admin/flashcards/import` — page loads, dropzone visible
2. Click "Download sample CSV" — file downloads
3. Drag the downloaded `sample-flashcards.csv` onto the dropzone — preview shows 8 rows, "8 rows valid"
4. Click "Import 8 cards" — page navigates to `/admin/flashcards/drafts`
5. Drafts page shows newly imported topics. Enhancement column shows progress bars climbing as Gemini works.
6. Wait ~30s. Refresh. All topics show "✓ Complete".
7. Click "Review & Publish" on one row — review page opens, cards show 4 options each
8. Click a few exam tag buttons (e.g. UPCAT, DOST-SEI)
9. Click "Publish N cards" — redirects back to drafts. That topic is gone (published).
10. Verify in Supabase: those cards have `status='published'`, `listing_slugs=['upcat','dost-sei']`.

- [ ] **Step 3: Smoke test error paths**

1. Upload a CSV with a missing header column — error shown, import button disabled
2. Upload a CSV with empty `answer` in row 3 — preview shows red row with error message
3. Upload a 6MB CSV — file error "File too large"

- [ ] **Step 4: Push branch**

```bash
git push origin master
```

- [ ] **Step 5: Final commit if anything was tweaked during smoke test**

```bash
git add -A
git commit -m "fix(admin/csv): smoke test follow-ups" || echo "nothing to commit"
git push origin master
```

---

## Self-review against the spec

- §1 Goal — replaces PDF with CSV: ✓ (Tasks 8 + 19)
- §3 User workflow — every step has a task: ✓
- §4 CSV format — encoded in Task 5 (parseCsvRow) + Task 6 (validateCsvFile) + Task 8 (route): ✓
- §5 Schema — Task 3 migration: ✓
- §6 API routes — Tasks 8, 9, 10, 11 (new) + Task 19 (deletes): ✓
- §7 UI pages — Tasks 14, 16, 17 (new) + Task 19 (deletes): ✓
- §8 Async Gemini enhancement — Task 9: ✓
- §9 Code paths to delete — Task 19: ✓
- §10 Legacy preserved — Task 3 leaves pdf_jobs alone; nothing in plan touches it: ✓
- §11 Dependencies — Task 1: ✓
- §12 Testing strategy — pure helpers tested in Tasks 4-7; API routes tested in Tasks 8, 10, 11. Smoke test in Task 20.
- §13 Out of scope — not implemented (correct per spec).
