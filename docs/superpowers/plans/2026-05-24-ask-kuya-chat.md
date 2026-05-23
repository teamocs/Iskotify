# Ask Kuya Baw Chat (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-turn streaming chat opened from the Kuya Baw mascot card with two modes ("My progress" using user stats + last 5 sessions, "A topic" as concept tutor that refuses math problem solving), built on the existing AI Coach infrastructure.

**Architecture:** A new full-screen `<AskKuyaModal>` opened from a new "💬 Ask" pill on `AiModelBanner`. The modal hosts `useKuyaChat()` which streams tokens from `streamChatInference(prompt, onToken, signal)` in `services/llm.ts` — sharing the persistent llama context + FIFO mutex with the existing coach and flashcard enhancement workflows. Each Send is single-turn (no message history concatenation). RAM-only thread, wiped on modal close. UI updates batch every 60ms via `requestAnimationFrame` throttling.

**Tech Stack:** Expo SDK 54 · llama.rn token-streaming callback · React Native Modal + FlatList · AbortController · InteractionManager

---

## File Map

| File | Role |
|---|---|
| `apps/mobile/services/llm.ts` | *(modify)* Add `streamChatInference()` — reuses persistent context + mutex |
| `apps/mobile/services/chatPrompts.ts` *(new)* | System prompts for both modes + `buildChatPrompt()` + math-solve heuristic + `parseChatChunk()` |
| `apps/mobile/services/chatContext.ts` *(new)* | `buildProgressContext(db, stats)` — DB query for last 5 practice sessions + topic name join |
| `apps/mobile/hooks/useKuyaChat.ts` *(new)* | The hook the modal consumes — owns mode, messages, send, abort, isStreaming |
| `apps/mobile/components/ChatBubble.tsx` *(new)* | Single message bubble — user/assistant variants + streaming cursor + a11y |
| `apps/mobile/components/AskKuyaModal.tsx` *(new)* | Full-screen Modal — header, mode toggle, FlatList, input row, suggested chips, empty state |
| `apps/mobile/components/AiModelBanner.tsx` | *(modify)* Add "💬 Ask" pill; opens AskKuyaModal |
| `apps/mobile/services/__tests__/llm.test.ts` | *(modify)* Add 2 tests for streamChatInference |
| `apps/mobile/services/__tests__/chatPrompts.test.ts` *(new)* | System prompt + builder + math heuristic + parseChatChunk tests |
| `apps/mobile/services/__tests__/chatContext.test.ts` *(new)* | DB layer in-memory tests |
| `apps/mobile/hooks/__tests__/useKuyaChat.test.ts` *(new)* | Hook state + send + abort + mode-lock tests |

---

## Task 1: Add `streamChatInference` to `llm.ts`

**Files:**
- Modify: `apps/mobile/services/llm.ts`
- Modify: `apps/mobile/services/__tests__/llm.test.ts`

- [ ] **Step 1: Append two failing tests to `apps/mobile/services/__tests__/llm.test.ts`**

Inside the existing `describe('inference mutex', ...)` block (or add a new describe at end of file), add:

```ts
describe('streamChatInference', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('fires onToken for each token emitted by the completion callback', async () => {
    const tokens = ['Hello', ' ', 'world', '!']
    const completion = jest.fn().mockImplementation(async (_params, cb) => {
      for (const t of tokens) cb({ token: t })
      return { text: tokens.join('') }
    })
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({
      completion,
      release: jest.fn().mockResolvedValue(undefined),
    })

    const { streamChatInference } = require('../llm')
    const collected: string[] = []
    const controller = new AbortController()
    const final = await streamChatInference('test prompt', (t: string) => collected.push(t), controller.signal)

    expect(collected).toEqual(['Hello', ' ', 'world', '!'])
    expect(final).toBe('Hello world!')
  })

  it('stops emitting tokens after abort signal fires', async () => {
    const completion = jest.fn().mockImplementation(async (_params, cb) => {
      cb({ token: 'first' })
      cb({ token: 'second' })
      // Caller aborts here in the test body via controller.abort()
      cb({ token: 'third' })
      cb({ token: 'fourth' })
      return { text: 'firstsecondthirdfourth' }
    })
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({
      completion,
      release: jest.fn().mockResolvedValue(undefined),
    })

    const { streamChatInference } = require('../llm')
    const controller = new AbortController()
    const collected: string[] = []
    const promise = streamChatInference('p', (t: string) => {
      collected.push(t)
      if (collected.length === 2) controller.abort()
    }, controller.signal)
    await promise

    // Only the first two tokens should have been collected (signal blocks 3rd and 4th)
    expect(collected).toEqual(['first', 'second'])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd apps/mobile && npx jest services/__tests__/llm.test.ts --no-coverage 2>&1 | grep -E "FAIL|Cannot|streamChatInference"`
Expected: failures because `streamChatInference` doesn't exist yet.

- [ ] **Step 3: Add `streamChatInference` to `apps/mobile/services/llm.ts`**

Add this function right after the existing `runCoachInference` (keep all other exports unchanged):

