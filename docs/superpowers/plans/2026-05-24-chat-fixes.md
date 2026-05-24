# Chat Fixes (PR 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five bundled JS-only fixes to the Ask Kuya chat — user-profile context, LLM-driven math confidence, Tagalog second-person enforcement, segmented tab UI, single-row horizontal-scrolling suggestions.

**Architecture:** Service-layer changes in `chatContext` (new SQLite query for user identity) and `chatPrompts` (delete regex heuristic, rewrite topic system prompt). Hook layer (`useKuyaChat`) gains one new call. UI (`AskKuyaModal`) replaces a chip-row with a tab strip and a wrap-row with a horizontal `ScrollView`. All-in-one OTA push since no native modules change.

**Tech Stack:** TypeScript strict, expo-router 6, Drizzle ORM + expo-sqlite, Jest with better-sqlite3 (in-memory schema for service tests), React Native 0.81 / Expo SDK 54.

**Spec:** `docs/superpowers/specs/2026-05-24-chat-fixes-design.md`

---

## File Structure

**Modified service / hook / UI files (4):**
- `apps/mobile/services/chatContext.ts` — Adds `loadStudentIdentity(db)` and `buildTopicContext(db)`. Prepends identity line to `buildProgressContext` output.
- `apps/mobile/services/chatPrompts.ts` — Deletes the math regex heuristic. Rewrites topic system prompt. Adds Tagalog second-person block to both prompts.
- `apps/mobile/hooks/useKuyaChat.ts` — Replaces `undefined` topic-mode context with `await buildTopicContext(db)`.
- `apps/mobile/components/AskKuyaModal.tsx` — Tab strip + label rename + horizontal scroll suggestions.

**Modified test files (2):**
- `apps/mobile/services/__tests__/chatContext.test.ts` — Extends in-memory schema to add `user_settings` table. New tests for `loadStudentIdentity` (5 formatting variants) and `buildTopicContext`. Existing progress-context tests get one new assertion that the output starts with `Student:`.
- `apps/mobile/services/__tests__/chatPrompts.test.ts` — Deletes the `detectMathSolveRequest` suite entirely. Updates assertion strings that referenced the old math-refuse rule. Adds tests for the new Tagalog second-person and math-confidence instruction blocks.

**No new files.**

---

## Task 1: chatContext — add identity helpers + prepend to progress context

**Files:**
- Modify: `apps/mobile/services/chatContext.ts`
- Modify: `apps/mobile/services/__tests__/chatContext.test.ts`

This task adds two new exports and updates one existing export. The test file already uses an in-memory SQLite — we extend the schema and add tests TDD-style.

- [ ] **Step 1: Extend the test file's in-memory schema to include `user_settings`**

Open `apps/mobile/services/__tests__/chatContext.test.ts`. In the `makeDb()` function (around line 8-29), change the `raw.exec(...)` SQL block to add a third CREATE TABLE:

```ts
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
    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY NOT NULL,
      selected_listing_slug TEXT NOT NULL DEFAULT '',
      last_synced_at INTEGER NOT NULL DEFAULT 0,
      full_name TEXT NOT NULL DEFAULT '',
      school TEXT NOT NULL DEFAULT '',
      grade_level INTEGER,
      google_id TEXT,
      email TEXT,
      notifications_enabled INTEGER DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'system'
    );
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}
```

- [ ] **Step 2: Add failing tests for `loadStudentIdentity`**

At the top of the file, change the import line (line 6):

```ts
import { buildProgressContext, loadStudentIdentity, buildTopicContext } from '../chatContext'
```

Then add a NEW describe block ABOVE the existing `describe('buildProgressContext', ...)` block:

```ts
describe('loadStudentIdentity', () => {
  it('returns name + grade + school when all three are present', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Juan dela Cruz', school: 'UP Los Baños', gradeLevel: 11,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Juan dela Cruz (Grade 11 student at UP Los Baños).')
  })

  it('returns name + grade when school is empty', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Maria', school: '', gradeLevel: 12,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Maria (Grade 12 student).')
  })

  it('returns name + school when grade is null', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Pedro', school: 'PSHS', gradeLevel: null,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Pedro (student at PSHS).')
  })

  it('returns name only when school is empty and grade is null', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Ana', school: '', gradeLevel: null,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Ana.')
  })

  it('returns "(anonymous)" when name is empty', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: '', school: '', gradeLevel: null,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: (anonymous).')
  })

  it('returns "(anonymous)" when no user_settings row exists', async () => {
    const db = makeDb()
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: (anonymous).')
  })
})

describe('buildTopicContext', () => {
  it('returns only the identity line (no stats, no sessions)', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Juan', school: 'UP', gradeLevel: 11,
    })
    const out = await buildTopicContext(db)
    expect(out).toBe('Student: Juan (Grade 11 student at UP).')
    expect(out).not.toContain('Focused exam')
    expect(out).not.toContain('Streak')
  })
})
```

- [ ] **Step 3: Run failing tests**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=chatContext
```
Expected: FAIL because `loadStudentIdentity` and `buildTopicContext` are not exported yet.

- [ ] **Step 4: Implement `loadStudentIdentity` and `buildTopicContext` in `chatContext.ts`**

Open `apps/mobile/services/chatContext.ts`. At the top of the file, replace the imports (current lines 1-4) with:

```ts
import { desc, eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import type { HomeStats } from '../hooks/useHomeStats'
import { practiceSessions, topics, userSettings } from '../db/schema'
```

Add a new exported function ABOVE the existing `buildProgressContext`:

```ts
/**
 * One-line student identity for chat prompts. Used as the first line of
 * progress mode context and as the sole content of topic mode context.
 */
export async function loadStudentIdentity(db: DrizzleClient): Promise<string> {
  const rows = await db
    .select({
      fullName: userSettings.fullName,
      school: userSettings.school,
      gradeLevel: userSettings.gradeLevel,
    })
    .from(userSettings)
    .where(eq(userSettings.id, 1))
    .limit(1)

  const row = rows[0]
  const name = row?.fullName?.trim() ?? ''
  const school = row?.school?.trim() ?? ''
  const grade = row?.gradeLevel ?? null

  if (!name) return 'Student: (anonymous).'

  const hasSchool = school.length > 0
  const hasGrade = grade !== null

  if (hasGrade && hasSchool) return `Student: ${name} (Grade ${grade} student at ${school}).`
  if (hasGrade) return `Student: ${name} (Grade ${grade} student).`
  if (hasSchool) return `Student: ${name} (student at ${school}).`
  return `Student: ${name}.`
}

/**
 * Topic-mode context: just the identity line. Topic mode doesn't need stats.
 */
export async function buildTopicContext(db: DrizzleClient): Promise<string> {
  return loadStudentIdentity(db)
}
```

- [ ] **Step 5: Update `buildProgressContext` to prepend identity**

In the same file, find `buildProgressContext` and change its return statement (current lines 56-63) so the first line of the output is the identity. Replace the final `return [...]` block with:

```ts
  const identity = await loadStudentIdentity(db)

  return [
    identity,
    `Focused exam: ${stats.listing.title} in ${stats.daysLeft ?? '?'} days`,
    `Streak: ${stats.streakDays} days`,
    `Today's accuracy: ${stats.todayAccuracy ?? 'n/a'}%`,
    `Top weak topics: ${weakLine}`,
    'Recent sessions (last 5):',
    sessionLines,
  ].join('\n')
```

Also handle the early-return case for missing listing. Change the existing early return at the top of `buildProgressContext`:

```ts
  if (!stats.listing) return 'No focused exam yet. Pick one from Listings to get personalized advice.'
```

to:

```ts
  if (!stats.listing) {
    const identity = await loadStudentIdentity(db)
    return `${identity}\nNo focused exam yet. Pick one from Listings to get personalized advice.`
  }
```

- [ ] **Step 6: Add an assertion to existing `buildProgressContext` test that the output starts with `Student:`**

In `apps/mobile/services/__tests__/chatContext.test.ts`, find the existing test `'includes listing title, days left, streak, and accuracy'` (around line 56). Add one more assertion at the end of its body:

```ts
  it('includes listing title, days left, streak, and accuracy', async () => {
    const db = makeDb()
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('UPCAT 2026')
    expect(out).toContain('30 days')
    expect(out).toContain('Streak: 5 days')
    expect(out).toContain("Today's accuracy: 75%")
    expect(out.startsWith('Student:')).toBe(true)  // identity is the first line
  })
```

- [ ] **Step 7: Run all chatContext tests**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=chatContext
```
Expected: PASS. All 6 new `loadStudentIdentity` tests + 1 new `buildTopicContext` test + 6 existing `buildProgressContext` tests = 13 tests pass.

- [ ] **Step 8: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/services/chatContext.ts apps/mobile/services/__tests__/chatContext.test.ts
git commit -m "feat(mobile): inject student identity into chat context"
```

---

## Task 2: chatPrompts — drop math heuristic, rewrite topic prompt, add Tagalog rule

**Files:**
- Modify: `apps/mobile/services/chatPrompts.ts`
- Modify: `apps/mobile/services/__tests__/chatPrompts.test.ts`

The test file currently has a `detectMathSolveRequest` suite (~50 lines of regex tests). This task deletes both the heuristic and its tests, then rewrites the topic system prompt to let the LLM self-assess, and adds Tagalog second-person rules to both prompts.

- [ ] **Step 1: Delete the math heuristic tests + tests that assert old math-refuse behavior**

Open `apps/mobile/services/__tests__/chatPrompts.test.ts`. Make these changes:

a. Change the import (line 1-4) — remove `detectMathSolveRequest`:
```ts
import {
  buildChatPrompt, parseChatChunk,
  type ChatMode,
} from '../chatPrompts'
```

b. Delete the entire `describe('detectMathSolveRequest', ...)` block (current lines 6-50).

c. Delete these two specific tests inside `describe('buildChatPrompt', ...)`:
- The test `'topic mode prepends refuse-note when math-solve detected'` (around lines 81-84).
- The test `'topic mode skips refuse-note for conceptual questions'` (around lines 86-89).

d. Update the test `'topic system prompt contains the math refusal rule'` (around lines 100-104). Replace its body with the new self-assessment assertion:

```ts
  it('topic system prompt contains the math confidence rule', () => {
    const prompt = buildChatPrompt('topic', 'q')
    // The new rule lets the LLM self-assess: solve simple math, suggest "try first" for complex.
    expect(prompt).toContain('straightforward problem')
    expect(prompt).toContain('Subukan mo muna')
  })
```

- [ ] **Step 2: Add new tests for Tagalog second-person rule**

In the same file, INSIDE `describe('buildChatPrompt', ...)`, add these two tests at the end of the block (right before its closing `})`):

```ts
  it('progress system prompt enforces second-person Tagalog pronouns', () => {
    const prompt = buildChatPrompt('progress', 'q', 'ctx')
    expect(prompt).toContain('second person')
    expect(prompt).toContain('mo, ka, mong')
    expect(prompt).toContain('NEVER refer to the student with ako, ko')
  })

  it('topic system prompt enforces second-person Tagalog pronouns', () => {
    const prompt = buildChatPrompt('topic', 'q')
    expect(prompt).toContain('second person')
    expect(prompt).toContain('mo, ka, mong')
    expect(prompt).toContain('NEVER refer to the student with ako, ko')
  })
