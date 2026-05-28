# MCQ Fix + Hybrid School Search + Flashcard Restructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken MCQ rendering (wrong options shown in Q&A engine), restore hybrid school search (Supabase DB first, Google Places API fallback), and restructure flashcards with proper options/answer storage, migrating existing 80 questions to the new format.

**Architecture:**
- The Q&A bug is a 2-line regex fix: `parseEmbedded()` uses `A)` parenthesis pattern but all 80 DB flashcards use `A.` period + newline format. Fixing the regex unblocks existing content immediately.
- School search adds a Supabase `schools` table query (ILIKE name) before the Google Places API call. Supabase results take priority; Places API is fallback only.
- Flashcard restructure adds `options text[]` + `correct_answer_index int` to both Supabase and local SQLite, updates sync, and migrates existing 80 questions in-place via a SQL UPDATE that parses the embedded format.

**Tech Stack:** Drizzle ORM + expo-sqlite (local), Supabase PostgreSQL (remote), Google Places API v2, TypeScript, React Native Expo SDK 54

**Supabase project ID:** `dtugrsbarruizgzowgso`

**Confirmed topic IDs in Supabase:**
- Language Proficiency: `9c0ece16-8208-4683-aa91-1044012c2504`
- Mathematics: `b42c38f2-683b-4039-9afe-ef31a3989aad`
- Reading Comprehension: `835f33fb-81be-476e-a84f-c905532ddbfc`
- Science: `0cb62eba-5e02-4603-b1db-e164631b515c`

---

### Task 1: Fix parseEmbedded regex for A. newline format

**Root cause:** All 80 DB flashcards use `A. opt\nB. opt\n...` format (period + newline).
`parseEmbedded()` regex uses `A\)` (parenthesis) so it NEVER matches → every card falls into synthetic distractor path → wrong options shown.

Three changes in `apps/mobile/utils/mcDistractors.ts`:
1. Regex: `A\)` → `A[.)]` (and B, C, D)
2. Answer letter check: `^([A-D])\)` → `^([A-D])[.)]`
3. Stem strip: `A\)\s` → `A[.)]\s`

Also add `options?` and `correctAnswerIndex?` to `RawCard` interface for future stored-options path.

**Files:**
- Modify: `apps/mobile/utils/mcDistractors.ts`
- Create: `apps/mobile/utils/__tests__/mcDistractors.test.ts`

- [ ] **Step 1: Create test file** `apps/mobile/utils/__tests__/mcDistractors.test.ts`

```typescript
import { buildQuizQuestions } from '../mcDistractors'
import type { RawCard } from '../mcDistractors'

const card = (overrides: Partial<RawCard> = {}): RawCard => ({
  id: '1', question: 'Q?', answer: 'A', explanation: '', difficulty: 1, ...overrides,
})

describe('buildQuizQuestions', () => {
  describe('A. newline format (DB format)', () => {
    it('parses stem and options from A. newline format', () => {
      const c = card({
        question: 'Which organelle produces ATP?\nA. Nucleus\nB. Ribosome\nC. Mitochondria\nD. Chloroplast',
        answer: 'C. Mitochondria',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('Which organelle produces ATP?')
      expect(q!.options).toHaveLength(4)
      expect(q!.options).toContain('Mitochondria')
      expect(q!.options[q!.answerIndex]).toBe('Mitochondria')
    })

    it('strips option labels from stem', () => {
      const c = card({
        question: 'What is H₂O?\nA. Carbon dioxide\nB. Water\nC. Oxygen\nD. Nitrogen',
        answer: 'B. Water',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).not.toMatch(/A\./)
      expect(q!.stem).not.toContain('Carbon dioxide')
    })
  })

  describe('A) inline format (legacy)', () => {
    it('parses A) inline format', () => {
      const c = card({
        question: 'What is 2+2? A) 2 B) 3 C) 4 D) 5',
        answer: 'C) 4',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('What is 2+2?')
      expect(q!.options[q!.answerIndex]).toBe('4')
    })
  })

  describe('stored options (seeded cards)', () => {
    it('uses stored options and answerIndex directly', () => {
      const c: RawCard = {
        id: 's1', question: 'What is 2+2?', answer: '4',
        options: ['2', '3', '4', '5'], correctAnswerIndex: 2,
        explanation: '', difficulty: 1,
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('What is 2+2?')
      expect(q!.options).toEqual(['2', '3', '4', '5'])
      expect(q!.answerIndex).toBe(2)
    })
  })

  describe('plain Q+A fallback', () => {
    it('includes correct answer in options and places it at answerIndex', () => {
      const cards: RawCard[] = [
        card({ id: '1', answer: 'Alpha' }),
        card({ id: '2', answer: 'Beta' }),
        card({ id: '3', answer: 'Gamma' }),
        card({ id: '4', answer: 'Delta' }),
      ]
      const [q] = buildQuizQuestions(cards)
      expect(q!.options).toHaveLength(4)
      expect(q!.options[q!.answerIndex]).toBe('Alpha')
    })
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```
cd apps/mobile && npx jest utils/__tests__/mcDistractors.test.ts --no-coverage
```
Expected: "parses stem and options from A. newline format" FAILS (regex doesn't match)

- [ ] **Step 3: Update `apps/mobile/utils/mcDistractors.ts`**

```typescript
export interface RawCard {
  id: string
  question: string
  answer: string
  options?: string[]           // stored: 4 option texts, no letter prefix
  correctAnswerIndex?: number  // stored: 0–3
  explanation: string
  difficulty: number
}