```ts
// ── Chat streaming inference (used by useKuyaChat) ───────────────────────────

export async function streamChatInference(
  prompt: string,
  onToken: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  return withMutex(async () => {
    if (signal.aborted) return ''
    const ctx = await getContext()
    lastUsedAt = Date.now()
    let collected = ''
    try {
      const result = await ctx.completion(
        {
          prompt,
          n_predict: 250,
          temperature: 0.5,
          top_p: 0.9,
          stop: ['<|im_end|>', '</s>', '<|im_start|>'],
        },
        (tokenData: { token?: string }) => {
          if (signal.aborted) return
          const text = tokenData.token ?? ''
          collected += text
          onToken(text)
        },
      )
      lastUsedAt = Date.now()
      return collected || result.text || ''
    } catch (err) {
      // Native errors may corrupt context — release so next call re-inits
      await releaseContext()
      throw err
    }
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd apps/mobile && npx jest services/__tests__/llm.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|Tests:"`
Expected: `PASS` · `Tests: 28 passed` (was 26, +2 new).

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/services/llm.ts apps/mobile/services/__tests__/llm.test.ts
git commit -m "feat(llm): add streamChatInference with abort + token callback"
```

---

## Task 2: Chat Prompts + Math Heuristic + Chunk Parser

**Files:**
- Create: `apps/mobile/services/chatPrompts.ts`
- Create: `apps/mobile/services/__tests__/chatPrompts.test.ts`

- [ ] **Step 1: Write failing tests in `apps/mobile/services/__tests__/chatPrompts.test.ts`**

```ts
import {
  buildChatPrompt, detectMathSolveRequest, parseChatChunk,
  type ChatMode,
} from '../chatPrompts'

describe('detectMathSolveRequest', () => {
  it('returns true for "solve" / "simplify" / "evaluate" / "compute" / "calculate"', () => {
    expect(detectMathSolveRequest('solve 2x + 3 = 7')).toBe(true)
    expect(detectMathSolveRequest('Please simplify this expression')).toBe(true)
    expect(detectMathSolveRequest('Evaluate the limit')).toBe(true)
    expect(detectMathSolveRequest('Compute the sum')).toBe(true)
    expect(detectMathSolveRequest('Calculate the area')).toBe(true)
  })

  it('returns true for "find x" patterns', () => {
    expect(detectMathSolveRequest('find x in this equation')).toBe(true)
  })

  it('returns true for "= ?" patterns', () => {
    expect(detectMathSolveRequest('what is 2 + 2 = ?')).toBe(true)
  })

  it('returns false for conceptual questions', () => {
    expect(detectMathSolveRequest('What is photosynthesis?')).toBe(false)
    expect(detectMathSolveRequest('Explain Newton\'s third law')).toBe(false)
    expect(detectMathSolveRequest('Anong ibig sabihin ng metaphor?')).toBe(false)
    expect(detectMathSolveRequest('How do I prepare for the exam?')).toBe(false)
  })
})

describe('buildChatPrompt', () => {
  it('includes ChatML envelope (system + user + assistant)', () => {
    const prompt = buildChatPrompt('topic', 'What is photosynthesis?')
    expect(prompt).toContain('<|im_start|>system')
    expect(prompt).toContain('<|im_end|>')
    expect(prompt).toContain('<|im_start|>user')
    expect(prompt).toContain('<|im_start|>assistant')
  })

  it('progress mode includes the data context block', () => {
    const ctx = 'Focused exam: UPCAT 2026 in 30 days\nStreak: 5 days'
    const prompt = buildChatPrompt('progress', 'How am I doing?', ctx)
    expect(prompt).toContain('Focused exam: UPCAT 2026')
    expect(prompt).toContain('Streak: 5 days')
    expect(prompt).toContain('How am I doing?')
  })

  it('progress mode handles missing data context gracefully', () => {
    const prompt = buildChatPrompt('progress', 'How am I doing?')
    expect(prompt).not.toContain('undefined')
    expect(prompt).not.toContain('null')
  })

  it('topic mode does NOT include data context', () => {
    const prompt = buildChatPrompt('topic', 'What is photosynthesis?')
    expect(prompt).not.toContain('STUDENT CONTEXT')
    expect(prompt).not.toContain('Focused exam')
  })

  it('topic mode prepends refuse-note when math-solve detected', () => {
    const prompt = buildChatPrompt('topic', 'solve 2x + 3 = 7')
    expect(prompt).toContain('refuse to solve')
  })

  it('topic mode skips refuse-note for conceptual questions', () => {
    const prompt = buildChatPrompt('topic', 'What is the quadratic formula?')
    expect(prompt).not.toContain('refuse to solve')
  })

  it('system prompts mention Kuya Baw and Taglish', () => {
    const progress = buildChatPrompt('progress', 'q', 'ctx')
    const topic = buildChatPrompt('topic', 'q')
    expect(progress).toContain('Kuya Baw')
    expect(progress).toContain('Taglish')
    expect(topic).toContain('Kuya Baw')
    expect(topic).toContain('Taglish')
  })

  it('topic system prompt contains the math refusal rule', () => {
    const prompt = buildChatPrompt('topic', 'q')
    expect(prompt).toContain('DO NOT solve')
    expect(prompt).toContain('Subukan mo muna')
  })
})

