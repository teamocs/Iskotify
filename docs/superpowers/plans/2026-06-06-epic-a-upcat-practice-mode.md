# Epic A — UPCAT Practice Mode + Authored Question Bank — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real authored UPCAT mock-exam mode (320 Qs, passage sets, per-subtest scoring, corrected flow) + reusable CSV cleaning harness + Kuya Baw knowledge upgrade.

**Architecture:** A1 pure CSV cleaners (admin) → A2 two Supabase tables + admin importer + mobile SQLite mirror + sync → A3 mobile exam-mode screens with corrected flow + per-subtest scoring → A4 Kuya persona + `upcat_facts` FTS5 RAG. Mobile is pure JS (OTA, no version bump). Migrations applied via Supabase MCP after importer/tests pass; the 320-row import + facts seed run through the admin importer once verified.

**Tech Stack:** Next.js admin + papaparse + Vitest; Expo RN + Drizzle/expo-sqlite + Jest; Supabase (public-read RLS).

**Spec:** [docs/superpowers/specs/2026-06-06-epic-a-upcat-practice-mode-design.md](../specs/2026-06-06-epic-a-upcat-practice-mode-design.md)

**Source CSV:** `C:\Users\User\Downloads\Iskotify Upgrades\Iskotify_Question_Tracker_v2 - CSV Export (Firebase).csv` (320 logical rows, quote-aware).

---

## File map

### New
```
apps/admin/lib/csv/cleaners.ts                                  A1 pure cleaners
apps/admin/lib/csv/__tests__/cleaners.test.ts
apps/admin/lib/upcat/importUpcatCore.ts                         A2 import orchestrator
apps/admin/lib/upcat/__tests__/importUpcatCore.test.ts
apps/admin/app/api/upcat-questions/import/route.ts              A2 admin route
apps/admin/app/api/upcat-questions/import/__tests__/route.test.ts
apps/admin/app/admin/upcat/import/page.tsx                      A2 admin UI
supabase/migrations/016_upcat_questions.sql                     A2 tables
supabase/migrations/017_practice_sessions_subtest.sql           A3 subtest column
supabase/migrations/018_upcat_facts.sql                         A4 facts table
apps/mobile/utils/upcatExam.ts                                  A3 pure helpers
apps/mobile/utils/__tests__/upcatExam.test.ts
apps/mobile/app/practice/upcat/index.tsx                        A3 entry screen
apps/mobile/app/practice/upcat/[subtest].tsx                    A3 exam screen
apps/mobile/components/upcat/PassagePanel.tsx                   A3 collapsible passage
apps/mobile/components/upcat/QuestionNavigator.tsx              A3 skip/review strip
apps/mobile/services/__tests__/upcatExam.integration.test.ts   A3 (optional)
```

### Modified
```
apps/admin/components/admin/SidebarContent.tsx                  nav entry for UPCAT import
apps/mobile/db/schema.ts                                        + upcatQuestions, upcatPassages, upcatFacts, practiceSessions.subtest
apps/mobile/db/client.ts                                        + MIGRATIONS for the above + FTS5
apps/mobile/services/sync.ts                                    pull upcat_questions/passages/facts
apps/mobile/hooks/useRecordSession.ts                           + subtest param
apps/mobile/services/chatPrompts.ts                             A4 persona
apps/mobile/services/chatContext.ts                            A4 [UPCAT FACTS] block
apps/mobile/services/flashcardRetriever.ts                      A4 upcat_facts FTS query (or sibling)
apps/mobile/app/(tabs)/practice.tsx                             A3 "UPCAT Mock Exam" entry card
```

---

# A1 — Reusable CSV cleaning harness

## Task 1: cleaners.ts (TDD)

**Files:** Create `apps/admin/lib/csv/cleaners.ts` + `apps/admin/lib/csv/__tests__/cleaners.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/lib/csv/__tests__/cleaners.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { stripBom, decodeMojibake, resolveSentinel, letterToIndex, canonicalizeRegion } from '../cleaners'

describe('stripBom', () => {
  it('removes a leading BOM', () => { expect(stripBom('﻿hello')).toBe('hello') })
  it('leaves clean text unchanged', () => { expect(stripBom('hello')).toBe('hello') })
})

describe('decodeMojibake', () => {
  it('repairs em-dash mojibake', () => { expect(decodeMojibake('A â€" B')).toBe('A — B') })
  it('repairs curly apostrophe', () => { expect(decodeMojibake('Rizaâs')).toBe('Riza’s') })
  it('replaces the replacement char with em dash', () => { expect(decodeMojibake('A � B')).toBe('A — B') })
  it('is idempotent on clean text', () => { expect(decodeMojibake('clean — text ’ok')).toBe('clean — text ’ok') })
})

describe('resolveSentinel', () => {
  it('maps unconfirmed sentinels to null', () => {
    for (const s of ['', '[UNCONFIRMED]', 'UNCONFIRMED', 'Unknown', 'TBA', 'VERIFY', 'N/A', 'NA', '—', '-']) {
      expect(resolveSentinel(s)).toBeNull()
    }
  })
  it('is case-insensitive', () => { expect(resolveSentinel('unknown')).toBeNull() })
  it('trims and returns real values', () => { expect(resolveSentinel('  Manila ')).toBe('Manila') })
  it('handles null/undefined', () => { expect(resolveSentinel(null)).toBeNull(); expect(resolveSentinel(undefined)).toBeNull() })
})

describe('letterToIndex', () => {
  it('maps A-D to 0-3', () => {
    expect(letterToIndex('A')).toBe(0); expect(letterToIndex('B')).toBe(1)
    expect(letterToIndex('C')).toBe(2); expect(letterToIndex('D')).toBe(3)
  })
  it('is case-insensitive', () => { expect(letterToIndex('c')).toBe(2) })
  it('throws on invalid', () => {
    expect(() => letterToIndex('E')).toThrow(); expect(() => letterToIndex('')).toThrow()
    expect(() => letterToIndex('1')).toThrow()
  })
})

describe('canonicalizeRegion', () => {
  it('canonicalizes CALABARZON aliases', () => {
    for (const a of ['CALABARZON', 'Region IV-A', 'IV-A', '4A', 'Region 4-A']) {
      expect(canonicalizeRegion(a)).toBe('Region IV-A (CALABARZON)')
    }
  })
  it('canonicalizes NCR aliases', () => {
    for (const a of ['NCR', 'National Capital Region', 'Metro Manila']) {
      expect(canonicalizeRegion(a)).toBe('NCR')
    }
  })
  it('returns unknown input trimmed', () => { expect(canonicalizeRegion('  Atlantis ')).toBe('Atlantis') })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && pnpm vitest run lib/csv/__tests__/cleaners.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement cleaners.ts**

Create `apps/admin/lib/csv/cleaners.ts`:
```ts
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

// Common Windows-1252-misread-as-UTF-8 sequences → correct glyphs. Idempotent.
const MOJIBAKE_PAIRS: Array<[RegExp, string]> = [
  [/â/g, '—'],   // em dash
  [/â/g, '–'],   // en dash
  [/â/g, '’'],   // right single quote
  [/â/g, '‘'],   // left single quote
  [/â/g, '“'],   // left double quote
  [/â/g, '”'],   // right double quote
  [/Ã±/g, 'ñ'],          // ñ
  [/Ã/g, 'Ñ'],          // Ñ
  [/�/g, '—'],                // replacement char → em dash fallback
]
export function decodeMojibake(text: string): string {
  let out = text
  for (const [re, rep] of MOJIBAKE_PAIRS) out = out.replace(re, rep)
  return out
}

const SENTINELS = new Set(['', '[unconfirmed]', 'unconfirmed', 'unknown', 'tba', 'verify', 'n/a', 'na', '—', '-'])
export function resolveSentinel(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return SENTINELS.has(trimmed.toLowerCase()) ? null : trimmed
}

export function letterToIndex(letter: string): number {
  const i = ['A', 'B', 'C', 'D'].indexOf((letter ?? '').trim().toUpperCase())
  if (i === -1) throw new Error(`letterToIndex: invalid letter "${letter}"`)
  return i
}