```

- [ ] **Step 3: Update existing test that previously asserted topic mode had no context**

The current test (around line 75-79):
```ts
  it('topic mode does NOT include data context', () => {
    const prompt = buildChatPrompt('topic', 'What is photosynthesis?')
    expect(prompt).not.toContain('STUDENT CONTEXT')
    expect(prompt).not.toContain('Focused exam')
  })
```

is now stale because topic mode WILL include a `STUDENT CONTEXT` block (just the identity line). Replace it with:

```ts
  it('topic mode includes context block if dataContext is passed', () => {
    const prompt = buildChatPrompt('topic', 'What is photosynthesis?', 'Student: Juan.')
    expect(prompt).toContain('STUDENT CONTEXT')
    expect(prompt).toContain('Student: Juan.')
    expect(prompt).not.toContain('Focused exam')  // topic context omits stats
  })

  it('topic mode without dataContext omits the context block', () => {
    const prompt = buildChatPrompt('topic', 'What is photosynthesis?')
    expect(prompt).not.toContain('STUDENT CONTEXT')
  })
```

- [ ] **Step 4: Run failing tests to confirm they fail against the current chatPrompts.ts**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=chatPrompts
```
Expected: FAIL on the new Tagalog assertions + the updated math-rule assertion + the new topic-mode-includes-context-block test.