describe('parseChatChunk', () => {
  it('returns the input unchanged for normal text', () => {
    expect(parseChatChunk('Tara mag-review tayo!')).toBe('Tara mag-review tayo!')
  })

  it('strips ChatML im_start / im_end markers', () => {
    expect(parseChatChunk('Hello <|im_end|>')).toBe('Hello ')
    expect(parseChatChunk('<|im_start|>assistant\nText')).toBe('assistant\nText')
  })

  it('strips other <|...|> token markers defensively', () => {
    expect(parseChatChunk('Text <|special|> more')).toBe('Text  more')
  })

  it('returns empty string for empty input', () => {
    expect(parseChatChunk('')).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd apps/mobile && npx jest services/__tests__/chatPrompts.test.ts --no-coverage 2>&1 | grep -E "FAIL|Cannot"`
Expected: FAIL with "Cannot find module '../chatPrompts'".

- [ ] **Step 3: Create `apps/mobile/services/chatPrompts.ts`**

```ts
export type ChatMode = 'progress' | 'topic'

const SYSTEM_PROMPT_PROGRESS =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Answer the student's question using ONLY the ` +
  `context block below. If the answer isn't in the context, say "Wala pa ` +
  `akong info diyan, sorry!" — never make up stats. Keep answers under 3 ` +
  `short sentences. End with one specific action they can take today.`

const SYSTEM_PROMPT_TOPIC =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Explain concepts clearly with one short example.\n\n` +
  `IMPORTANT RULES:\n` +
  `- If the student asks you to SOLVE a math problem, DO NOT solve it. ` +
  `Instead say "Subukan mo muna! Pero here's the concept:" then explain ` +
  `the relevant formula or approach.\n` +
  `- If you don't know the answer, say "Hindi ko sure 'to, baka mas okay ` +
  `i-check sa textbook." Never make up facts.\n` +
  `- Keep answers under 4 sentences. One concrete example if helpful.`

const MATH_SOLVE_PATTERNS = [
  /\bsolve\b/i,
  /\bsimplify\b/i,
  /\bevaluate\b/i,
  /\bcompute\b/i,
  /\bcalculate\b/i,
  /\bfind\s+x\b/i,
  /=\s*\?/,
]

export function detectMathSolveRequest(text: string): boolean {
  return MATH_SOLVE_PATTERNS.some(p => p.test(text))
}

export function buildChatPrompt(
  mode: ChatMode,
  question: string,
  dataContext?: string,
): string {
  let systemPrompt: string
  let userMessage: string

  if (mode === 'progress') {
    systemPrompt = SYSTEM_PROMPT_PROGRESS
    const ctx = dataContext && dataContext.length > 0
      ? dataContext
      : '(no stats available yet)'
    userMessage = `[STUDENT CONTEXT]\n${ctx}\n\n[QUESTION]\n${question}`
  } else {
    systemPrompt = SYSTEM_PROMPT_TOPIC
    const prefix = detectMathSolveRequest(question)
      ? '(Note: refuse to solve, only explain.) '
      : ''
    userMessage = `[QUESTION]\n${prefix}${question}`
  }

  return (
    `<|im_start|>system\n${systemPrompt}<|im_end|>\n` +
    `<|im_start|>user\n${userMessage}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  )
}

/** Strips ChatML token markers from streaming text chunks. */
export function parseChatChunk(text: string): string {
  return text.replace(/<\|[^|]*\|>/g, '')
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd apps/mobile && npx jest services/__tests__/chatPrompts.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|Tests:"`
Expected: `PASS` · `Tests: 17 passed` (5 detectMathSolveRequest + 8 buildChatPrompt + 4 parseChatChunk).

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/services/chatPrompts.ts apps/mobile/services/__tests__/chatPrompts.test.ts
git commit -m "feat(chat): add chat prompts, math-solve heuristic, and chunk parser"
```

---

## Task 3: Progress Context Builder (DB layer)

**Files:**
- Create: `apps/mobile/services/chatContext.ts`
- Create: `apps/mobile/services/__tests__/chatContext.test.ts`

- [ ] **Step 1: Write failing tests in `apps/mobile/services/__tests__/chatContext.test.ts`**

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import type { HomeStats } from '../../hooks/useHomeStats'
import { buildProgressContext } from '../chatContext'

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE topics (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE practice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      listing_slug TEXT NOT NULL DEFAULT '',
      topic_id TEXT NOT NULL DEFAULT '',
      deck_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      duration_secs INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER NOT NULL
    );
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

const STATS_BASE: HomeStats = {
  listing: { title: 'UPCAT 2026', examDate: Date.now() + 30 * 86400000 },
  daysLeft: 30,
  todayAccuracy: 75,
  streakDays: 5,
  weakTopics: [
    { topicId: 't1', topicName: 'Algebra', accuracy: 32 },
    { topicId: 't2', topicName: 'Biology', accuracy: 45 },
  ],
  firstTopicId: 't1',
  fullName: 'Juan',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
}

describe('buildProgressContext', () => {
  it('returns "no focused exam" message when listing is null', async () => {
    const db = makeDb()
    const stats: HomeStats = { ...STATS_BASE, listing: null }
    const out = await buildProgressContext(db, stats)
    expect(out).toContain('No focused exam')
  })

  it('includes listing title, days left, streak, and accuracy', async () => {
    const db = makeDb()
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('UPCAT 2026')
    expect(out).toContain('30 days')
    expect(out).toContain('Streak: 5 days')
    expect(out).toContain("Today's accuracy: 75%")
  })

  it('lists top 3 weak topics with accuracy percentages', async () => {
    const db = makeDb()
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('Algebra (32%)')
    expect(out).toContain('Biology (45%)')
  })

  it('emits "none yet" when weakTopics is empty', async () => {
    const db = makeDb()
    const stats: HomeStats = { ...STATS_BASE, weakTopics: [] }
    const out = await buildProgressContext(db, stats)
    expect(out).toContain('Top weak topics: none yet')
  })

  it('includes recent practice sessions joined with topic names, ordered most-recent-first', async () => {
    const db = makeDb()
    const now = Date.now()
    await db.insert(schema.topics).values([
      { id: 't1', name: 'Algebra', subjectId: 'math', status: 'active' },
      { id: 't2', name: 'Biology', subjectId: 'sci', status: 'active' },
    ])
    await db.insert(schema.practiceSessions).values([
      { topicId: 't1', score: 7, total: 10, completedAt: now - 1000 },
      { topicId: 't2', score: 8, total: 10, completedAt: now - 2000 },
    ])
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('Algebra — 7/10')
    expect(out).toContain('Biology — 8/10')
  })

  it('emits "(no recent sessions)" when practice_sessions is empty', async () => {
    const db = makeDb()
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('(no recent sessions)')
  })

  it('handles sessions whose topic was deleted (falls back to "mixed practice")', async () => {
    const db = makeDb()
    await db.insert(schema.practiceSessions).values([
      { topicId: 'ghost-topic-id', score: 5, total: 10, completedAt: Date.now() },
    ])
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('mixed practice')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd apps/mobile && npx jest services/__tests__/chatContext.test.ts --no-coverage 2>&1 | grep -E "FAIL|Cannot"`
Expected: FAIL with "Cannot find module '../chatContext'".

- [ ] **Step 3: Create `apps/mobile/services/chatContext.ts`**

```ts
import { desc } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import type { HomeStats } from '../hooks/useHomeStats'
import { practiceSessions, topics } from '../db/schema'

/**
 * Builds a prompt-ready progress context string from the user's HomeStats
 * plus their 5 most recent practice sessions (with topic names joined).
 * Used in "My progress" chat mode.
 */
export async function buildProgressContext(
  db: DrizzleClient,
  stats: HomeStats,
): Promise<string> {
  if (!stats.listing) return 'No focused exam yet. Pick one from Listings to get personalized advice.'

  const sessions = await db
    .select({
      completedAt: practiceSessions.completedAt,
      score: practiceSessions.score,
      total: practiceSessions.total,
      topicId: practiceSessions.topicId,
    })
    .from(practiceSessions)
    .orderBy(desc(practiceSessions.completedAt))
    .limit(5)

  // Build topic-id -> name lookup. Only query if we have sessions with topic IDs.
  const sessionTopicIds = sessions
    .map(s => s.topicId)
    .filter(t => t.length > 0)

  let topicMap = new Map<string, string>()
  if (sessionTopicIds.length > 0) {
    const allTopics = await db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
    topicMap = new Map(allTopics.map(t => [t.id, t.name]))
  }

  const weakLine = stats.weakTopics.length > 0
    ? stats.weakTopics.slice(0, 3).map(t => `${t.topicName} (${t.accuracy}%)`).join(', ')
    : 'none yet'

  const sessionLines = sessions.length > 0
    ? sessions.map(s => {
        const dateStr = new Date(s.completedAt).toLocaleDateString('en-PH', {
          month: 'short',
          day: 'numeric',
        })
        const topicName = topicMap.get(s.topicId) ?? 'mixed practice'
        return `  - ${dateStr}: ${topicName} — ${s.score}/${s.total}`
      }).join('\n')
    : '  (no recent sessions)'

  return [
    `Focused exam: ${stats.listing.title} in ${stats.daysLeft ?? '?'} days`,
    `Streak: ${stats.streakDays} days`,
    `Today's accuracy: ${stats.todayAccuracy ?? 'n/a'}%`,
    `Top weak topics: ${weakLine}`,
    'Recent sessions (last 5):',
    sessionLines,
  ].join('\n')
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd apps/mobile && npx jest services/__tests__/chatContext.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|Tests:"`
Expected: `PASS` · `Tests: 7 passed`.

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/services/chatContext.ts apps/mobile/services/__tests__/chatContext.test.ts
git commit -m "feat(chat): add buildProgressContext for My-progress mode prompts"
```

---

## Task 4: `useKuyaChat` Hook

**Files:**
- Create: `apps/mobile/hooks/useKuyaChat.ts`
- Create: `apps/mobile/hooks/__tests__/useKuyaChat.test.ts`

- [ ] **Step 1: Write failing tests in `apps/mobile/hooks/__tests__/useKuyaChat.test.ts`**

```ts
import { renderHook, act } from '@testing-library/react-native'

jest.mock('../useDb', () => ({
  useDb: () => ({}),
}))

jest.mock('../useHomeStats', () => ({
  useHomeStats: () => ({
    listing: null,
    daysLeft: null,
    todayAccuracy: null,
    streakDays: 0,
    weakTopics: [],
    firstTopicId: null,
    fullName: '',
    importantDayIndices: [],
    practiceDayIndices: [],
    focusedListings: [],
  }),
}))

jest.mock('../../services/llm', () => ({
  modelExists: jest.fn().mockResolvedValue(true),
  streamChatInference: jest.fn(),
}))

jest.mock('../../services/chatContext', () => ({
  buildProgressContext: jest.fn().mockResolvedValue('ctx'),
}))

import { useKuyaChat } from '../useKuyaChat'
import { streamChatInference, modelExists } from '../../services/llm'

const mockStream = streamChatInference as jest.MockedFunction<typeof streamChatInference>
const mockModelExists = modelExists as jest.MockedFunction<typeof modelExists>

describe('useKuyaChat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockModelExists.mockResolvedValue(true)
  })

  it('initializes with empty messages, progress mode, and not streaming', async () => {
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    expect(result.current.messages).toEqual([])
    expect(result.current.mode).toBe('progress')
    expect(result.current.isStreaming).toBe(false)
  })

  it('sets isModelReady true when modelExists resolves true', async () => {
    mockModelExists.mockResolvedValue(true)
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    expect(result.current.isModelReady).toBe(true)
  })

  it('sets isModelReady false when modelExists resolves false', async () => {
    mockModelExists.mockResolvedValue(false)
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    expect(result.current.isModelReady).toBe(false)
  })

  it('send pushes a user message and an assistant placeholder', async () => {
    mockStream.mockImplementation(async () => 'response')
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => { result.current.send('hello'); await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.messages.length).toBeGreaterThanOrEqual(2)
    expect(result.current.messages[0]!.role).toBe('user')
    expect(result.current.messages[0]!.text).toBe('hello')
    expect(result.current.messages[1]!.role).toBe('assistant')
  })

  it('send is a no-op when text is empty or whitespace', async () => {
    mockStream.mockImplementation(async () => 'r')
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    await act(async () => { result.current.send('   ') })
    expect(result.current.messages.length).toBe(0)
    expect(mockStream).not.toHaveBeenCalled()
  })

  it('setMode changes the mode when not streaming', async () => {
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    act(() => { result.current.setMode('topic') })
    expect(result.current.mode).toBe('topic')
  })

  it('abort can be called safely when nothing is streaming', async () => {
    const { result } = renderHook(() => useKuyaChat())
    await act(async () => {})
    expect(() => result.current.abort()).not.toThrow()
    expect(result.current.isStreaming).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd apps/mobile && npx jest hooks/__tests__/useKuyaChat.test.ts --no-coverage 2>&1 | grep -E "FAIL|Cannot"`
Expected: FAIL with "Cannot find module '../useKuyaChat'".

- [ ] **Step 3: Create `apps/mobile/hooks/useKuyaChat.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, InteractionManager } from 'react-native'
import { useDb } from './useDb'
import { useHomeStats } from './useHomeStats'
import { streamChatInference, modelExists } from '../services/llm'
import {
  buildChatPrompt, parseChatChunk,
  type ChatMode,
} from '../services/chatPrompts'
import { buildProgressContext } from '../services/chatContext'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  isStreaming?: boolean
  error?: string
}

interface UseKuyaChat {
  mode: ChatMode
  setMode: (mode: ChatMode) => void
  messages: ChatMessage[]
  send: (text: string) => void
  abort: () => void
  isStreaming: boolean
  isModelReady: boolean
}

const FLUSH_INTERVAL_MS = 60

export function useKuyaChat(): UseKuyaChat {
  const db = useDb()
  const stats = useHomeStats()
  const [mode, setModeState] = useState<ChatMode>('progress')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isModelReady, setIsModelReady] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const bufferRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const assistantIdRef = useRef<string | null>(null)

  // Check model availability on mount
  useEffect(() => {
    isMountedRef.current = true
    void modelExists().then(exists => {
      if (isMountedRef.current) setIsModelReady(exists)
    })
    return () => {
      isMountedRef.current = false
      abortRef.current?.abort()
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [])

  // AppState-aware abort
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        abortRef.current?.abort()
      }
    })
    return () => sub.remove()
  }, [])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      const chunk = bufferRef.current
      bufferRef.current = ''
      const id = assistantIdRef.current
      if (!chunk || !id || !isMountedRef.current) return
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, text: m.text + chunk } : m
      ))
    }, FLUSH_INTERVAL_MS)
  }, [])

  const send = useCallback((text: string) => {
    if (isStreaming) return
    const trimmed = text.trim()
    if (!trimmed) return

    const now = Date.now()
    const userMsg: ChatMessage = {
      id: `u-${now}`,
      role: 'user',
      text: trimmed,
      timestamp: now,
    }
    const assistantId = `a-${now}`
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      timestamp: now,
      isStreaming: true,
    }
    assistantIdRef.current = assistantId
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const dataCtx = mode === 'progress'
            ? await buildProgressContext(db, stats)
            : undefined
          const prompt = buildChatPrompt(mode, trimmed, dataCtx)

          await streamChatInference(prompt, (tokenText) => {
            if (controller.signal.aborted) return
            bufferRef.current += parseChatChunk(tokenText)
            scheduleFlush()
          }, controller.signal)

          // Final flush
          if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
          const finalChunk = bufferRef.current
          bufferRef.current = ''

          if (!isMountedRef.current) return
          setMessages(prev => prev.map(m => {
            if (m.id !== assistantId) return m
            const finalText = (m.text + finalChunk).trim()
            if (finalText.length === 0) {
              return {
                ...m,
                isStreaming: false,
                text: 'Hmm, hindi ko ma-process yan. Try mong i-rephrase!',
              }
            }
            return { ...m, text: m.text + finalChunk, isStreaming: false }
          }))
          setIsStreaming(false)
        } catch (err) {
          if (!isMountedRef.current) return
          console.warn('[useKuyaChat] streamChatInference failed:', err)
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: "Kuya Baw can't answer right now. Try again sa moment." }
              : m
          ))
          setIsStreaming(false)
        }
      })()
    })
  }, [isStreaming, mode, db, stats, scheduleFlush])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = null
    const finalChunk = bufferRef.current
    bufferRef.current = ''
    const id = assistantIdRef.current
    if (id && isMountedRef.current) {
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, text: m.text + finalChunk, isStreaming: false } : m
      ))
    }
    setIsStreaming(false)
  }, [])

  const setMode = useCallback((next: ChatMode) => {
    if (isStreaming) return  // lock during streaming
    setModeState(next)
  }, [isStreaming])

  return { mode, setMode, messages, send, abort, isStreaming, isModelReady }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd apps/mobile && npx jest hooks/__tests__/useKuyaChat.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|Tests:"`