const REGION_MAP: Record<string, string> = {}
function reg(canon: string, ...aliases: string[]) { for (const a of aliases) REGION_MAP[a.toLowerCase()] = canon }
reg('NCR', 'NCR', 'National Capital Region', 'Metro Manila')
reg('CAR', 'CAR', 'Cordillera Administrative Region')
reg('Region I (Ilocos)', 'Region I', 'Ilocos', 'Ilocos Region', 'I')
reg('Region II (Cagayan Valley)', 'Region II', 'Cagayan Valley', 'II')
reg('Region III (Central Luzon)', 'Region III', 'Central Luzon', 'III')
reg('Region IV-A (CALABARZON)', 'Region IV-A', 'CALABARZON', 'IV-A', '4A', 'Region 4-A')
reg('Region IV-B (MIMAROPA)', 'Region IV-B', 'MIMAROPA', 'IV-B', '4B')
reg('Region V (Bicol)', 'Region V', 'Bicol', 'Bicol Region', 'V')
reg('Region VI (Western Visayas)', 'Region VI', 'Western Visayas', 'VI')
reg('Region VII (Central Visayas)', 'Region VII', 'Central Visayas', 'VII')
reg('Region VIII (Eastern Visayas)', 'Region VIII', 'Eastern Visayas', 'VIII')
reg('Region IX (Zamboanga Peninsula)', 'Region IX', 'Zamboanga Peninsula', 'IX')
reg('Region X (Northern Mindanao)', 'Region X', 'Northern Mindanao', 'X')
reg('Region XI (Davao)', 'Region XI', 'Davao Region', 'Davao', 'XI')
reg('Region XII (SOCCSKSARGEN)', 'Region XII', 'SOCCSKSARGEN', 'XII')
reg('Region XIII (Caraga)', 'Region XIII', 'Caraga', 'XIII')
reg('BARMM', 'BARMM', 'Bangsamoro', 'Bangsamoro Autonomous Region in Muslim Mindanao', 'ARMM')
export function canonicalizeRegion(raw: string): string {
  const key = (raw ?? '').trim().toLowerCase()
  return REGION_MAP[key] ?? (raw ?? '').trim()
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd apps/admin && pnpm vitest run lib/csv/__tests__/cleaners.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/csv/cleaners.ts apps/admin/lib/csv/__tests__/cleaners.test.ts
git commit -m "feat(admin/csv): reusable cleaning harness (BOM, mojibake, sentinel, letter, region)"
```

---

# A2 — Data layer

## Task 2: Migration 016 — upcat tables

**Files:** Create `supabase/migrations/016_upcat_questions.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/016_upcat_questions.sql`:
```sql
CREATE TABLE IF NOT EXISTS upcat_passages (
  set_id text PRIMARY KEY,
  subtest text NOT NULL,
  passage_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upcat_questions (
  question_id text PRIMARY KEY,
  subtest text NOT NULL,
  main_subject text,
  topic text,
  subtopic text,
  question_format text,
  cognitive_level text,
  difficulty text,
  curriculum_alignment text,
  question_text text NOT NULL,
  options text[] NOT NULL,
  correct_index int NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation text NOT NULL,
  set_id text REFERENCES upcat_passages(set_id),
  set_position int,
  has_visual boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upcat_questions_subtest ON upcat_questions(subtest, status);
CREATE INDEX IF NOT EXISTS idx_upcat_questions_set ON upcat_questions(set_id);

ALTER TABLE upcat_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE upcat_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upcat_passages_read ON upcat_passages;
CREATE POLICY upcat_passages_read ON upcat_passages FOR SELECT USING (true);
DROP POLICY IF EXISTS upcat_questions_read ON upcat_questions;
CREATE POLICY upcat_questions_read ON upcat_questions FOR SELECT USING (true);
```

- [ ] **Step 2: Apply via Supabase MCP (controller)**

Controller calls `mcp__supabase__apply_migration` (project_id `dtugrsbarruizgzowgso`, name `016_upcat_questions`, the SQL above), then verifies both tables + RLS exist via `execute_sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_upcat_questions.sql
git commit -m "feat(db): upcat_questions + upcat_passages tables (public-read RLS)"
```

## Task 3: importUpcatCore (TDD)

**Files:** Create `apps/admin/lib/upcat/importUpcatCore.ts` + `__tests__/importUpcatCore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/lib/upcat/__tests__/importUpcatCore.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { importUpcatCore, type RawUpcatRow } from '../importUpcatCore'

function makeMockClient() {
  const inserted = { passages: [] as any[], questions: [] as any[] }
  const client = {
    from(table: string) {
      return {
        upsert(values: any) {
          const arr = Array.isArray(values) ? values : [values]
          if (table === 'upcat_passages') inserted.passages.push(...arr)
          else if (table === 'upcat_questions') inserted.questions.push(...arr)
          else throw new Error(`unexpected table ${table}`)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { client, inserted }
}

function row(p: Partial<RawUpcatRow>): RawUpcatRow {
  return {
    question_id: 'M001', subtest: 'Mathematics', main_subject: 'Algebra', topic: 'Basic Algebra',
    subtopic: 'Work', question_format: 'Word Problem', cognitive_level: 'Application', difficulty: 'Medium',
    curriculum_alignment: 'Grade 8', has_visual: 'No', visual_type: 'None', visual_description: '',
    set_id: '', set_position: '', passage_text: '', question_text: 'Q?',
    option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_answer: 'C',
    explanation: 'because', status: 'Approved', ...p,
  }
}

describe('importUpcatCore', () => {
  it('packs options[], converts letter→index, maps Approved→published', async () => {
    const { client, inserted } = makeMockClient()
    const res = await importUpcatCore(client as any, [row({})])
    expect(res.questions).toBe(1)
    const q = inserted.questions[0]
    expect(q.options).toEqual(['a', 'b', 'c', 'd'])
    expect(q.correct_index).toBe(2)
    expect(q.status).toBe('published')
    expect(q.has_visual).toBe(false)
  })

  it('dedupes passages by set_id (passage stored once)', async () => {
    const { client, inserted } = makeMockClient()
    const rows = [
      row({ question_id: 'R001', subtest: 'Reading Comprehension', set_id: 'PASS-001', set_position: '1', passage_text: 'Long passage' }),
      row({ question_id: 'R002', subtest: 'Reading Comprehension', set_id: 'PASS-001', set_position: '2', passage_text: '' }),
    ]
    await importUpcatCore(client as any, rows)
    expect(inserted.passages).toHaveLength(1)
    expect(inserted.passages[0].set_id).toBe('PASS-001')
    expect(inserted.passages[0].passage_text).toBe('Long passage')
    expect(inserted.questions).toHaveLength(2)
    expect(inserted.questions.every((q: any) => q.set_id === 'PASS-001')).toBe(true)
  })

  it('strips BOM from the first cell of the first row', async () => {
    const { client, inserted } = makeMockClient()
    await importUpcatCore(client as any, [row({ question_id: '﻿M001' })])
    expect(inserted.questions[0].question_id).toBe('M001')
  })

  it('throws on invalid correct_answer letter', async () => {
    const { client } = makeMockClient()
    await expect(importUpcatCore(client as any, [row({ correct_answer: 'E' })])).rejects.toThrow()
  })

  it('counts distinct passages + questions in the result', async () => {
    const { client } = makeMockClient()
    const res = await importUpcatCore(client as any, [
      row({ question_id: 'R001', set_id: 'PASS-001', set_position: '1', passage_text: 'P1' }),
      row({ question_id: 'R002', set_id: 'PASS-001', set_position: '2' }),
      row({ question_id: 'M001', set_id: '', passage_text: '' }),
    ])
    expect(res).toEqual({ passages: 1, questions: 3 })
  })
})
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd apps/admin && pnpm vitest run lib/upcat/__tests__/importUpcatCore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement importUpcatCore.ts**

Create `apps/admin/lib/upcat/importUpcatCore.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripBom, letterToIndex } from '../csv/cleaners'

export interface RawUpcatRow {
  question_id: string; subtest: string; main_subject: string; topic: string; subtopic: string
  question_format: string; cognitive_level: string; difficulty: string; curriculum_alignment: string
  has_visual: string; visual_type: string; visual_description: string
  set_id: string; set_position: string; passage_text: string
  question_text: string; option_a: string; option_b: string; option_c: string; option_d: string
  correct_answer: string; explanation: string; status: string
}

export interface ImportUpcatResult { passages: number; questions: number }

export async function importUpcatCore(client: SupabaseClient, rows: RawUpcatRow[]): Promise<ImportUpcatResult> {
  // 1. Collect distinct passages (first non-empty passage_text per set_id)
  const passages = new Map<string, { set_id: string; subtest: string; passage_text: string }>()
  for (const r of rows) {
    const setId = (r.set_id ?? '').trim()
    if (!setId) continue
    const text = (r.passage_text ?? '').trim()
    if (text && !passages.has(setId)) {
      passages.set(setId, { set_id: setId, subtest: (r.subtest ?? '').trim(), passage_text: text })
    }
  }
  if (passages.size > 0) {
    const { error } = await client.from('upcat_passages').upsert([...passages.values()], { onConflict: 'set_id' })
    if (error) throw new Error(`passage upsert failed: ${error.message}`)
  }

  // 2. Build question rows
  const questionRows = rows.map((r, i) => {
    const qid = (i === 0 ? stripBom(r.question_id ?? '') : (r.question_id ?? '')).trim()
    const setId = (r.set_id ?? '').trim()
    return {
      question_id: qid,
      subtest: (r.subtest ?? '').trim(),
      main_subject: (r.main_subject ?? '').trim() || null,
      topic: (r.topic ?? '').trim() || null,
      subtopic: (r.subtopic ?? '').trim() || null,
      question_format: (r.question_format ?? '').trim() || null,
      cognitive_level: (r.cognitive_level ?? '').trim() || null,
      difficulty: (r.difficulty ?? '').trim() || null,
      curriculum_alignment: (r.curriculum_alignment ?? '').trim() || null,
      question_text: (r.question_text ?? '').trim(),
      options: [r.option_a, r.option_b, r.option_c, r.option_d].map(o => (o ?? '').trim()),
      correct_index: letterToIndex(r.correct_answer),
      explanation: (r.explanation ?? '').trim(),
      set_id: setId || null,
      set_position: (r.set_position ?? '').trim() ? parseInt(r.set_position, 10) : null,
      has_visual: (r.has_visual ?? '').trim().toLowerCase() === 'yes',
      status: (r.status ?? '').trim().toLowerCase() === 'approved' ? 'published' : 'draft',
    }
  })

  const { error } = await client.from('upcat_questions').upsert(questionRows, { onConflict: 'question_id' })
  if (error) throw new Error(`question upsert failed: ${error.message}`)

  return { passages: passages.size, questions: questionRows.length }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd apps/admin && pnpm vitest run lib/upcat/__tests__/importUpcatCore.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/upcat/importUpcatCore.ts apps/admin/lib/upcat/__tests__/importUpcatCore.test.ts
git commit -m "feat(admin/upcat): importUpcatCore (passage dedup, letter->index, Approved->published)"
```

## Task 4: Admin import route (TDD)

**Files:** Create `apps/admin/app/api/upcat-questions/import/route.ts` + `__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/api/upcat-questions/import/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuthClient = vi.fn()
const mockServerClient = vi.fn()
vi.mock('@/lib/supabase', () => ({ createAuthClient: async () => mockAuthClient() }))
vi.mock('@iskotify/utils', () => ({ createServerClient: () => mockServerClient() }))
vi.mock('@/lib/upcat/importUpcatCore', () => ({
  importUpcatCore: vi.fn(async () => ({ passages: 23, questions: 320 })),
}))

import { POST } from '../route'

function makeAuthClient(user: { id: string } | null = { id: 'u1' }) {
  return { auth: { getUser: async () => ({ data: { user } }) } }
}
function makeDataClient(role = 'admin') {
  return { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }) }
}
function makeReq(csv: string): any {
  const fd = new FormData()
  fd.append('file', new File([csv], 'q.csv'))
  return { url: 'http://x/api/upcat-questions/import', formData: async () => fd, headers: new Headers() }
}
const HEADER = 'question_id,subtest,main_subject,topic,subtopic,question_format,cognitive_level,difficulty,curriculum_alignment,has_visual,visual_type,visual_description,set_id,set_position,passage_text,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,status'

beforeEach(() => {
  mockAuthClient.mockReset(); mockServerClient.mockReset()
  mockAuthClient.mockImplementation(() => makeAuthClient())
  mockServerClient.mockImplementation(() => makeDataClient('admin'))
})

describe('POST /api/upcat-questions/import', () => {
  it('401 when unauthenticated', async () => {
    mockAuthClient.mockImplementation(() => makeAuthClient(null))
    const res = await POST(makeReq(HEADER + '\nM001,Mathematics,,,,,,,,No,None,,,,,Q?,a,b,c,d,C,because,Approved'))
    expect(res.status).toBe(401)
  })
  it('403 when not admin', async () => {
    mockServerClient.mockImplementation(() => makeDataClient('user'))
    const res = await POST(makeReq(HEADER + '\nM001,Mathematics,,,,,,,,No,None,,,,,Q?,a,b,c,d,C,because,Approved'))
    expect(res.status).toBe(403)
  })
  it('400 when no file', async () => {
    const res = await POST({ url: 'http://x', formData: async () => new FormData(), headers: new Headers() } as any)
    expect(res.status).toBe(400)
  })
  it('200 with counts on valid CSV', async () => {
    const res = await POST(makeReq(HEADER + '\nM001,Mathematics,,,,,,,,No,None,,,,,Q?,a,b,c,d,C,because,Approved'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ passages: 23, questions: 320 })
  })
})
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd apps/admin && pnpm vitest run app/api/upcat-questions/import/__tests__/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `apps/admin/app/api/upcat-questions/import/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { importUpcatCore, type RawUpcatRow } from '@/lib/upcat/importUpcatCore'

export const runtime = 'nodejs'

const EXPECTED = ['question_id','subtest','main_subject','topic','subtopic','question_format','cognitive_level','difficulty','curriculum_alignment','has_visual','visual_type','visual_description','set_id','set_position','passage_text','question_text','option_a','option_b','option_c','option_d','correct_answer','explanation','status']

export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })

  const text = await file.text()
  const parsed = Papa.parse<RawUpcatRow>(text, {
    header: true, skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase().replace(/^﻿/, ''),
  })
  const fields = parsed.meta.fields ?? []
  const missing = EXPECTED.filter(c => !fields.includes(c))
  if (missing.length) return NextResponse.json({ error: `Missing columns: ${missing.join(', ')}` }, { status: 400 })

  const rows = (parsed.data as RawUpcatRow[]).filter(r => (r.question_id ?? '').trim())
  if (rows.length === 0) return NextResponse.json({ error: 'No data rows' }, { status: 400 })
  if (rows.length > 2000) return NextResponse.json({ error: `Too many rows (max 2000, got ${rows.length})` }, { status: 400 })

  try {
    const result = await importUpcatCore(supabase, rows)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Import failed' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd apps/admin && pnpm vitest run app/api/upcat-questions/import/__tests__/route.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/api/upcat-questions/import
git commit -m "feat(admin/upcat): POST /api/upcat-questions/import (auth + parse + import)"
```

## Task 5: Admin import UI page + nav

**Files:** Create `apps/admin/app/admin/upcat/import/page.tsx`; Modify `apps/admin/components/admin/SidebarContent.tsx`

- [ ] **Step 1: Read the existing flashcards import page to clone its shape**

Run: `sed -n '1,120p' apps/admin/app/admin/flashcards/import/page.tsx`
Note its dropzone + preview + POST pattern + light theme tokens.

- [ ] **Step 2: Create the UPCAT import page**

Create `apps/admin/app/admin/upcat/import/page.tsx` — a near-clone of the flashcards import page, but: posts to `/api/upcat-questions/import`, no client-side per-row validation (the schema is fixed/authored), preview shows first 10 rows of the parsed CSV, success shows `{passages, questions}`. Reuse `Topbar`, `CsvDropzone`. Match the existing page's exact structure and class names (read it first). Title "Import UPCAT Questions". On success show a green panel: "Imported {questions} questions across {passages} passages."

```tsx
'use client'
import { useState } from 'react'
import Papa from 'papaparse'
import { Topbar } from '@/components/admin/Topbar'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'

export default function UpcatImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([])
  const [totalRows, setTotalRows] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ passages: number; questions: number } | null>(null)

  function handleFile(f: File) {
    setFile(f); setError(null); setResult(null)
    if (f.size > 5 * 1024 * 1024) { setError('File too large (max 5MB)'); return }
    f.text().then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase().replace(/^﻿/, '') })
      const all = (parsed.data as Array<Record<string, string>>).filter(r => (r.question_id ?? '').trim())
      setTotalRows(all.length); setPreviewRows(all.slice(0, 10))
    })
  }

  async function handleImport() {
    if (!file) return
    setImporting(true); setError(null)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/upcat-questions/import', { method: 'POST', body: fd })
    const body = await res.json()
    setImporting(false)
    if (!res.ok) { setError(body.error ?? 'Import failed'); return }
    setResult(body)
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Import UPCAT Questions" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div>
            <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">Import UPCAT question bank</h2>
            <p className="text-[#6e6e73] text-sm mt-1">Upload the authored UPCAT CSV (question_id, subtest, options A–D, correct_answer, passage sets). No AI enhancement — options are authored.</p>
          </div>
          <CsvDropzone onFileSelected={handleFile} disabled={importing} />
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">{error}</div>}
          {result && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm">
              <div className="text-[#1d1d1f] font-heading font-bold">✓ Imported {result.questions} questions across {result.passages} passages</div>
            </div>
          )}
          {file && previewRows.length > 0 && !result && (
            <div className="text-[#6e6e73] text-sm">{totalRows} rows detected · showing first {previewRows.length}</div>
          )}
          {file && !result && (
            <button onClick={handleImport} disabled={importing}
              className={`inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold transition-colors shadow-sm ${importing ? 'bg-[#f5f5f7] text-[#6e6e73]' : 'bg-[#800000] text-white hover:bg-[#9a0a1f]'}`}>
              {importing ? 'Importing…' : `Import ${totalRows} questions`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add nav entry**

Edit `apps/admin/components/admin/SidebarContent.tsx` KNOWLEDGEBASE section — add after the Drafts row:
```tsx
      { href: '/admin/upcat/import', icon: '🎓', label: 'UPCAT Questions' },
```

- [ ] **Step 4: Type-check + build**

Run: `cd apps/admin && pnpm exec tsc --noEmit 2>&1 | grep -v backfill | head; pnpm build 2>&1 | grep -iE "upcat|error|Compiled" | head`
Expected: clean; `/admin/upcat/import` + `/api/upcat-questions/import` in route list.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/admin/upcat apps/admin/components/admin/SidebarContent.tsx
git commit -m "feat(admin/upcat): import UI page + nav entry"
```

## Task 6: Mobile schema + SQLite migrations for upcat tables

**Files:** Modify `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`

- [ ] **Step 1: Add Drizzle schema**

In `apps/mobile/db/schema.ts`, after the `flashcards` table add:
```ts
export const upcatPassages = sqliteTable('upcat_passages', {
  setId: text('set_id').primaryKey(),
  subtest: text('subtest').notNull(),
  passageText: text('passage_text').notNull(),
})

export const upcatQuestions = sqliteTable('upcat_questions', {
  questionId: text('question_id').primaryKey(),
  subtest: text('subtest').notNull(),
  mainSubject: text('main_subject'),
  topic: text('topic'),
  subtopic: text('subtopic'),
  questionFormat: text('question_format'),
  cognitiveLevel: text('cognitive_level'),
  difficulty: text('difficulty'),
  curriculumAlignment: text('curriculum_alignment'),
  questionText: text('question_text').notNull(),
  options: text('options').notNull().default('[]'),     // JSON array
  correctIndex: integer('correct_index').notNull(),
  explanation: text('explanation').notNull(),
  setId: text('set_id'),
  setPosition: integer('set_position'),
  hasVisual: integer('has_visual', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('published'),
  remoteUpdatedAt: integer('remote_updated_at'),
}, (t) => [
  index('upcat_questions_subtest_idx').on(t.subtest),
  index('upcat_questions_set_idx').on(t.setId),
])
```

- [ ] **Step 2: Add SQLite migrations**

In `apps/mobile/db/client.ts` MIGRATIONS array, append:
```ts
  `CREATE TABLE IF NOT EXISTS upcat_passages (
    set_id TEXT PRIMARY KEY NOT NULL,
    subtest TEXT NOT NULL,
    passage_text TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS upcat_questions (
    question_id TEXT PRIMARY KEY NOT NULL,
    subtest TEXT NOT NULL,
    main_subject TEXT, topic TEXT, subtopic TEXT,
    question_format TEXT, cognitive_level TEXT, difficulty TEXT, curriculum_alignment TEXT,
    question_text TEXT NOT NULL,
    options TEXT NOT NULL DEFAULT '[]',
    correct_index INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    set_id TEXT, set_position INTEGER,
    has_visual INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    remote_updated_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS upcat_questions_subtest_idx ON upcat_questions (subtest)`,
  `CREATE INDEX IF NOT EXISTS upcat_questions_set_idx ON upcat_questions (set_id)`,
```

- [ ] **Step 3: Type-check + existing tests**

Run: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -i upcat | head; pnpm jest services/__tests__/sync.test.ts 2>&1 | tail -5`
Expected: no upcat type errors; sync tests still pass (if a sync-test fixture needs the new tables, defer — Task 7 covers sync).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts
git commit -m "feat(mobile/upcat): upcat_questions + upcat_passages SQLite schema + migrations"
```

## Task 7: Mobile sync — pull upcat tables

**Files:** Modify `apps/mobile/services/sync.ts`

- [ ] **Step 1: Add upcat fetch + upsert to syncOnLaunch**

In `apps/mobile/services/sync.ts`, import the new tables at top:
```ts
import { ..., upcatQuestions, upcatPassages } from '../db/schema'
```
After the existing `[listingsRes, subjectsRes, topicsRes]` Promise.all, add a second fetch (upcat is NOT slug-scoped — pull all published):
```ts
    const [upcatPassagesRes, upcatQuestionsRes] = await Promise.all([
      supabase.from('upcat_passages').select('set_id,subtest,passage_text'),
      supabase.from('upcat_questions')
        .select('question_id,subtest,main_subject,topic,subtopic,question_format,cognitive_level,difficulty,curriculum_alignment,question_text,options,correct_index,explanation,set_id,set_position,has_visual,status,updated_at')
        .eq('status', 'published')
        .gt('updated_at', since),
    ])
```
Inside the `db.transaction`, after the flashcards loop, add:
```ts
      for (const row of (upcatPassagesRes.data ?? [])) {
        const vals = { setId: row.set_id, subtest: row.subtest, passageText: row.passage_text }
        tx.insert(upcatPassages).values(vals).onConflictDoUpdate({ target: upcatPassages.setId, set: vals }).run()
      }
      for (const row of (upcatQuestionsRes.data ?? [])) {
        const vals = {
          questionId: row.question_id, subtest: row.subtest,
          mainSubject: row.main_subject ?? null, topic: row.topic ?? null, subtopic: row.subtopic ?? null,
          questionFormat: row.question_format ?? null, cognitiveLevel: row.cognitive_level ?? null,
          difficulty: row.difficulty ?? null, curriculumAlignment: row.curriculum_alignment ?? null,
          questionText: row.question_text,
          options: JSON.stringify(row.options ?? []),
          correctIndex: row.correct_index, explanation: row.explanation,
          setId: row.set_id ?? null, setPosition: row.set_position ?? null,
          hasVisual: !!row.has_visual, status: row.status,
          remoteUpdatedAt: new Date(row.updated_at).getTime(),
        }
        tx.insert(upcatQuestions).values(vals).onConflictDoUpdate({ target: upcatQuestions.questionId, set: vals }).run()
      }
```

- [ ] **Step 2: Type-check + sync tests**

Run: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -i "sync\|upcat" | head; pnpm jest services/__tests__/sync.test.ts 2>&1 | tail -8`
Expected: no type errors. If a sync test's in-memory DB lacks upcat tables and the test exercises syncOnLaunch, add the two CREATE TABLE statements to that test's fixture (match the SQLite DDL from Task 6).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/services/sync.ts
[ -n "$(git status --porcelain apps/mobile/services/__tests__/sync.test.ts)" ] && git add apps/mobile/services/__tests__/sync.test.ts
git commit -m "feat(mobile/upcat): sync pulls upcat_questions + upcat_passages on launch"
```

---

# A3 — Exam-mode practice screen

## Task 8: upcatExam pure helpers (TDD)

**Files:** Create `apps/mobile/utils/upcatExam.ts` + `apps/mobile/utils/__tests__/upcatExam.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/utils/__tests__/upcatExam.test.ts`:
```ts
import { buildExam, scoreExam, SUBTESTS, type RawUpcatQuestion, type RawUpcatPassage } from '../upcatExam'

function q(p: Partial<RawUpcatQuestion>): RawUpcatQuestion {
  return {
    questionId: 'M001', subtest: 'Mathematics', questionText: 'Q?', options: ['a','b','c','d'],
    correctIndex: 2, explanation: 'x', setId: null, setPosition: null, ...p,
  }
}

describe('SUBTESTS', () => {
  it('lists the 4 official subtests', () => {
    expect(SUBTESTS).toEqual(['Mathematics','Science','Language Proficiency','Reading Comprehension'])
  })
})

describe('buildExam', () => {
  it('full mode returns all questions for the subtest', () => {
    const qs = [q({questionId:'M001'}), q({questionId:'M002'}), q({questionId:'S001', subtest:'Science'})]
    const out = buildExam(qs, [], { subtest: 'Mathematics', mode: 'full' })
    expect(out.map(x => x.questionId)).toEqual(['M001','M002'])
  })

  it('attaches passage_text to questions via set_id', () => {
    const qs = [q({questionId:'R001', subtest:'Reading Comprehension', setId:'PASS-001', setPosition:1})]
    const passages: RawUpcatPassage[] = [{ setId:'PASS-001', subtest:'Reading Comprehension', passageText:'The passage' }]
    const out = buildExam(qs, passages, { subtest: 'Reading Comprehension', mode: 'full' })
    expect(out[0]!.passageText).toBe('The passage')
  })

  it('quick mode samples but never splits a passage set', () => {
    // one 5-question set + 20 standalone; quick target ~15
    const setQs = Array.from({length:5}, (_,i) => q({questionId:`R${i}`, subtest:'Reading Comprehension', setId:'PASS-001', setPosition:i+1}))
    const standalone = Array.from({length:20}, (_,i) => q({questionId:`L${i}`, subtest:'Reading Comprehension'}))
    const passages: RawUpcatPassage[] = [{ setId:'PASS-001', subtest:'Reading Comprehension', passageText:'P' }]
    const out = buildExam([...setQs, ...standalone], passages, { subtest: 'Reading Comprehension', mode: 'quick' })
    const setMembers = out.filter(x => x.setId === 'PASS-001')
    // either all 5 of the set are present, or none — never a partial set
    expect(setMembers.length === 0 || setMembers.length === 5).toBe(true)
    // set members stay contiguous + in set_position order
    if (setMembers.length === 5) {
      const idxs = out.map((x,i)=>x.setId==='PASS-001'?i:-1).filter(i=>i>=0)
      expect(idxs).toEqual([idxs[0], idxs[0]!+1, idxs[0]!+2, idxs[0]!+3, idxs[0]!+4])
      expect(setMembers.map(x=>x.setPosition)).toEqual([1,2,3,4,5])
    }
  })

  it('quick mode caps roughly at the target size', () => {
    const standalone = Array.from({length:100}, (_,i) => q({questionId:`M${i}`}))
    const out = buildExam(standalone, [], { subtest: 'Mathematics', mode: 'quick' })
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('scoreExam', () => {
  it('computes overall + per-subtest correct/total', () => {
    const answers = [
      { subtest: 'Mathematics', correct: true },
      { subtest: 'Mathematics', correct: false },
      { subtest: 'Science', correct: true },
    ]
    const res = scoreExam(answers)
    expect(res.overall).toEqual({ correct: 2, total: 3 })
    expect(res.bySubtest['Mathematics']).toEqual({ correct: 1, total: 2 })
    expect(res.bySubtest['Science']).toEqual({ correct: 1, total: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd apps/mobile && pnpm jest utils/__tests__/upcatExam.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement upcatExam.ts**

Create `apps/mobile/utils/upcatExam.ts`:
```ts
export const SUBTESTS = ['Mathematics', 'Science', 'Language Proficiency', 'Reading Comprehension'] as const
export type Subtest = typeof SUBTESTS[number]

export interface RawUpcatQuestion {
  questionId: string; subtest: string; questionText: string; options: string[]
  correctIndex: number; explanation: string; setId: string | null; setPosition: number | null
}
export interface RawUpcatPassage { setId: string; subtest: string; passageText: string }
export interface ExamQuestion extends RawUpcatQuestion { passageText: string | null }

const QUICK_TARGET = 15
const QUICK_MAX = 20

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

export function buildExam(
  questions: RawUpcatQuestion[],
  passages: RawUpcatPassage[],
  opts: { subtest: Subtest; mode: 'quick' | 'full' },
): ExamQuestion[] {
  const passageById = new Map(passages.map(p => [p.setId, p.passageText]))
  const inSubtest = questions.filter(q => q.subtest === opts.subtest)

  // Group into "units": each passage set is one atomic unit; each standalone Q is its own unit.
  const setGroups = new Map<string, RawUpcatQuestion[]>()
  const standalone: RawUpcatQuestion[] = []
  for (const q of inSubtest) {
    if (q.setId) {
      if (!setGroups.has(q.setId)) setGroups.set(q.setId, [])
      setGroups.get(q.setId)!.push(q)
    } else standalone.push(q)
  }
  for (const g of setGroups.values()) g.sort((a, b) => (a.setPosition ?? 0) - (b.setPosition ?? 0))

  type Unit = RawUpcatQuestion[]
  const units: Unit[] = [...standalone.map(q => [q]), ...setGroups.values()]

  let chosen: Unit[]
  if (opts.mode === 'full') {
    // preserve original order for full: standalone+sets by first questionId order of appearance
    chosen = units
  } else {
    // quick: shuffle units, accumulate until ~QUICK_TARGET (never split a unit, never exceed QUICK_MAX)
    const picked: Unit[] = []
    let count = 0
    for (const u of shuffle(units)) {
      if (count >= QUICK_TARGET) break
      if (count + u.length > QUICK_MAX) continue
      picked.push(u); count += u.length
    }
    if (picked.length === 0 && units.length) { picked.push(units[0]!) } // always at least one
    chosen = picked
  }

  return chosen.flat().map(q => ({ ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null }))
}

export interface ScoredAnswer { subtest: string; correct: boolean }
export function scoreExam(answers: ScoredAnswer[]): {
  overall: { correct: number; total: number }
  bySubtest: Record<string, { correct: number; total: number }>
} {
  const bySubtest: Record<string, { correct: number; total: number }> = {}
  let correct = 0
  for (const a of answers) {
    if (!bySubtest[a.subtest]) bySubtest[a.subtest] = { correct: 0, total: 0 }
    bySubtest[a.subtest]!.total++
    if (a.correct) { bySubtest[a.subtest]!.correct++; correct++ }
  }
  return { overall: { correct, total: answers.length }, bySubtest }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd apps/mobile && pnpm jest utils/__tests__/upcatExam.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/utils/upcatExam.ts apps/mobile/utils/__tests__/upcatExam.test.ts
git commit -m "feat(mobile/upcat): buildExam + scoreExam pure helpers (passage-safe sampling, subtest scoring)"
```

## Task 9: practice_sessions.subtest column (Supabase + mobile + hook)

**Files:** Create `supabase/migrations/017_practice_sessions_subtest.sql`; Modify `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`, `apps/mobile/hooks/useRecordSession.ts`

- [ ] **Step 1: Migration 017**

Create `supabase/migrations/017_practice_sessions_subtest.sql`:
```sql
-- practice session subtest tag (UPCAT mock per-subtest scores; consumed by the UPG estimator, Epic E)
-- NOTE: practice_sessions is stored per-device in SQLite and backed up to user_app_data jsonb;
-- there is no server practice_sessions table to alter. This migration is a documentation no-op
-- placeholder kept for migration-number continuity; the real change is the mobile SQLite column below.
SELECT 1;
```
(If a server `practice_sessions` table DOES exist per the survey, replace the body with `ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS subtest text;` — the controller verifies via list_tables before applying.)

- [ ] **Step 2: Mobile schema + migration**

In `apps/mobile/db/schema.ts`, find `practiceSessions` and add to its columns:
```ts
  subtest: text('subtest'),
```
In `apps/mobile/db/client.ts` MIGRATIONS, append:
```ts
  `ALTER TABLE practice_sessions ADD COLUMN subtest TEXT`,
```

- [ ] **Step 3: Extend useRecordSession**

In `apps/mobile/hooks/useRecordSession.ts`, add `subtest?: string` to `SessionParams` and `SessionRecord`, and thread it through `buildSessionRecord`:
```ts
export interface SessionParams { listingSlug: string; topicId: string; deckId: string; score: number; total: number; startTime: number; subtest?: string }
export interface SessionRecord { listingSlug: string; topicId: string; deckId: string; score: number; total: number; durationSecs: number; completedAt: number; subtest: string | null }
```
In `buildSessionRecord` return, add `subtest: params.subtest ?? null,`.

- [ ] **Step 4: Update + run the useRecordSession test**

Run: `cd apps/mobile && pnpm jest useRecordSession 2>&1 | tail -8`
If the existing test asserts the exact record shape, add `subtest: null` to its expected object. Add one new assertion: `buildSessionRecord({...params, subtest:'Mathematics'}).subtest === 'Mathematics'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/017_practice_sessions_subtest.sql apps/mobile/db/schema.ts apps/mobile/db/client.ts apps/mobile/hooks/useRecordSession.ts apps/mobile/hooks/__tests__/useRecordSession.test.ts
git commit -m "feat(mobile): practice_sessions.subtest tag for per-subtest UPCAT scoring"
```

## Task 10: PassagePanel + QuestionNavigator components

**Files:** Create `apps/mobile/components/upcat/PassagePanel.tsx`, `apps/mobile/components/upcat/QuestionNavigator.tsx`

- [ ] **Step 1: PassagePanel (collapsible passage)**

Create `apps/mobile/components/upcat/PassagePanel.tsx`:
```tsx
import { useState, useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

export function PassagePanel({ passage }: { passage: string }) {
  const { theme: t, typo } = useTheme()
  const [expanded, setExpanded] = useState(true)
  const s = useMemo(() => StyleSheet.create({
    wrap: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, marginHorizontal: 14, marginBottom: 10, overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
    title: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold' },
    chev: { color: t.textSecondary, fontSize: 16 },
    body: { paddingHorizontal: 14, paddingBottom: 12, maxHeight: 220 },
    text: { fontSize: typo.sm, color: t.textSecondary, lineHeight: 21, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])
  return (
    <View style={s.wrap}>
      <Pressable style={s.header} onPress={() => setExpanded(e => !e)} accessibilityRole="button" accessibilityLabel="Toggle passage">
        <Text style={s.title}>📄 Passage</Text>
        <Text style={s.chev}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded && (
        <ScrollView style={s.body} nestedScrollEnabled><Text style={s.text}>{passage}</Text></ScrollView>
      )}
    </View>
  )
}
```

- [ ] **Step 2: QuestionNavigator (skip/review strip)**

Create `apps/mobile/components/upcat/QuestionNavigator.tsx`:
```tsx
import { useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

interface Props {
  total: number
  currentIdx: number
  answeredIdxs: Set<number>
  onJump: (idx: number) => void
}
export function QuestionNavigator({ total, currentIdx, answeredIdxs, onJump }: Props) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    row: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
    cell: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2 },
    cellAnswered: { backgroundColor: t.accentSurface, borderColor: t.accent },
    cellCurrent: { borderColor: t.accentText, borderWidth: 2 },
    num: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    numAnswered: { color: t.accentText },
  }), [t, typo])
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {Array.from({ length: total }, (_, i) => (
        <Pressable key={i} onPress={() => onJump(i)}
          style={[s.cell, answeredIdxs.has(i) && s.cellAnswered, i === currentIdx && s.cellCurrent]}
          accessibilityRole="button" accessibilityLabel={`Go to question ${i + 1}`}>
          <Text style={[s.num, answeredIdxs.has(i) && s.numAnswered]}>{i + 1}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -i upcat | head`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/upcat/PassagePanel.tsx apps/mobile/components/upcat/QuestionNavigator.tsx
git commit -m "feat(mobile/upcat): PassagePanel + QuestionNavigator components"
```

## Task 11: Exam entry screen

**Files:** Create `apps/mobile/app/practice/upcat/index.tsx`

- [ ] **Step 1: Implement the entry screen**

Create `apps/mobile/app/practice/upcat/index.tsx` — loads per-subtest counts from local `upcatQuestions`, renders 4 subtest cards + a "Full Mock" card; tapping opens a Quick/Full chooser, then routes to `/practice/upcat/[subtest]?mode=quick|full`. (Full Mock routes to `[subtest]` with subtest=`all`.)
```tsx
import { useEffect, useState, useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { upcatQuestions } from '../../../db/schema'
import { SUBTESTS } from '../../../utils/upcatExam'
import { useTheme } from '../../../theme/ThemeContext'

export default function UpcatHome() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [picker, setPicker] = useState<string | null>(null) // subtest awaiting quick/full choice; 'all' for full mock

  useEffect(() => {
    void (async () => {
      const rows = await db.select({ subtest: upcatQuestions.subtest }).from(upcatQuestions)
      const c: Record<string, number> = {}
      for (const r of rows) c[r.subtest] = (c[r.subtest] ?? 0) + 1
      setCounts(c)
    })()
  }, [db])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
    title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    sub: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    card: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 18, padding: 16, marginHorizontal: 16, marginBottom: 10 },
    cardMock: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
    cardTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    cardSub: { fontSize: typo.sm, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderTopWidth: 1, borderColor: t.border, gap: 10 },
    sheetTitle: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    choice: { borderRadius: 14, padding: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2 },
    choiceTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary },
    choiceSub: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2 },
    overlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  }), [t, typo])

  function go(mode: 'quick' | 'full') {
    if (!picker) return
    const subtest = picker
    setPicker(null)
    router.push(`/practice/upcat/${encodeURIComponent(subtest)}?mode=${mode}`)
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>UPCAT Mock Exam</Text>
        <Text style={s.sub}>{total} authored questions · choose a subtest or the full mock</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Pressable style={[s.card, s.cardMock]} onPress={() => setPicker('all')}>
          <Text style={s.cardTitle}>🎯 Full Mock Exam</Text>
          <Text style={s.cardSub}>All {total} questions across 4 subtests</Text>
        </Pressable>
        {SUBTESTS.map(st => (
          <Pressable key={st} style={s.card} onPress={() => setPicker(st)}>
            <Text style={s.cardTitle}>{st}</Text>
            <Text style={s.cardSub}>{counts[st] ?? 0} questions</Text>
          </Pressable>
        ))}
      </ScrollView>

      {picker && (
        <>
          <Pressable style={s.overlay} onPress={() => setPicker(null)} />
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{picker === 'all' ? 'Full Mock' : picker}</Text>
            <Pressable style={s.choice} onPress={() => go('quick')}>
              <Text style={s.choiceTitle}>Quick</Text>
              <Text style={s.choiceSub}>~15 sampled questions</Text>
            </Pressable>
            <Pressable style={s.choice} onPress={() => go('full')}>
              <Text style={s.choiceTitle}>Full</Text>
              <Text style={s.choiceSub}>{picker === 'all' ? `All ${total} questions` : `All ${counts[picker] ?? 0} questions`}</Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -i "upcat/index\|practice/upcat" | head`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/practice/upcat/index.tsx
git commit -m "feat(mobile/upcat): exam entry screen (subtest + Full Mock, Quick/Full chooser)"
```

## Task 12: Exam screen with corrected flow

**Files:** Create `apps/mobile/app/practice/upcat/[subtest].tsx`

- [ ] **Step 1: Implement the exam screen**

Create `apps/mobile/app/practice/upcat/[subtest].tsx`. Key behaviors (corrected flow): load `upcatQuestions` + `upcatPassages` from local DB, `buildExam` by subtest (or all subtests when param=`all`), render one question at a time with **select-then-confirm (no auto-advance)**, **Skip**, **Back**, **change answer before submit**, `PassagePanel` when the current question has `passageText`, `QuestionNavigator` strip, then a results phase with overall % + per-subtest breakdown + per-question review. Records one session per subtest via `useRecordSession` with the `subtest` tag. Full code:

```tsx
import { useState, useEffect, useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { upcatQuestions, upcatPassages, userProgress } from '../../../db/schema'
import { useRecordSession } from '../../../hooks/useRecordSession'
import { buildExam, scoreExam, SUBTESTS, type ExamQuestion, type Subtest } from '../../../utils/upcatExam'
import { PassagePanel } from '../../../components/upcat/PassagePanel'
import { QuestionNavigator } from '../../../components/upcat/QuestionNavigator'
import { useTheme } from '../../../theme/ThemeContext'

const LETTERS = ['A','B','C','D'] as const
type Phase = 'loading' | 'exam' | 'results'

export default function UpcatExam() {
  const { subtest: subtestParam, mode } = useLocalSearchParams<{ subtest: string; mode?: 'quick'|'full' }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const { recordSession } = useRecordSession()

  const [phase, setPhase] = useState<Phase>('loading')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({}) // qIndex → selected option
  const startRef = useState(() => Date.now())[0]

  useEffect(() => {
    void (async () => {
      const [qRows, pRows] = await Promise.all([
        db.select().from(upcatQuestions),
        db.select().from(upcatPassages),
      ])
      const parsed = qRows.map(r => ({
        questionId: r.questionId, subtest: r.subtest, questionText: r.questionText,
        options: JSON.parse(r.options) as string[], correctIndex: r.correctIndex,
        explanation: r.explanation, setId: r.setId, setPosition: r.setPosition,
      }))
      const passages = pRows.map(p => ({ setId: p.setId, subtest: p.subtest, passageText: p.passageText }))
      const targetSubtests: Subtest[] = subtestParam === 'all' ? [...SUBTESTS] : [subtestParam as Subtest]
      const built = targetSubtests.flatMap(st => buildExam(parsed, passages, { subtest: st, mode: (mode === 'quick' ? 'quick' : 'full') }))
      setQuestions(built)
      setPhase(built.length ? 'exam' : 'results')
    })()
  }, [db, subtestParam, mode])

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  function submit() {
    const now = Date.now()
    const scored = questions.map((q, i) => ({ subtest: q.subtest, correct: answers[i] === q.correctIndex }))
    const result = scoreExam(scored)
    // one session per subtest
    for (const st of Object.keys(result.bySubtest)) {
      const b = result.bySubtest[st]!
      void recordSession({ listingSlug: 'upcat', topicId: '', deckId: '', score: b.correct, total: b.total, startTime: startRef, subtest: st })
    }
    // record per-question progress (best-effort)
    void db.transaction(async (tx) => {
      for (let i = 0; i < questions.length; i++) {
        await tx.insert(userProgress).values({ flashcardId: questions[i]!.questionId, correct: answers[i] === questions[i]!.correctIndex, answeredAt: now })
      }
    }).catch(() => {})
    setPhase('results')
  }

  if (phase === 'loading') return <SafeAreaView style={s.root}><Text style={s.loading}>Loading exam…</Text></SafeAreaView>

  if (phase === 'results') {
    const scored = questions.map((q, i) => ({ subtest: q.subtest, correct: answers[i] === q.correctIndex }))
    const res = scoreExam(scored)
    const pct = res.overall.total ? Math.round(res.overall.correct / res.overall.total * 100) : 0
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={[s.scoreCard, pct >= 60 ? s.pass : s.fail]}>
            <Text style={[s.scorePct, { color: pct >= 60 ? '#16a34a' : t.accentText }]}>{pct}%</Text>
            <Text style={s.scoreVerdict}>{pct >= 60 ? '🎉 Great work' : '📚 Keep practicing'}</Text>
            <Text style={s.scoreSub}>{res.overall.correct}/{res.overall.total} correct</Text>
          </View>
          <Text style={s.sectionLbl}>Per-subtest</Text>
          {Object.entries(res.bySubtest).map(([st, b]) => (
            <View key={st} style={s.subtestRow}>
              <Text style={s.subtestName}>{st}</Text>
              <Text style={s.subtestScore}>{b.correct}/{b.total} · {Math.round(b.correct/b.total*100)}%</Text>
            </View>
          ))}
          <Text style={s.sectionLbl}>Review</Text>
          {questions.map((q, i) => {
            const sel = answers[i]; const ok = sel === q.correctIndex
            return (
              <View key={q.questionId} style={[s.reviewCard, ok ? s.reviewOk : s.reviewBad]}>
                <Text style={s.reviewQ}>Q{i+1}. {q.questionText}</Text>
                {q.options.map((o, oi) => (
                  <Text key={oi} style={[s.reviewOpt, oi === q.correctIndex && { color: '#16a34a', fontWeight: '700' }, oi === sel && oi !== q.correctIndex && { color: '#dc2626' }]}>
                    {LETTERS[oi]}. {o}{oi === q.correctIndex ? '  ✓' : (oi === sel ? '  ✗' : '')}
                  </Text>
                ))}
                {q.explanation ? <Text style={s.reviewExp}>💡 {q.explanation}</Text> : null}
              </View>
            )
          })}
          <Pressable style={s.primaryBtn} onPress={() => router.replace(`/practice/upcat/${subtestParam}?mode=${mode}`)}>
            <Text style={s.primaryBtnTxt}>Retake exam</Text>
          </Pressable>
          <Pressable style={s.ghostBtn} onPress={() => router.replace('/practice/upcat')}>
            <Text style={s.ghostTxt}>← Back to exams</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // exam phase
  const q = questions[idx]!
  const sel = answers[idx]
  const answeredIdxs = new Set(Object.keys(answers).map(Number))
  const isLast = idx === questions.length - 1

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={s.back}>‹</Text></Pressable>
        <Text style={s.topTitle} numberOfLines={1}>{subtestParam === 'all' ? 'Full Mock' : subtestParam}</Text>
        <Text style={s.counter}>{idx+1}/{questions.length}</Text>
      </View>
      <QuestionNavigator total={questions.length} currentIdx={idx} answeredIdxs={answeredIdxs} onJump={setIdx} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {q.passageText ? <PassagePanel passage={q.passageText} /> : null}
        <View style={s.qCard}>
          <Text style={s.qText}>{q.questionText}</Text>
        </View>
        <View style={s.opts}>
          {q.options.map((o, oi) => (
            <Pressable key={oi} style={[s.opt, sel === oi && s.optOn]} onPress={() => setAnswers(a => ({ ...a, [idx]: oi }))}>
              <View style={[s.optLetter, sel === oi && s.optLetterOn]}><Text style={[s.optLetterTxt, sel === oi && { color: '#fff' }]}>{LETTERS[oi]}</Text></View>
              <Text style={s.optTxt}>{o}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Pressable style={s.footBtnGhost} onPress={() => setIdx(i => Math.max(0, i-1))} disabled={idx === 0}>
          <Text style={[s.footGhostTxt, idx === 0 && { opacity: 0.3 }]}>Back</Text>
        </Pressable>
        <Pressable style={s.footBtnGhost} onPress={() => isLast ? submit() : setIdx(i => i+1)}>
          <Text style={s.footGhostTxt}>{isLast ? 'Review' : 'Skip'}</Text>
        </Pressable>
        <Pressable style={[s.footBtnPrimary, sel === undefined && s.footDisabled]} disabled={sel === undefined}
          onPress={() => isLast ? submit() : setIdx(i => i+1)}>
          <Text style={s.footPrimaryTxt}>{isLast ? 'Submit' : 'Next'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function makeStyles(t: any, typo: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    loading: { color: t.textTertiary, textAlign: 'center', marginTop: 80, fontFamily: 'Lexend_400Regular' },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
    back: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    counter: { fontSize: typo.sm, fontWeight: '700', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    qCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, padding: 18, marginHorizontal: 14, marginBottom: 12 },
    qText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: 24, fontFamily: 'Outfit_600SemiBold' },
    opts: { gap: 9, paddingHorizontal: 14 },
    opt: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.border, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 13 },
    optOn: { backgroundColor: t.accentSurface, borderColor: t.accent },
    optLetter: { width: 30, height: 30, borderRadius: 9, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' },
    optLetterOn: { backgroundColor: t.accent },
    optLetterTxt: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
    optTxt: { flex: 1, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 8, padding: 14, backgroundColor: t.bg, borderTopWidth: 1, borderColor: t.border },
    footBtnGhost: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: t.border },
    footGhostTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    footBtnPrimary: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(128,0,0,0.85)', alignItems: 'center' },
    footDisabled: { opacity: 0.4 },
    footPrimaryTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    scoreCard: { borderRadius: 24, padding: 22, marginBottom: 18, borderWidth: 1, alignItems: 'center' },
    pass: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
    fail: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.20)' },
    scorePct: { fontSize: 52, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    scoreVerdict: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    scoreSub: { fontSize: typo.sm, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    sectionLbl: { fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 8, fontFamily: 'Lexend_600SemiBold' },
    subtestRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 12, padding: 12, marginBottom: 6 },
    subtestName: { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
    subtestScore: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    reviewCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
    reviewOk: { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.18)' },
    reviewBad: { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.18)' },
    reviewQ: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, marginBottom: 8, fontFamily: 'Outfit_600SemiBold' },
    reviewOpt: { fontSize: typo.sm, color: t.textSecondary, lineHeight: 20, fontFamily: 'Lexend_400Regular' },
    reviewExp: { fontSize: typo.xs, color: t.textTertiary, marginTop: 8, lineHeight: 17, fontFamily: 'Lexend_400Regular' },
    primaryBtn: { backgroundColor: 'rgba(128,0,0,0.85)', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: typo.md, fontFamily: 'Outfit_700Bold' },
    ghostBtn: { paddingVertical: 12, alignItems: 'center' },
    ghostTxt: { color: t.textTertiary, fontSize: typo.sm, fontFamily: 'Lexend_400Regular' },
  })
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -i "upcat/\[subtest\]" | head`
Expected: no errors. (If `userSettings`-style `inset` shorthand errors, replace `inset:0` with `top:0,left:0,right:0,bottom:0`.)

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/practice/upcat/[subtest].tsx"
git commit -m "feat(mobile/upcat): exam screen — corrected flow, passage panel, per-subtest results"
```

## Task 13: Home/practice entry point

**Files:** Modify `apps/mobile/app/(tabs)/practice.tsx`

- [ ] **Step 1: Add a "UPCAT Mock Exam" card**

In `apps/mobile/app/(tabs)/practice.tsx`, add a prominent card near the top of the scroll content that routes to `/practice/upcat`. Read the file first to match its existing card styling (`s.qs.card` / section patterns). Add:
```tsx
        <Pressable
          style={qs.card}
          onPress={() => router.push('/practice/upcat')}
          accessibilityRole="button"
          accessibilityLabel="Open UPCAT mock exam"
        >
          <View style={qs.icon}><Text style={{ fontSize: 15 }}>🎓</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={qs.title}>UPCAT Mock Exam</Text>
            <Text style={qs.sub}>Authored questions · timed mock by subtest</Text>
          </View>
          <Text style={qs.go}>›</Text>
        </Pressable>
```
(Place it above the existing "Quick Start" block. Reuse the existing `qs` StyleSheet already in the file.)

- [ ] **Step 2: Type-check + practice test**

Run: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -i practice | head; pnpm jest "tabs/__tests__/practice" 2>&1 | tail -6`
Expected: no errors; practice tests still pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(tabs\)/practice.tsx
git commit -m "feat(mobile/practice): UPCAT Mock Exam entry card"
```

---

# A4 — Kuya Baw upgrade

## Task 14: Persona system-prompt upgrade

**Files:** Modify `apps/mobile/services/chatPrompts.ts`

- [ ] **Step 1: Read current prompt constants**

Run: `sed -n '1,80p' apps/mobile/services/chatPrompts.ts` — find the SYSTEM_PROMPT constants + the existing English-output rule + 2-sentence cap.

- [ ] **Step 2: Fold in the distilled persona**

Edit the system-prompt constant(s) to prepend the distilled Kuya Baw identity (keep existing rules verbatim):
```
You are Kuya Baw, a warm, encouraging Filipino study kuya for UPCAT and college-prep students. Be supportive but honest — never guarantee exam results or cutoff scores, and when unsure, tell the student to verify at upcat.up.edu.ph. [existing rules: respond in clear English; keep replies to ~2 sentences; ...]
```
Do NOT add Taglish canned answers. Keep the `isTagalogHeavy()` output filter intact.

- [ ] **Step 3: Update + run chatPrompts tests**

Run: `cd apps/mobile && pnpm jest chatPrompts 2>&1 | tail -8`
If a test asserts the exact prompt string, update it to include the persona prefix. Add one assertion that the prompt contains "Kuya Baw" + "upcat.up.edu.ph".

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/services/chatPrompts.ts apps/mobile/services/__tests__/chatPrompts.test.ts
git commit -m "feat(mobile/kuya): persona system prompt (warm, honest, no cutoff guarantees)"
```

## Task 15: upcat_facts table + FTS5 (mobile) + Supabase + sync

**Files:** Create `supabase/migrations/018_upcat_facts.sql`; Modify `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`, `apps/mobile/services/sync.ts`

- [ ] **Step 1: Supabase migration 018**

Create `supabase/migrations/018_upcat_facts.sql`:
```sql
CREATE TABLE IF NOT EXISTS upcat_facts (
  id text PRIMARY KEY,
  topic text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  source text,
  valid_year int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE upcat_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upcat_facts_read ON upcat_facts;
CREATE POLICY upcat_facts_read ON upcat_facts FOR SELECT USING (true);
```
(Controller applies via MCP.)

- [ ] **Step 2: Mobile schema + SQLite + FTS5**

In `apps/mobile/db/schema.ts` add:
```ts
export const upcatFacts = sqliteTable('upcat_facts', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  source: text('source'),
  validYear: integer('valid_year'),
  remoteUpdatedAt: integer('remote_updated_at'),
})
```
In `apps/mobile/db/client.ts` MIGRATIONS append (mirroring the existing flashcards_fts pattern):
```ts
  `CREATE TABLE IF NOT EXISTS upcat_facts (
    id TEXT PRIMARY KEY NOT NULL, topic TEXT NOT NULL, question TEXT NOT NULL,
    answer TEXT NOT NULL, source TEXT, valid_year INTEGER, remote_updated_at INTEGER
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS upcat_facts_fts USING fts5(
    fact_id UNINDEXED, topic, question, answer, tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS upcat_facts_ai AFTER INSERT ON upcat_facts BEGIN
    INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
  END`,
  `CREATE TRIGGER IF NOT EXISTS upcat_facts_ad AFTER DELETE ON upcat_facts BEGIN
    DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS upcat_facts_au AFTER UPDATE ON upcat_facts BEGIN
    DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
    INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
  END`,
```

- [ ] **Step 3: Sync pull for upcat_facts**

In `apps/mobile/services/sync.ts`, add `upcatFacts` to the import + a fetch `supabase.from('upcat_facts').select('id,topic,question,answer,source,valid_year,updated_at').gt('updated_at', since)` and an upsert loop in the transaction (mirror the upcat_questions loop; the FTS triggers keep the index synced automatically).

- [ ] **Step 4: Type-check + sync test**

Run: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -i "fact\|sync" | head; pnpm jest services/__tests__/sync.test.ts 2>&1 | tail -6`
Expected: no type errors; sync tests pass (extend fixtures if needed).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/018_upcat_facts.sql apps/mobile/db/schema.ts apps/mobile/db/client.ts apps/mobile/services/sync.ts
[ -n "$(git status --porcelain apps/mobile/services/__tests__/sync.test.ts)" ] && git add apps/mobile/services/__tests__/sync.test.ts
git commit -m "feat(mobile/kuya): upcat_facts table + FTS5 index + sync"
```

## Task 16: [UPCAT FACTS] retrieval block in chat (TDD)

**Files:** Modify `apps/mobile/services/chatContext.ts` (+ `flashcardRetriever.ts` sibling); add test

- [ ] **Step 1: Read current retrieval code**

Run: `sed -n '1,120p' apps/mobile/services/flashcardRetriever.ts; echo ---; grep -n "RELEVANT FLASHCARDS\|buildRetrieved\|searchFlashcards" apps/mobile/services/chatContext.ts`

- [ ] **Step 2: Write the failing test**

Create/extend `apps/mobile/services/__tests__/chatContext.test.ts` with a test that, given an in-memory DB seeded with one `upcat_facts` row (+ FTS), `buildChatContext` (or the relevant exported fn) returns a context string containing a `[UPCAT FACTS]` block with the fact's answer when the query matches. Mirror the existing flashcard-retrieval test setup in this file (it already builds an in-memory DB per earlier work). Add the `upcat_facts` + `upcat_facts_fts` CREATE statements to the test fixture.

- [ ] **Step 3: Run test to verify fail**

Run: `cd apps/mobile && pnpm jest services/__tests__/chatContext.test.ts 2>&1 | tail -10`
Expected: FAIL — no `[UPCAT FACTS]` block yet.

- [ ] **Step 4: Implement retrieval + block**

Add a `searchUpcatFacts(db, query, limit)` to `flashcardRetriever.ts` (BM25 query of `upcat_facts_fts` joined to `upcat_facts`, mirroring `searchFlashcards`). In `chatContext.ts`, call it alongside the flashcard search and, when results exist, append a block:
```
[UPCAT FACTS]
- <question> → <answer> (as of <valid_year>; verify at upcat.up.edu.ph)
...
```
Append `(as of <valid_year>; verify at upcat.up.edu.ph)` only when `valid_year` is set.

- [ ] **Step 5: Run test to verify pass + full chat suite**

Run: `cd apps/mobile && pnpm jest chatContext flashcardRetriever 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/services/chatContext.ts apps/mobile/services/flashcardRetriever.ts apps/mobile/services/__tests__/chatContext.test.ts
git commit -m "feat(mobile/kuya): [UPCAT FACTS] retrieval block from FTS5"
```

---

# Verification, data load, ship

## Task 17: Full verification + apply migrations + import data

**Files:** none (operational; controller runs MCP + import)

- [ ] **Step 1: Full suites**

Run:
```bash
cd apps/admin && pnpm test 2>&1 | tail -5
cd apps/mobile && pnpm test 2>&1 | tail -5
cd apps/admin && pnpm build 2>&1 | tail -3
```
Expected: admin green (was 242 + new), mobile green (was 517 + new upcat/exam tests), admin build clean.

- [ ] **Step 2: Apply Supabase migrations (controller via MCP)**

Controller applies 016, 017 (verify whether a server practice_sessions table exists first), 018 via `mcp__supabase__apply_migration` + verifies tables/policies.

- [ ] **Step 3: Import the 320-question bank (controller)**

After admin deploys, the controller imports via the admin UI / a direct importUpcatCore run. Verify counts: `SELECT subtest, count(*) FROM upcat_questions GROUP BY subtest` → Math 60, Science 60, Language Proficiency 100, Reading Comprehension 100; `SELECT count(*) FROM upcat_passages` → 23.

- [ ] **Step 4: Seed upcat_facts (controller)**

Prepare a facts CSV chunked from `kuya_baw_upcat_context` Parts 1–15 (id, topic, question, answer, source, valid_year) and import into `upcat_facts` (admin path or MCP insert). Verify a sample query returns rows.

- [ ] **Step 5: Push + OTA**

```bash
git push origin master
cd apps/mobile && npx eas-cli update --branch preview --message "feat(epic A): UPCAT mock exam + question bank + Kuya facts"
```

- [ ] **Step 6: Manual smoke (after OTA + import)**

1. Mobile pull-to-sync → UPCAT questions land locally.
2. Practice tab → "UPCAT Mock Exam" → pick Mathematics → Quick → answer, skip, go back, change an answer, submit → per-subtest results + review show.
3. Reading subtest → passage panel renders + collapses; the 5 set questions share it.
4. Full Mock → all 4 subtests present; per-subtest breakdown on results.
5. Kuya chat → ask "how does the UPG work?" → answer references the UPCAT facts + "verify at upcat.up.edu.ph".

---

## Self-review against the spec

- A1 cleaners → Task 1 ✓ (BOM, mojibake, sentinel, letter, region all tested)
- A2 tables → Task 2; importer core → Task 3; route → Task 4; admin UI → Task 5; mobile mirror → Tasks 6–7 ✓ (no Gemini ✓)
- A3 pure helpers → Task 8 (passage-safe sampling ✓, subtest scoring ✓); subtest column → Task 9; passage/nav components → Task 10; entry → Task 11; corrected-flow exam screen → Task 12 (no auto-advance ✓, skip ✓, back ✓, change ✓, passage ✓, per-subtest results ✓); home entry → Task 13 ✓
- A4 persona → Task 14; facts table+FTS+sync → Task 15; [UPCAT FACTS] block → Task 16 ✓
- Delivery (migrations via MCP, 320-row import, facts seed, OTA, smoke) → Task 17 ✓
- Subtest-tagged sessions for Epic E → Task 9 ✓
- Type/name consistency: `importUpcatCore`/`RawUpcatRow`/`buildExam`/`scoreExam`/`upcatQuestions`/`upcatPassages`/`upcatFacts`/`SUBTESTS` used consistently across tasks ✓