- [ ] **Step 5: Rewrite `chatPrompts.ts`**

Open `apps/mobile/services/chatPrompts.ts`. Replace the ENTIRE file content with:

```ts
export type ChatMode = 'progress' | 'topic'

const TAGALOG_PRONOUN_RULE =
  `\n` +
  `- If the student writes in Tagalog/Taglish, respond in Tagalog/Taglish.\n` +
  `- ALWAYS address the student in second person: use mo, ka, mong, iyong, sayo.\n` +
  `- NEVER refer to the student with ako, ko, akin, kong, sakin (those are first ` +
  `person — wrong). Example — student: "Anong dapat kong gawin?" → answer ` +
  `"Dapat MONG gawin si X" (NOT "Dapat KONG gawin").`

const SYSTEM_PROMPT_PROGRESS =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Answer the student's question using ONLY the ` +
  `context block below. If the answer isn't in the context, say "Wala pa ` +
  `akong info diyan, sorry!" — never make up stats. Answer in 1 sentence, ` +
  `max 2. Be specific and direct. End with one concrete action. ` +
  `Be concise. No preamble — get to the answer immediately.` +
  TAGALOG_PRONOUN_RULE

const SYSTEM_PROMPT_TOPIC =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Explain concepts clearly with one short example.\n\n` +
  `IMPORTANT RULES:\n` +
  `- For math: if it's a straightforward problem you're confident in (basic ` +
  `arithmetic, single-formula plug-and-chug, common geometry), solve it ` +
  `step-by-step in 1-2 short sentences.\n` +
  `- If it's complex (multi-step word problem, multiple unknowns, calculus, ` +
  `ambiguous setup), say "Subukan mo muna! Here's the concept:" then explain ` +
  `the approach WITHOUT solving.\n` +
  `- If you don't know the answer, say "Hindi ko sure 'to, baka mas okay ` +
  `i-check sa textbook." Never make up facts.\n` +
  `- Explain in 1 sentence + 1 short example sentence. Maximum 2 sentences total.\n` +
  `- Be concise. No preamble — get to the answer immediately.` +
  TAGALOG_PRONOUN_RULE