Expected: `PASS` · `Tests: 7 passed`.

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/hooks/useKuyaChat.ts apps/mobile/hooks/__tests__/useKuyaChat.test.ts
git commit -m "feat(chat): add useKuyaChat hook with streaming + abort + mode lock"
```

---

## Task 5: `ChatBubble` Component

**Files:**
- Create: `apps/mobile/components/ChatBubble.tsx`

This is a presentational component with no business logic — no separate test file (it's exercised via the modal's manual UX validation).

- [ ] **Step 1: Create `apps/mobile/components/ChatBubble.tsx`**

```tsx
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeContext'
import type { ChatMessage } from '../hooks/useKuyaChat'

interface Props {
  message: ChatMessage
}

export function ChatBubble({ message }: Props) {
  const { theme: t, typo } = useTheme()
  const isUser = message.role === 'user'

  const s = useMemo(() => StyleSheet.create({
    container: { marginVertical: 6 },
    labelRow: { paddingHorizontal: 4, marginBottom: 2 },
    labelRowUser: { alignItems: 'flex-end' },
    labelRowAssistant: { alignItems: 'flex-start' },
    label: {
      fontFamily: 'Lexend_500Medium',
      fontSize: 11,
      color: t.textTertiary,
    },
    row: { flexDirection: 'row' },
    rowUser: { justifyContent: 'flex-end' },
    rowAssistant: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '82%', padding: 12, borderRadius: 14 },
    bubbleUser: {
      backgroundColor: t.accent,
      borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
      backgroundColor: t.surface,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: t.border,
    },
    text: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      lineHeight: 20,
    },
    textUser: { color: '#fff' },
    textAssistant: { color: t.textPrimary },
    cursor: { color: t.textSecondary },
    error: {
      color: '#ef4444',
      marginTop: 4,
      fontSize: typo.xs,
      fontFamily: 'Lexend_400Regular',
    },
  }), [t, typo])

  const timeStr = new Date(message.timestamp).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <View style={s.container}>
      <View style={[s.labelRow, isUser ? s.labelRowUser : s.labelRowAssistant]}>
        <Text style={s.label}>{isUser ? `you · ${timeStr}` : `Kuya Baw · ${timeStr}`}</Text>
      </View>
      <View style={[s.row, isUser ? s.rowUser : s.rowAssistant]}>
        <View
          style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAssistant]}
          accessibilityRole="text"
          accessibilityLiveRegion={message.isStreaming ? 'polite' : 'none'}
        >
          <Text style={[s.text, isUser ? s.textUser : s.textAssistant]}>
            {message.text}
            {message.isStreaming && <Text style={s.cursor}>▍</Text>}
          </Text>
          {message.error && <Text style={s.error}>{message.error}</Text>}
        </View>
      </View>
    </View>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep "ChatBubble"`
Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add apps/mobile/components/ChatBubble.tsx
git commit -m "feat(chat): add ChatBubble presentational component"
```