export interface QuizQuestion {
  id: string
  stem: string
  options: string[]
  answerIndex: number
  explanation: string
  difficulty: number
}

const FALLBACKS = ['Cannot be determined', 'None of the above', 'All of the above']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

function stripPrefix(answer: string): string {
  return answer.replace(/^[A-D][.)]\s*/, '').trim()
}

// Handles both "A)" and "A." label formats, with options on same line or new lines
function parseEmbedded(card: RawCard): QuizQuestion | null {
  const m = card.question.match(/\bA[.)]\s*(.*?)\s+B[.)]\s*(.*?)\s+C[.)]\s*(.*?)\s+D[.)]\s*([\s\S]+?)$/)
  if (!m) return null
  const stem = card.question.replace(/\s+A[.)]\s[\s\S]*$/, '').trim()
  const options = [m[1]!.trim(), m[2]!.trim(), m[3]!.trim(), m[4]!.trim()]
  const letter = card.answer.match(/^([A-D])[.)]/)?.[1]
  if (!letter) return null
  const answerIndex = 'ABCD'.indexOf(letter)
  if (answerIndex === -1) return null
  return { id: card.id, stem, options, answerIndex, explanation: card.explanation, difficulty: card.difficulty }
}

export function buildQuizQuestions(cards: RawCard[]): QuizQuestion[] {
  return cards.map(card => {
    // Priority 1: pre-stored options (new seeded flashcards)
    if (card.options && card.options.length === 4 && card.correctAnswerIndex !== undefined) {
      return {
        id: card.id,
        stem: card.question.trim(),
        options: card.options,
        answerIndex: card.correctAnswerIndex,
        explanation: card.explanation,
        difficulty: card.difficulty,
      }
    }

    // Priority 2: embedded A)/A. parsing
    const embedded = parseEmbedded(card)
    if (embedded) return embedded

    // Priority 3: synthetic distractors from pool
    const correct = stripPrefix(card.answer)
    const pool = cards
      .filter(c => c.id !== card.id)
      .map(c => stripPrefix(c.answer))
      .filter(a => a.length > 0 && a.toLowerCase() !== correct.toLowerCase())
    const unique = [...new Set(pool)]
    const distractors = shuffle(unique).slice(0, 3)

    let fi = 0
    while (distractors.length < 3) {
      const fb = FALLBACKS[fi % FALLBACKS.length]!
      if (!distractors.includes(fb)) distractors.push(fb)
      fi++
    }

    const all = shuffle([correct, ...distractors.slice(0, 3)])
    return {
      id: card.id,
      stem: card.question.trim(),
      options: all,
      answerIndex: Math.max(0, all.indexOf(correct)),
      explanation: card.explanation,
      difficulty: card.difficulty,
    }
  })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```
cd apps/mobile && npx jest utils/__tests__/mcDistractors.test.ts --no-coverage
```
Expected: All 4 test groups pass

- [ ] **Step 5: Run full suite — verify no regressions**

```
cd apps/mobile && npx jest --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/utils/mcDistractors.ts apps/mobile/utils/__tests__/mcDistractors.test.ts
git commit -m "fix(qa): fix MCQ parseEmbedded to handle A. newline format + add stored options support"
```

---

### Task 2: Apply schools migration + verify

The `schools` table does not exist in Supabase. Apply `supabase/migrations/008_schools.sql` content via Supabase MCP.

**Files:** Remote Supabase (via MCP `apply_migration`)

- [ ] **Step 1: Apply the schools migration**

Use `mcp__supabase__apply_migration` with:
- `project_id`: `dtugrsbarruizgzowgso`
- `name`: `schools_restore`
- `query`: full content of `supabase/migrations/008_schools.sql`

Note: File uses `IF NOT EXISTS` and idempotent `DO $$` guards — safe.

- [ ] **Step 2: Verify**

Run SQL: `SELECT COUNT(*) as total FROM schools;`
Expected: > 1000

Run SQL: `SELECT name, city, province FROM schools WHERE name ILIKE '%ateneo%' LIMIT 3;`
Expected: Ateneo school rows

- [ ] **Step 3: Commit (migration file already exists)**

No file changes needed — migration already in repo.

---

### Task 3: Hybrid school search

Update `useSchoolSearch.ts` to query Supabase `schools` first, then fall back to Places API.

**Logic:**
1. Query: `supabase.from('schools').select('name,city,province').ilike('name', '%q%').limit(10)`
2. If results ≥ 1 → return them, skip Places API
3. If results = 0 → call Places API
4. `searchSupabase` never throws — errors return `[]` silently (Places is fallback)

**Files:**
- Modify: `apps/mobile/hooks/useSchoolSearch.ts`
- Modify: `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts`

- [ ] **Step 1: Replace `apps/mobile/hooks/useSchoolSearch.ts`**

```typescript
import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../services/supabase'

const PLACES_URL = 'https://places.googleapis.com/v1/places:autocomplete'
const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? ''

export interface SchoolResult {
  name: string
  subtitle: string
}

export interface UseSchoolSearch {
  query: string
  setQuery: (q: string) => void
  results: SchoolResult[]
  loading: boolean
  error: boolean
  retry: () => void
}

async function searchSupabase(q: string): Promise<SchoolResult[]> {
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('name, city, province')
      .ilike('name', `%${q}%`)
      .limit(10)
    if (error || !data || data.length === 0) return []
    return data.map(r => ({
      name: r.name as string,
      subtitle: `${r.city as string}, ${r.province as string}`,
    }))
  } catch {
    return []
  }
}

async function searchPlaces(q: string): Promise<SchoolResult[]> {
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': 'suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify({
      input: q,
      includedPrimaryTypes: ['school', 'secondary_school', 'university'],
      includedRegionCodes: ['ph'],
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as {
    suggestions?: Array<{
      placePrediction: {
        structuredFormat: {
          mainText: { text: string }
          secondaryText: { text: string }
        }
      }
    }>
  }
  return (json.suggestions ?? []).map(s => ({
    name: s.placePrediction.structuredFormat.mainText.text,
    subtitle: s.placePrediction.structuredFormat.secondaryText.text,
  }))
}

export function useSchoolSearch(): UseSchoolSearch {
  const [query, setQueryState] = useState('')
  const [results, setResults] = useState<SchoolResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQueryRef = useRef('')
  const activeQueryRef = useRef('')

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const fetchResults = useCallback(async (q: string) => {
    activeQueryRef.current = q
    setLoading(true)
    setError(false)
    try {
      const dbResults = await searchSupabase(q)
      if (activeQueryRef.current !== q) return
      if (dbResults.length > 0) {
        setResults(dbResults)
        return
      }
      const placesResults = await searchPlaces(q)
      if (activeQueryRef.current !== q) return
      setResults(placesResults)
    } catch {
      if (activeQueryRef.current !== q) return
      setError(true)
      setResults([])
    } finally {
      if (activeQueryRef.current === q) setLoading(false)
    }
  }, [])

  const setQuery = useCallback((q: string) => {
    setQueryState(q)
    lastQueryRef.current = q
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 3) {
      setResults([])
      setLoading(false)
      setError(false)
      return
    }
    debounceRef.current = setTimeout(() => void fetchResults(q), 500)
  }, [fetchResults])

  const retry = useCallback(() => {
    if (lastQueryRef.current.length < 3) return
    void fetchResults(lastQueryRef.current)
  }, [fetchResults])

  return { query, setQuery, results, loading, error, retry }
}
```

- [ ] **Step 2: Update test file `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts`**

Add mock for supabase at the top, and new tests for Supabase-first behavior. Existing tests still work because supabase mock returns empty by default.

Add after existing imports (before `const MOCK_RESPONSE = ...`):

```typescript
// Mock supabase — returns empty by default so existing fetch tests still work
const mockLimit = jest.fn().mockResolvedValue({ data: [], error: null })
const mockIlike = jest.fn().mockReturnValue({ limit: mockLimit })
const mockSelect = jest.fn().mockReturnValue({ ilike: mockIlike })
const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })

jest.mock('../../services/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))
```

Add new describe block after existing tests:

```typescript
describe('hybrid: Supabase-first', () => {
  it('returns Supabase results without calling fetch when DB has matches', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [{ name: 'University of the Philippines', city: 'Diliman', province: 'Quezon City' }],
      error: null,
    })
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('univ') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(1))
    expect(result.current.results[0]!.name).toBe('University of the Philippines')
    expect(result.current.results[0]!.subtitle).toBe('Diliman, Quezon City')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to Places API when Supabase returns empty', async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null })
    mockFetchOnce(MOCK_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(result.current.results[0]!.name).toBe('San Beda University')
  })
})
```

- [ ] **Step 3: Run tests**

```
cd apps/mobile && npx jest hooks/__tests__/useSchoolSearch.test.ts --no-coverage
```
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/hooks/useSchoolSearch.ts apps/mobile/hooks/__tests__/useSchoolSearch.test.ts
git commit -m "feat(school-search): hybrid search — Supabase DB first, Google Places API fallback"
```

---

### Task 4: Add options + correct_answer_index to Supabase flashcards

Add two columns to the remote `flashcards` table. Then run a SQL UPDATE to parse existing 80 cards from `A. opt\nB. opt` format and populate the new columns.

**Files:** Remote Supabase (via MCP)

- [ ] **Step 1: Apply column migration**

Use `mcp__supabase__apply_migration`:
- name: `flashcard_options_columns`
- query:
```sql
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS options text[] NOT NULL DEFAULT '{}';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS correct_answer_index integer;
```

- [ ] **Step 2: Populate existing 80 rows from embedded format**

Use `mcp__supabase__execute_sql`:

```sql
UPDATE flashcards
SET
  options = ARRAY[
    trim(regexp_replace(split_part(regexp_replace(question, E'^.*\\nA[.)][\\s]+', ''), E'\\nB[.)][\\s]+', 1), E'^\\s+|\\s+$', 'g')),
    trim(regexp_replace(split_part(regexp_replace(question, E'^.*\\nA[.)][\\s]+', ''), E'\\nB[.)][\\s]+', 2), E'^[\\s\\S]*?\\nC[.)][\\s]+', '') ),
    trim(split_part(split_part(question, E'\\nC[.)][\\s]+', 2), E'\\nD[.)][\\s]+', 1)),
    trim(split_part(question, E'\\nD[.)][\\s]+', 2))
  ],
  correct_answer_index = CASE
    WHEN answer ~ '^A[.)]' THEN 0
    WHEN answer ~ '^B[.)]' THEN 1
    WHEN answer ~ '^C[.)]' THEN 2
    WHEN answer ~ '^D[.)]' THEN 3
    ELSE NULL
  END
WHERE question ~ E'\\nA[.)]' AND answer ~ '^[A-D][.)]';
```

Note: This is a best-effort regex migration. Verify a few rows after running.

- [ ] **Step 3: Verify**

```sql
SELECT question, answer, options, correct_answer_index
FROM flashcards LIMIT 3;
```
Expected: `options` has 4 entries, `correct_answer_index` is 0-3

- [ ] **Step 4: Create migration file**

Create `supabase/migrations/009_flashcard_options.sql`:
```sql
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS options text[] NOT NULL DEFAULT '{}';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS correct_answer_index integer;
```

```bash
git add supabase/migrations/009_flashcard_options.sql
git commit -m "feat(db): add options[] and correct_answer_index to flashcards table"
```

---

### Task 5: Mirror new flashcard columns in local SQLite

**Files:**
- Modify: `apps/mobile/db/schema.ts`
- Modify: `apps/mobile/db/client.ts`

- [ ] **Step 1: Update `apps/mobile/db/schema.ts`**

Add to `flashcards` table definition (after `listingSlugs` field):
```typescript
  options: text('options').notNull().default('[]'),
  correctAnswerIndex: integer('correct_answer_index'),
```

- [ ] **Step 2: Update `apps/mobile/db/client.ts` MIGRATIONS array**

Add two entries at the end of the `MIGRATIONS` array:
```typescript
  `ALTER TABLE flashcards ADD COLUMN options TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE flashcards ADD COLUMN correct_answer_index INTEGER`,
```

Also update `CREATE_SQL` `flashcards` table to include the new columns (so fresh installs get them):

Add after `remote_updated_at INTEGER` line:
```
  options TEXT NOT NULL DEFAULT '[]',
  correct_answer_index INTEGER
```

- [ ] **Step 3: Run TypeScript check**

```
cd apps/mobile && npx tsc --noEmit
```
Expected: No new type errors

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts
git commit -m "feat(db): add options + correctAnswerIndex columns to local flashcards table"
```

---

### Task 6: Update sync service to transfer options fields

**Files:**
- Modify: `apps/mobile/services/sync.ts`

- [ ] **Step 1: Update SELECT in `syncOnLaunch`**

Change:
```typescript
.select('id,topic_id,question,answer,explanation,difficulty,listing_slugs,updated_at')
```
To:
```typescript
.select('id,topic_id,question,answer,explanation,difficulty,listing_slugs,options,correct_answer_index,updated_at')
```

- [ ] **Step 2: Update the INSERT values in `syncOnLaunch`**

Change the `vals` object inside the `for (const row of allCards)` loop:
```typescript
const vals = {
  id: row.id, topicId: row.topic_id, question: row.question, answer: row.answer,
  explanation: row.explanation, difficulty: row.difficulty,
  listingSlugs: JSON.stringify(row.listing_slugs ?? []), remoteUpdatedAt,
  options: JSON.stringify(row.options ?? []),
  correctAnswerIndex: row.correct_answer_index ?? null,
}
```

- [ ] **Step 3: Run TypeScript check**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/services/sync.ts
git commit -m "feat(sync): transfer options and correct_answer_index from Supabase to local SQLite"
```

---

### Task 7: Update quiz screens to pass options fields to buildQuizQuestions

The three quiz screens load flashcards from local SQLite but only select the old fields. They need to also select `options` and `correctAnswerIndex`, parse the JSON options array, and pass them to `buildQuizQuestions`.

**Files:**
- Modify: `apps/mobile/app/practice/[topicId].tsx`
- Modify: `apps/mobile/app/practice/listing/[slug].tsx`
- Modify: `apps/mobile/app/practice/deck/[deckId].tsx`

The same change applies in all three screens. In each screen:

**Step A:** Add `options` and `correctAnswerIndex` to the DB select:
```typescript
db.select({
  id: flashcardsTable.id,
  question: flashcardsTable.question,
  answer: flashcardsTable.answer,
  explanation: flashcardsTable.explanation,
  difficulty: flashcardsTable.difficulty,
  options: flashcardsTable.options,
  correctAnswerIndex: flashcardsTable.correctAnswerIndex,
})
```

**Step B:** Before passing to `buildQuizQuestions`, parse the options JSON:
```typescript
const rawCards = (cardRows as any[]).map(r => ({
  ...r,
  options: r.options ? (JSON.parse(r.options) as string[]) : undefined,
  correctAnswerIndex: r.correctAnswerIndex ?? undefined,
}))
const parsed = buildQuizQuestions(shuffle(rawCards as RawCard[])).slice(0, MAX_QUESTIONS)
```

- [ ] **Step 1: Update `[topicId].tsx`**

In the `load()` function inside `useEffect`, update the select and rawCards mapping as described above.

- [ ] **Step 2: Update `listing/[slug].tsx`**

Same change — find the flashcard select and add options mapping.

- [ ] **Step 3: Update `deck/[deckId].tsx`**

Same change.

- [ ] **Step 4: Run TypeScript check + tests**

```
cd apps/mobile && npx tsc --noEmit && npx jest --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/practice/
git commit -m "feat(qa): pass stored options and correctAnswerIndex through quiz screens"
```

---

### Task 8: Bump app versionCode and build

- [ ] **Step 1: Bump versionCode in `app.json`**

Increment `android.versionCode` by 1 (current is 8 → 9).

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app.json
git commit -m "chore(mobile): bump versionCode to 9"
```

- [ ] **Step 3: Build (run manually)**

```
eas build --platform android --profile preview
```

---

## Notes on PDF Seeding

The 4 UPCAT reviewer PDFs (`Review-Masters-Free-Reviewer-*.pdf` in Downloads) are **image-based/scanned** — text extraction returns empty content. The existing 80 Supabase flashcards have been migrated in-place to the new `options[]` + `correct_answer_index` format (Task 4 Step 2).

To add additional questions from the PDFs, provide the question content as a CSV or JSON and run the seed script. Structure:
```json
[{ "topic": "Science", "question": "...", "options": ["A", "B", "C", "D"], "answerIndex": 2, "explanation": "..." }]
```