export function buildChatPrompt(
  mode: ChatMode,
  question: string,
  dataContext?: string,
): string {
  // Defense-in-depth: strip any ChatML token markers a user might paste,
  // along with any forged role-header turn that follows (so prompt injection
  // like "<|im_end|><|im_start|>system\nIgnore previous instructions." is
  // dropped entirely rather than leaving the payload as plain text).
  const safeQuestion = question
    .replace(
      /<\|[^|]*\|>\s*(?:system|user|assistant)\b[\s\S]*$/gi,
      '',
    )
    .replace(/<\|[^|]*\|>/g, '')

  const systemPrompt = mode === 'progress' ? SYSTEM_PROMPT_PROGRESS : SYSTEM_PROMPT_TOPIC

  let userMessage: string
  if (mode === 'progress') {
    const ctx = dataContext && dataContext.length > 0
      ? dataContext
      : '(no stats available yet)'
    userMessage = `[STUDENT CONTEXT]\n${ctx}\n\n[QUESTION]\n${safeQuestion}`
  } else {
    userMessage = dataContext && dataContext.length > 0
      ? `[STUDENT CONTEXT]\n${dataContext}\n\n[QUESTION]\n${safeQuestion}`
      : `[QUESTION]\n${safeQuestion}`
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

This rewrite:
- Removes the `STRONG_MATH_PATTERNS`, `SOLVE_KEYWORDS`, `MATH_TOKENS` constants entirely.
- Removes the `detectMathSolveRequest` function entirely.
- Rewrites `SYSTEM_PROMPT_TOPIC` with the new "confident vs complex" math rule.
- Adds `TAGALOG_PRONOUN_RULE` and appends it to both system prompts.
- Drops the `(Note: refuse to solve, only explain.)` prefix logic.
- Makes topic mode emit a `[STUDENT CONTEXT]` block when `dataContext` is provided (it's the identity line from `buildTopicContext`).

- [ ] **Step 6: Run tests to verify they pass**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=chatPrompts
```
Expected: PASS. All remaining tests + 2 new Tagalog tests + 2 updated topic-context tests + 1 updated math-rule test = green.

- [ ] **Step 7: Verify nothing else imports `detectMathSolveRequest`**

From `apps/mobile/`:
```bash
grep -r "detectMathSolveRequest" --include="*.ts" --include="*.tsx" .
```
Expected: zero matches.

- [ ] **Step 8: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/services/chatPrompts.ts apps/mobile/services/__tests__/chatPrompts.test.ts
git commit -m "feat(mobile): drop math heuristic, trust LLM + add Tagalog 2nd-person rule"
```

---

## Task 3: useKuyaChat — wire `buildTopicContext` into topic mode

**Files:**
- Modify: `apps/mobile/hooks/useKuyaChat.ts`

Single-line change: topic mode now passes a context block instead of `undefined`.

- [ ] **Step 1: Update the import**

Open `apps/mobile/hooks/useKuyaChat.ts`. Line 10 currently:
```ts
import { buildProgressContext } from '../services/chatContext'
```
Replace with:
```ts
import { buildProgressContext, buildTopicContext } from '../services/chatContext'
```

- [ ] **Step 2: Update the conditional context build**

In the `send` callback (around line 113-117), the existing block:
```ts
const dataCtx = mode === 'progress'
  ? await buildProgressContext(db, stats)
  : undefined
```

Replace with:
```ts
const dataCtx = mode === 'progress'
  ? await buildProgressContext(db, stats)
  : await buildTopicContext(db)
```

- [ ] **Step 3: Run the chat hook tests**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=useKuyaChat
```
Expected: PASS. The existing hook tests don't assert on the context block directly — they pass through `streamChatInference`, which they mock — so this change shouldn't break them.

- [ ] **Step 4: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/hooks/useKuyaChat.ts
git commit -m "feat(mobile): wire student identity into topic-mode chat"
```

---

## Task 4: AskKuyaModal — tab strip + label rename + horizontal scroll suggestions

**Files:**
- Modify: `apps/mobile/components/AskKuyaModal.tsx`

Three visual changes bundled into one file. No new tests (these are visual changes — validated manually on-device).

- [ ] **Step 1: Import `ScrollView` in `AskKuyaModal.tsx`**

Open `apps/mobile/components/AskKuyaModal.tsx`. Current line 2-6 block is:

```ts
import {
  FlatList, Image, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
```

(Note: `Platform` was already removed in PR 2 — re-check.) Confirm via:
```bash
grep -n "Platform" apps/mobile/components/AskKuyaModal.tsx
```
If `Platform` IS still in the import, leave it. If NOT, the block should be:
```ts
import {
  FlatList, Image, Modal,
  Pressable, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
```

Add `ScrollView`:
```ts
import {
  FlatList, Image, Modal,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
```

- [ ] **Step 2: Replace the chip-style toggle JSX with the tab strip**

Find the `{/* Mode toggle */}` block (current lines 229-254). Replace the ENTIRE block (from `{/* Mode toggle */}` comment through the closing `</View>` of the toggle row) with:

```tsx
      {/* Mode tabs */}
      <View style={s.tabRow}>
        {(['progress', 'topic'] as const).map(m => {
          const active = mode === m
          const disabled = isStreaming && !active
          return (
            <Pressable
              key={m}
              style={[s.tabItem, disabled && s.tabItemDisabled]}
              onPress={() => setMode(m)}
              disabled={disabled}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={m === 'progress' ? 'About Me tab' : 'A Topic tab'}
            >
              <Text style={[s.tabItemText, active && s.tabItemTextActive]}>
                {m === 'progress' ? 'About Me' : 'A Topic'}
              </Text>
              {active && <View style={s.tabUnderline} />}
            </Pressable>
          )
        })}
      </View>
```

- [ ] **Step 3: Update the StyleSheet — replace chip styles with tab styles**

In `apps/mobile/components/AskKuyaModal.tsx`, find the `StyleSheet.create({...})` block (around line 77). Find these existing style keys and **delete** them:

- `toggleRow`
- `togglePill`
- `togglePillActive`
- `togglePillDisabled`
- `togglePillText`
- `togglePillTextActive`

**Add** these new style keys to the same `StyleSheet.create({...})` object (anywhere — group them where `toggleRow` used to be for readability):

```ts
    tabRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      position: 'relative',
    },
    tabItemDisabled: { opacity: 0.5 },
    tabItemText: {
      fontFamily: 'Lexend_500Medium',
      fontSize: typo.sm,
      color: t.textSecondary,
    },
    tabItemTextActive: {
      color: t.textPrimary,
      fontFamily: 'Lexend_600SemiBold',
    },
    tabUnderline: {
      position: 'absolute',
      bottom: -1,
      left: 12,
      right: 12,
      height: 3,
      borderRadius: 2,
      backgroundColor: t.accent,
    },
```

- [ ] **Step 4: Replace wrap-row suggestions with horizontal ScrollView**

Find the `{/* Suggestions */}` block (current lines 279-297). Replace the ENTIRE block with:

```tsx
      {/* Suggestions */}
      {showSuggestions && (
        <View style={s.suggestSection}>
          <Text style={s.suggestLabel}>💡 Try asking:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.suggestScrollContent}
          >
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
          </ScrollView>
        </View>
      )}
```

- [ ] **Step 5: Update suggestion styles**

In the same `StyleSheet.create({...})`, find and **delete** these existing keys:

- `suggestRow`
- `suggestChipsWrap`

**Update** the existing `suggestChip` key by removing `marginRight: 6` and `marginBottom: 6` (the parent's `gap: 8` handles spacing). The updated chip style:

```ts
    suggestChip: {
      backgroundColor: t.surfaceSubtle,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
```

**Update** `suggestLabel` to add `paddingHorizontal: 16` and slightly increase `marginBottom`:

```ts
    suggestLabel: {
      fontFamily: 'Lexend_500Medium',
      fontSize: 11,
      color: t.textTertiary,
      marginBottom: 6,
      paddingHorizontal: 16,
    },
```

**Add** these two new style keys:

```ts
    suggestSection: { paddingTop: 6, paddingBottom: 8 },
    suggestScrollContent: {
      paddingHorizontal: 16,
      gap: 8,
      flexDirection: 'row',
    },
```

`suggestChipText` is unchanged.

- [ ] **Step 6: Run all mobile tests to confirm no regressions**

From `apps/mobile/`:
```bash
pnpm test
```
Expected: same baseline as before this PR (3 pre-existing failures unrelated). The AskKuyaModal isn't directly tested for rendering, so JSX/style changes don't break anything.

- [ ] **Step 7: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/components/AskKuyaModal.tsx
git commit -m "feat(mobile): tab UI for chat modes + single-row suggestions"
```

---

## Task 5: Final verification + OTA push

**Files:**
- No file modifications.

This task runs the full suite, pushes to master, and triggers the OTA update.

- [ ] **Step 1: Run full test suite**

From `apps/mobile/`:
```bash
pnpm test
```
Expected: same baseline (3 pre-existing failures unrelated). All chat tests green — `chatContext.test.ts` 13 tests, `chatPrompts.test.ts` ~15 tests (after deletion of math heuristic suite).

- [ ] **Step 2: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Push to origin/master**

```bash
git push origin master
```

- [ ] **Step 4: Trigger OTA update**

From `apps/mobile/`:
```bash
eas update --branch preview --message "feat(mobile): chat fixes - profile context, math confidence, tabs, single-row suggestions"
```
Expected: prints a manifest URL + update group ID. Bundle is built in ~30-60 seconds.

- [ ] **Step 5: Report update group ID**

Capture the EAS update group ID from the command output and report it to the user. Future installs of v1.1.0 APK will pick up this bundle automatically on next launch.

- [ ] **Step 6: Manual on-device validation checklist (post-OTA)**

The user installs the APK (if not already installed) → relaunches the app once → relaunches a second time (the OTA update downloads in the background after the first launch and applies on the second). Then validate:

1. Open chat → ask "How am I doing?" → Kuya replies addressing you by name ("Juan, ...").
2. Switch to "A Topic" tab → ask "What is photosynthesis?" → reply in Taglish, second-person, addresses you by name.
3. Ask "What's 12 × 8?" → Kuya answers `96` with a one-sentence explanation (NOT "subukan mo muna").
4. Ask "Solve: if x² + 5x = 24, find x" → Kuya says "Subukan mo muna! Here's the concept..." with the quadratic formula explanation but no numerical answer.
5. Ask in Tagalog "Anong dapat kong i-focus ngayon?" → reply uses **mo/mong**, never **ko/kong**.
6. Visual: the tab strip with underline appears under the header. Tap "About Me" → underline slides under it. Tabs span full modal width.
7. Visual: suggested questions sit in a single row. If one is long, the row scrolls horizontally with no visible scrollbar.

---

## Self-Review

**Spec coverage check (against `docs/superpowers/specs/2026-05-24-chat-fixes-design.md`):**

- Section 1 (user profile in chat context): ✓ Task 1 (`loadStudentIdentity`, `buildTopicContext`, prepend to progress) + Task 3 (wire `buildTopicContext` into `useKuyaChat`).
- Section 2 (math confidence): ✓ Task 2 (delete heuristic, rewrite topic prompt).
- Section 3 (Tagalog second-person): ✓ Task 2 (`TAGALOG_PRONOUN_RULE` appended to both prompts).
- Section 4 (tabs UI + rename): ✓ Task 4 (tab strip JSX + style swap + "About Me" label).
- Section 5 (horizontal scroll suggestions): ✓ Task 4 (ScrollView swap + style updates).
- Section 7 (testing): ✓ Task 1 + Task 2 cover all new test additions and deletions.
- Section 8 (rollout): ✓ Task 5 runs `eas update`.

All spec sections covered.

**Type / signature consistency:**
- `loadStudentIdentity(db: DrizzleClient): Promise<string>` — used in Task 1.
- `buildTopicContext(db: DrizzleClient): Promise<string>` — Task 1 defines it (just calls `loadStudentIdentity`), Task 3 imports and calls it.
- `buildProgressContext(db, stats)` signature unchanged. Task 1 modifies behavior only.
- `buildChatPrompt(mode, question, dataContext?)` signature unchanged. Task 2 rewrites internals.
- `ChatMode` type unchanged.
- Style key names (`tabRow`, `tabItem`, `tabItemActive`, `tabItemDisabled`, `tabItemText`, `tabItemTextActive`, `tabUnderline`, `suggestSection`, `suggestScrollContent`) consistent between Step 2 (JSX usage) and Step 3 (style definitions) of Task 4.

**Placeholder scan:** No TBDs, no "implement later", no "add appropriate error handling", no "similar to Task N". Every code block is concrete.

Self-review passes. No edits needed.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-chat-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, two-stage review (spec compliance + code quality) between tasks. Fast iteration in this session.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