---

## Task 6: `AskKuyaModal` Component

**Files:**
- Create: `apps/mobile/components/AskKuyaModal.tsx`

Full-screen modal containing the chat thread, mode toggle, suggestions, and input row. The hook is mounted INSIDE the modal (not at parent) so a conditional inner-render gives clean state per open.

- [ ] **Step 1: Create `apps/mobile/components/AskKuyaModal.tsx`**

```tsx
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import { useTheme } from '../theme/ThemeContext'
import { useKuyaChat, type ChatMessage } from '../hooks/useKuyaChat'
import { ChatBubble } from './ChatBubble'
import type { ChatMode } from '../services/chatPrompts'

interface Props {
  visible: boolean
  onClose: () => void
}

const SUGGESTIONS: Record<ChatMode, string[]> = {
  progress: [
    'How am I doing this week?',
    'Anong dapat kong i-focus today?',
    'Am I on track for the exam?',
  ],
  topic: [
    'Ano ang photosynthesis?',
    "Explain Newton's 3rd law",
    'What is a topic sentence?',
  ],
}

export function AskKuyaModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      {visible && <AskKuyaModalInner onClose={onClose} />}
    </Modal>
  )
}

function AskKuyaModalInner({ onClose }: { onClose: () => void }) {
  const { theme: t, typo } = useTheme()
  const { mode, setMode, messages, send, abort, isStreaming } = useKuyaChat()
  const [input, setInput] = useState('')
  const listRef = useRef<FlatList<ChatMessage>>(null)

  const onSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    send(text)
    setInput('')
  }, [input, isStreaming, send])

  const onSendOrStop = useCallback(() => {
    if (isStreaming) abort()
    else onSend()
  }, [isStreaming, abort, onSend])

  const onClosePressed = useCallback(() => {
    abort()
    onClose()
  }, [abort, onClose])

  const onSuggestionTap = useCallback((text: string) => {
    setInput(text)
  }, [])

  // Auto-scroll to bottom on new message / token batch
  const onContentSizeChange = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true })
  }, [])

  const s = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    headerAvatar: { width: 32, height: 32, marginRight: 10 },
    headerTitle: {
      flex: 1,
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.md,
      color: t.textPrimary,
    },
    closeBtn: { padding: 6 },
    closeBtnText: { fontSize: 20, color: t.textSecondary },
    toggleRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: t.surfaceSubtle,
    },
    togglePill: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
    },
    togglePillActive: {
      backgroundColor: t.accent,
      borderColor: t.accent,
    },
    togglePillDisabled: { opacity: 0.5 },
    togglePillText: {
      fontFamily: 'Lexend_500Medium',
      fontSize: typo.xs,
      color: t.textSecondary,
    },
    togglePillTextActive: { color: '#fff' },
    list: { flex: 1, paddingHorizontal: 12 },
    listContent: { paddingVertical: 12 },
    emptyState: {
      paddingHorizontal: 24,
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyMascot: { width: 72, height: 72, marginBottom: 12 },
    emptyText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textSecondary,
      textAlign: 'center',
      marginBottom: 20,
    },
    suggestRow: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 8,
    },
    suggestLabel: {
      fontFamily: 'Lexend_500Medium',
      fontSize: 11,
      color: t.textTertiary,
      marginBottom: 4,
    },
    suggestChip: {
      backgroundColor: t.surfaceSubtle,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      alignSelf: 'flex-start',
      marginRight: 6,
      marginBottom: 6,
    },
    suggestChipText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: t.textSecondary,
    },
    suggestChipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: t.border,
      gap: 8,
    },
    input: {
      flex: 1,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textPrimary,
      maxHeight: 100,
    },
    sendBtn: {
      backgroundColor: t.accent,
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: t.border },
    sendBtnText: { color: '#fff', fontSize: 20, fontFamily: 'Outfit_700Bold' },
  }), [t, typo])

  const showSuggestions = input.length === 0 && !isStreaming
  const sendDisabled = input.trim().length === 0 && !isStreaming

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={s.header}>
        <Image
          source={require('../assets/images/kuya-baw-mascot.png')}
          style={s.headerAvatar}
          resizeMode="contain"
        />
        <Text style={s.headerTitle}>Kuya Baw</Text>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={onClosePressed}
          accessibilityRole="button"
          accessibilityLabel="Close chat"
        >
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Mode toggle */}
      <View style={s.toggleRow}>
        {(['progress', 'topic'] as const).map(m => {
          const active = mode === m
          const disabled = isStreaming && !active
          return (
            <Pressable
              key={m}
              style={[
                s.togglePill,
                active && s.togglePillActive,
                disabled && s.togglePillDisabled,
              ]}
              onPress={() => setMode(m)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={m === 'progress' ? 'My progress mode' : 'A topic mode'}
            >
              <Text style={[s.togglePillText, active && s.togglePillTextActive]}>
                {m === 'progress' ? 'My progress' : 'A topic'}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        style={s.list}
        contentContainerStyle={s.listContent}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        onContentSizeChange={onContentSizeChange}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Image
              source={require('../assets/images/kuya-baw-mascot.png')}
              style={s.emptyMascot}
              resizeMode="contain"
            />
            <Text style={s.emptyText}>
              Hi! Ask me about your progress or any UPCAT topic.
            </Text>
          </View>
        }
      />

      {/* Suggestions */}
      {showSuggestions && (
        <View style={s.suggestRow}>
          <Text style={s.suggestLabel}>💡 Try asking:</Text>
          <View style={s.suggestChipsWrap}>
            {SUGGESTIONS[mode].map(text => (
              <Pressable
                key={text}
                style={s.suggestChip}
                onPress={() => onSuggestionTap(text)}
                accessibilityRole="button"
                accessibilityLabel={`Use suggestion: ${text}`}
              >
                <Text style={s.suggestChipText}>{text}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Input */}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Tanong mo kay Kuya..."
          placeholderTextColor={t.textTertiary}
          multiline
          returnKeyType="send"
          onSubmitEditing={onSend}
          editable={!isStreaming}
          accessibilityLabel="Question input"
        />
        <Pressable
          style={[s.sendBtn, sendDisabled && s.sendBtnDisabled]}
          onPress={onSendOrStop}
          disabled={sendDisabled}
          accessibilityRole="button"
          accessibilityLabel={isStreaming ? 'Stop generating' : 'Send question'}
        >
          <Text style={s.sendBtnText}>{isStreaming ? '■' : '→'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep "AskKuyaModal"`
Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add apps/mobile/components/AskKuyaModal.tsx
git commit -m "feat(chat): add AskKuyaModal full-screen chat UI"
```

---

## Task 7: Add "Ask" Pill to `AiModelBanner`

**Files:**
- Modify: `apps/mobile/components/AiModelBanner.tsx`
- Modify: `apps/mobile/app/(tabs)/__tests__/home.test.tsx` (if test breaks)

Add a "💬 Ask" pill alongside the existing "AI Coach" badge on the Kuya card. Tapping opens the `AskKuyaModal`. The pill is disabled (and shows a toast / Alert) when the model isn't downloaded yet.

- [ ] **Step 1: Read the current `AiModelBanner.tsx` to locate the Kuya card layout**

Run: `cd apps/mobile && grep -n "AI Coach\|kuyaBadge\|kuyaNameRow" components/AiModelBanner.tsx`
Expected: identify the row that renders the existing "AI Coach" badge — the new "Ask" pill goes immediately next to it.

- [ ] **Step 2: Modify `apps/mobile/components/AiModelBanner.tsx`**

Add `useState` for the modal, an `Alert` import, the import of `AskKuyaModal`, the pill JSX next to the badge, the modal render at the end of the component return, and the styles. The diff in concrete terms:

**a) Add imports** at the top of the file:

```ts
import { useState } from 'react'  // ensure useState is imported (probably already is)
import { Alert } from 'react-native'  // add Alert to existing react-native import
import { AskKuyaModal } from './AskKuyaModal'
import { router } from 'expo-router'  // add only if not already imported
```

**b) Inside the component**, add state for the modal:

```ts
const [chatVisible, setChatVisible] = useState(false)
```

**c) Add an `onAskPress` handler** that gates on `modelStatus`:

```ts
const onAskPress = () => {
  if (modelStatus === 'ready') {
    setChatVisible(true)
  } else {
    Alert.alert(
      'Install AI Reviewer first',
      'Tap "Get it" to download the AI Reviewer engine.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Get it', onPress: () => router.push('/(tabs)/practice') },
      ],
    )
  }
}
```

**d) Add the pill JSX** inside the Kuya card row that contains the "AI Coach" badge. Search for the existing `<View style={s.kuyaBadge}>` block — add the new Pressable immediately AFTER it within the same row:

```tsx
<Pressable
  style={[s.askPill, modelStatus !== 'ready' && s.askPillDisabled]}
  onPress={onAskPress}
  accessibilityRole="button"
  accessibilityLabel={modelStatus === 'ready' ? 'Ask Kuya Baw' : 'Ask Kuya Baw — download AI first'}
>
  <Text style={s.askPillText}>💬 Ask</Text>
</Pressable>
```

If `Pressable` is not yet in the file's react-native imports, add it.

**e) Render the modal** at the end of the component's returned JSX (just before the final closing fragment / wrapping view):

```tsx
<AskKuyaModal visible={chatVisible} onClose={() => setChatVisible(false)} />
```

**f) Add the styles** to the file's existing `StyleSheet.create({...})` object (do not delete other styles):

```ts
askPill: {
  marginLeft: 8,
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderRadius: 999,
  backgroundColor: t.surface,
  borderWidth: 1,
  borderColor: t.border,
},
askPillDisabled: { opacity: 0.5 },
askPillText: {
  fontFamily: 'Lexend_500Medium',
  fontSize: 11,
  color: t.textSecondary,
},
```

- [ ] **Step 3: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -E "AiModelBanner|AskKuyaModal"`
Expected: no output.

- [ ] **Step 4: Run mobile test suite to verify no regressions**

Run: `cd apps/mobile && npx jest --no-coverage 2>&1 | tail -5`
Expected: same pre-existing failure count as before (3 baseline failures unrelated to coach/chat). No NEW failures.

- [ ] **Step 5: If `home.test.tsx` breaks because the AI Coach card got an extra child, update its mocks/assertions**

If the home test fails because of the new pill or the modal mount, the simplest fix is to mock `AskKuyaModal` to render `null`:

```ts
jest.mock('../../components/AskKuyaModal', () => ({
  AskKuyaModal: () => null,
}))
```

Add this mock alongside the existing mocks at the top of `apps/mobile/app/(tabs)/__tests__/home.test.tsx`. Then re-run the test:

```powershell
cd apps/mobile; npx jest app/\(tabs\)/__tests__/home.test.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/mobile/components/AiModelBanner.tsx
# If you modified the home test:
git add apps/mobile/app/\(tabs\)/__tests__/home.test.tsx
git commit -m "feat(chat): add Ask pill to AiModelBanner + mount AskKuyaModal"
```

---

## Self-Review Checklist

- [x] **Spec §1 (Surface & entry point)**: Task 7 adds the "Ask" pill to `AiModelBanner`, gated on `modelStatus === 'ready'`, with the Alert-based fallback for the disabled state.
- [x] **Spec §2 (Modal layout)**: Task 6 implements header + segmented toggle + FlatList of bubbles + suggestion chips + input row + empty state, with `KeyboardAvoidingView` and `accessibilityLiveRegion` on the streaming bubble (via Task 5).
- [x] **Spec §3 (Architecture & data flow)**: Task 1 (streamChatInference reuses persistent context + mutex), Task 4 (useKuyaChat owns thread state, single-turn semantics, RAF-batched flush, abort on close).
- [x] **Spec §4 (Modes & system prompts)**: Task 2 implements both system prompts verbatim from spec, math-solve regex heuristic, ChatML envelope, and `parseChatChunk` defensive filter.
- [x] **Spec §5 (Performance & failure modes)**:
   - Persistent context + mutex (Task 1 reuses existing infra)
   - InteractionManager-wrapped send (Task 4 hook)
   - 60ms RAF throttle (Task 4 `scheduleFlush`)
   - AppState abort (Task 4 useEffect)
   - Native error catches + releaseContext (Task 1 try/catch)
   - Empty output detection (Task 4 send → final flush check)
   - Model-not-downloaded gating (Task 7 alert)
- [x] **Spec §6 (File layout)**: All 5 new files + 2 modified files map to Tasks 1-7. Test files all included.
- [x] **Spec §7 (Out of scope)**: No multi-turn memory, no SQLite persistence, no subject picker, no voice — verified absent from all tasks.
- [x] **Type consistency**: `ChatMode` defined in Task 2 (`chatPrompts.ts`), imported unchanged in Tasks 4, 6. `ChatMessage` defined in Task 4 (`useKuyaChat.ts`), imported in Tasks 5, 6. `streamChatInference` signature (`prompt, onToken, signal`) matches across Tasks 1 and 4. `buildChatPrompt(mode, question, dataCtx?)` signature matches across Tasks 2 and 4. `buildProgressContext(db, stats)` signature matches across Tasks 3 and 4.
- [x] **No placeholders**: Every code step contains complete runnable code. No "TBD", no "add error handling", no "similar to Task N".
