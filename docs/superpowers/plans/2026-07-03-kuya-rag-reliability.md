# Kuya Baw RAG Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kuya Baw reliably reach the data that already exists — fix the routing/retrieval bugs that cause false "I don't have that data" and ungrounded 1B answers — without any native build (Phase 1 is 100% OTA-safe JS).

**Architecture:** Keep the SSoT deterministic SQLite path as the primary grounding. Fix the classifiers that decide *whether* to retrieve (math false-positives, math-guard stealing data intents), make retrieval history-aware, stop discarding valid answers, give cloud Gemini a bigger context budget, and fall back to SSoT enumeration instead of free generation when retrieval is empty. Semantic (vector) retrieval is a later phase gated on an embedding spike.

**Tech Stack:** TypeScript, drizzle/expo-sqlite, Jest. Files: `apps/mobile/services/chatPrompts.ts`, `apps/mobile/services/ssotAnswer.ts`, `apps/mobile/hooks/useKuyaChat.ts`, `apps/mobile/services/ragPipeline.ts` + their `__tests__`. Prompts are triple-sourced — any prompt-string change must also update `apps/admin/lib/aiConfigDefaults.ts` (none in Phase 1).

**Verified facts (checked against code before planning):**
- `isMathQuestion` returns true for any `\d{2,}` (chatPrompts.ts ~L316) → "when is UPCAT 2026?" is misread as math.
- `classifyDataIntent` early-returns `null` when `isMathQuestion` is true (ssotAnswer.ts ~L166) → math false-positives skip the deterministic listings lookup entirely.
- `isTagalogHeavy` discards a fully-generated answer and shows "could you re-ask?" (useKuyaChat.ts L41-46, L328-330, L389-391).
- Retrieval/classification use only the current message (useKuyaChat.ts L219, L229) → anaphoric follow-ups retrieve nothing.
- Empty retrieval → `buildRagContext` returns `{ blocks: '' }` (ragPipeline.ts L139) → topic mode answers from 1B weights ungrounded.
- Gemini gets `maxOutputTokens` 768/1024 but the *input* RAG budget is the same 700-token/280-char cap as local.

---

## Task 1: Bare multi-digit numbers must not be classified as math

**Problem:** `isMathQuestion` treats any 2+ digit run as math, so years ("2026") and counts in factual questions ("UPCAT 2026", "155 scholarships") force math mode and skip data routing.

**Files:**
- Modify: `apps/mobile/services/chatPrompts.ts` (the `isMathQuestion` function)
- Test: `apps/mobile/services/__tests__/chatPrompts.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('isMathQuestion — bare numbers are not math', () => {
  it('does NOT flag a year in a listings question', () => {
    expect(isMathQuestion('when is UPCAT 2026?')).toBe(false)
    expect(isMathQuestion('what scholarships are open in 2026')).toBe(false)
  })
  it('does NOT flag a bare count', () => {
    expect(isMathQuestion('are there 155 scholarships?')).toBe(false)
  })
  it('STILL flags real math', () => {
    expect(isMathQuestion('what is 12 + 5')).toBe(true)   // operator
    expect(isMathQuestion('solve 2x + 6 = 14')).toBe(true) // pattern/keyword
    expect(isMathQuestion('what is 144')).toBe(true)       // weak-interrogative + digit
    expect(isMathQuestion('simplify 3/4')).toBe(true)      // keyword
  })
})
```

- [ ] **Step 2: Run to verify the two "does NOT" tests FAIL** — `pnpm --filter @iskotify/mobile test -- chatPrompts` (bare-number cases return true today).

- [ ] **Step 3: Implement** — remove the standalone multi-digit rule so a bare number is only math when paired with an operator, an algebraic pattern, a strong keyword, or a "what is/find/how much/how many" interrogative. Delete this line from `isMathQuestion`:

```ts
  // DELETE: bare multi-digit numbers are NOT inherently math (years, counts).
  if (/\d{2,}/.test(question)) return true
```

The remaining rules (`MATH_OPERATORS` + digit, `\b\d+\s*[xyz]\b`, `STRONG_MATH_KEYWORDS`, `WEAK_INTERROGATIVES` + digit) already cover real math including "what is 144".

- [ ] **Step 4: Run tests — all pass**, then run the full `chatPrompts` + `ssotAnswer` suites to confirm no regression in the math-routing tests.

- [ ] **Step 5: Commit** — `fix(kuya): don't classify bare years/counts as math questions`

---

## Task 2: Strong data signals win over the math guard in classifyDataIntent

**Problem:** `classifyDataIntent` runs `if (isMathQuestion(q)) return null` before any data check. Even after Task 1, a question that legitimately contains an operator but is really a data lookup (rare, but also as defense-in-depth) should still reach listings/exam routing when a strong acronym/keyword is present.

**Files:**
- Modify: `apps/mobile/services/ssotAnswer.ts` (`classifyDataIntent`)
- Test: `apps/mobile/services/__tests__/ssotAnswer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it('routes a strong listing signal to listings even if a digit/operator is present', () => {
  // UPCAT acronym is a strong listing signal; must not be stolen by the math guard.
  expect(classifyDataIntent('is the UPCAT 2026 exam +2 weeks delayed?')).toBe('listings')
})
it('still returns null for a pure math question', () => {
  expect(classifyDataIntent('solve 2x + 6 = 14')).toBe(null)
})
```

- [ ] **Step 2: Run to verify FAIL** (first case returns null today because the math guard fires first).

- [ ] **Step 3: Implement** — introduce a strong-data-signal check evaluated BEFORE the math guard. Add near the top of `classifyDataIntent`, after the empty check:

```ts
  // Strong, unambiguous data signals (exam/scholarship acronyms + explicit
  // listing nouns) take precedence over the math guard, so a data lookup that
  // happens to contain a number/operator still routes to the deterministic path.
  const STRONG_LISTING = /\b(upcat|acet|dcat|ustet|pupcet|usthet|\bcet\b|dost|ched|scholarship|deadline)\b/i
  if (STRONG_LISTING.test(q)) return 'listings'
```

Keep the existing `if (isMathQuestion(q)) return null` immediately after this block.

- [ ] **Step 4: Run tests — pass.** Run full `ssotAnswer` suite; if a pre-existing precedence test now changes (e.g. a school/course question containing a listing acronym), reconcile by tightening `STRONG_LISTING` to acronyms + `scholarship`/`deadline` only (do not add generic words like "exam").

- [ ] **Step 5: Commit** — `fix(kuya): strong exam/scholarship signals beat the math guard in intent routing`

---

## Task 3: History-aware retrieval for anaphoric follow-ups

**Problem:** Only the current message is classified and retrieved on, so "what about abroad?" / "and the deadline?" retrieve nothing.

**Files:**
- Modify: `apps/mobile/hooks/useKuyaChat.ts` (`send`)
- Create: `apps/mobile/utils/retrievalQuery.ts` (pure helper, easy to unit-test)
- Test: `apps/mobile/utils/__tests__/retrievalQuery.test.ts`

- [ ] **Step 1: Write failing test for the pure helper**

```ts
import { buildRetrievalQuery } from '../retrievalQuery'
it('prepends the previous user question for a short anaphoric follow-up', () => {
  expect(buildRetrievalQuery('what about abroad?', 'best schools for nursing'))
    .toBe('best schools for nursing what about abroad?')
})
it('leaves a self-contained question unchanged', () => {
  expect(buildRetrievalQuery('what is the UPCAT deadline?', 'hi'))
    .toBe('what is the UPCAT deadline?')
})
it('handles no previous question', () => {
  expect(buildRetrievalQuery('what about abroad?', null)).toBe('what about abroad?')
})
```

- [ ] **Step 2: Run — FAIL** (module missing).

- [ ] **Step 3: Implement `buildRetrievalQuery`**

```ts
// Anaphoric follow-ups ("what about X", "and the deadline?", pronoun-led, or
// very short) don't carry enough on their own to classify/retrieve. Prepend the
// previous USER question so retrieval has the referent. Self-contained questions
// are returned unchanged so we never dilute a good query.
const ANAPHORIC = /^(what about|how about|and |what of|ok |okay |then |so )/i
export function buildRetrievalQuery(current: string, prevUserText: string | null): string {
  const c = current.trim()
  if (!prevUserText) return c
  const wordCount = c.split(/\s+/).filter(Boolean).length
  const isFollowUp = ANAPHORIC.test(c) || wordCount <= 4
  return isFollowUp ? `${prevUserText.trim()} ${c}` : c
}
```

- [ ] **Step 4: Run — pass.**

- [ ] **Step 5: Wire into `send`** — in `useKuyaChat.ts`, compute the retrieval query from history and use it for BOTH classification and RAG (keep the raw `trimmed` for display/persistence and as the `[QUESTION]` shown to the model):

```ts
// after: const historyForPrompt = messagesRef.current.slice(-10)...
const prevUserText = [...messagesRef.current].reverse().find(m => m.role === 'user')?.text ?? null
const retrievalQuery = buildRetrievalQuery(trimmed, prevUserText)
// use retrievalQuery for classifyDataIntent(...) and buildRagContext(..., retrievalQuery, ...)
// keep `trimmed` as the user-visible question and the [QUESTION] block.
```

Change `const dataIntent = classifyDataIntent(trimmed)` → `classifyDataIntent(retrievalQuery)` and the `buildRagContext(dbRef.current, trimmed, ...)` call → pass `retrievalQuery`.

- [ ] **Step 6: Run the `useKuyaChat` suite — pass** (existing tests use self-contained questions, so `retrievalQuery === trimmed`). Add one test: a follow-up after a schools question invokes `classifyDataIntent`/`buildRagContext` with the concatenated query (assert via the existing mocks).

- [ ] **Step 7: Commit** — `feat(kuya): history-aware retrieval query for follow-up questions`

---

## Task 4: Provider-aware context budget (Gemini gets more)

**Problem:** Cloud Gemini has ~1M context but is fed the same 700-token/280-char RAG budget as the local 1B, truncating the very data the grounding rule requires.

**Files:**
- Modify: `apps/mobile/hooks/useKuyaChat.ts` (Gemini branch)
- Test: `apps/mobile/hooks/__tests__/useKuyaChat.test.ts`

- [ ] **Step 1: Write failing test** — assert that for a Gemini send, `buildRagContext` is called with a cfg whose `ragTotalTokenBudget >= 2000` and `ragPerBlockCharCap >= 600`; for a local send it uses the builtin (cfg budget undefined or the admin value).

```ts
it('gives Gemini a larger RAG budget than local', async () => {
  // (gemini provider mocked on) send a topic question, then:
  const cfgArg = mockBuildRagContext.mock.calls[0]![4] // cfg param
  expect(cfgArg.ragTotalTokenBudget).toBeGreaterThanOrEqual(2000)
  expect(cfgArg.ragPerBlockCharCap).toBeGreaterThanOrEqual(600)
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** — build the RAG context AFTER provider is known, passing a provider-scaled budget. In `send`, replace the single `buildRagContext(dbRef.current, retrievalQuery, effectiveMode, statsRef.current, aiCfg)` with a cfg that widens budgets on Gemini:

```ts
const isGemini = settings.aiProvider === 'gemini' && geminiKey !== null
const ragCfg = isGemini
  ? { ...(aiCfg ?? {}), ragTotalTokenBudget: Math.max(aiCfg?.ragTotalTokenBudget ?? 0, 2400), ragPerBlockCharCap: Math.max(aiCfg?.ragPerBlockCharCap ?? 0, 700) }
  : aiCfg
const { blocks, sources } = await buildRagContext(dbRef.current, retrievalQuery, effectiveMode, statsRef.current, ragCfg)
```

(`ragTotalTokenBudget`/`ragPerBlockCharCap` already override the builtins when > 0 — ragPipeline.ts L100-101.)

- [ ] **Step 4: Run tests — pass** (update the existing Gemini budget test if its call-arg index shifts).

- [ ] **Step 5: Commit** — `feat(kuya): give cloud Gemini a larger RAG context budget than the local 1B`

---

## Task 5: Retry Tagalog-heavy answers instead of discarding them

**Problem:** `isTagalogHeavy(reply)` throws away a fully-generated (often correct) answer and shows "could you re-ask?". This loses valid answers.

**Files:**
- Modify: `apps/mobile/hooks/useKuyaChat.ts` (both Gemini and local finalization)
- Test: `apps/mobile/hooks/__tests__/useKuyaChat.test.ts`

- [ ] **Step 1: Write failing test** — when the first Gemini reply is Tagalog-heavy, the client retries once with a stronger English instruction and shows the retry result; it does NOT show the "re-ask" canned string when the retry returns English.

```ts
it('retries once (English-forced) when the first reply is Tagalog-heavy', async () => {
  mockGenerateGeminiReply
    .mockResolvedValueOnce('Oo, kaya mo yan kasi mahalaga ang pag-aaral talaga')
    .mockResolvedValueOnce('Yes — focus on Algebra today.')
  // ...send...
  expect(mockGenerateGeminiReply).toHaveBeenCalledTimes(2)
  const msg = result.current.messages.find(m => m.role === 'assistant')!
  expect(msg.text).toBe('Yes — focus on Algebra today.')
})
```

- [ ] **Step 2: Run — FAIL** (today it discards and shows the canned string, 1 call).

- [ ] **Step 3: Implement** — replace the discard branches. Gemini branch: on Tagalog-heavy, re-call `generateGeminiReply` once with `userContent + '\n\n[INSTRUCTION] Your previous reply used Tagalog. Answer again in clear ENGLISH only.'`; use the retry text (only fall back to the canned re-ask if the retry is empty). Local branch: re-run `streamChatInference` once with a prompt that appends the same stronger English instruction, buffering to a string (no need to stream the retry); use the retry output. Extract a shared `isTagalogHeavy` guard (already present) and keep `maxFontSizeMultiplier` untouched.

- [ ] **Step 4: Run tests — pass** (also add the local-path equivalent test).

- [ ] **Step 5: Commit** — `fix(kuya): retry in English instead of discarding a Tagalog-heavy answer`

---

## Task 6: Empty-retrieval fallback to SSoT enumeration (anti-hallucination)

**Problem:** When `dataIntent` is null and `buildRagContext` returns empty blocks on a factual-looking question, the 1B answers from its weights ungrounded. Prefer a deterministic enumeration.

**Files:**
- Modify: `apps/mobile/hooks/useKuyaChat.ts` (after building RAG blocks, before the LLM call)
- Modify: `apps/mobile/services/ssotAnswer.ts` (export a `looksFactual(question)` guard + reuse `buildListingsEnumeration`/`buildSubjectsContext`)
- Test: `apps/mobile/services/__tests__/ssotAnswer.test.ts`, `apps/mobile/hooks/__tests__/useKuyaChat.test.ts`

- [ ] **Step 1: Write failing test for `looksFactual`**

```ts
it('flags factual-lookup questions', () => {
  expect(looksFactual('what exams are available')).toBe(true)
  expect(looksFactual('list the scholarships')).toBe(true)
  expect(looksFactual('what subjects can I review')).toBe(true)
})
it('does not flag reasoning questions', () => {
  expect(looksFactual('what is photosynthesis')).toBe(false)
  expect(looksFactual('solve 2x + 6 = 14')).toBe(false)
})
```

- [ ] **Step 2: Run — FAIL** (module export missing).

- [ ] **Step 3: Implement `looksFactual`** in ssotAnswer.ts (exported): true when the question contains exam/scholarship/listing/school/course/subject/topic/deadline nouns and is not `isMathQuestion`.

```ts
const FACTUAL_NOUNS = /\b(exams?|scholarships?|grants?|listings?|schools?|universit(?:y|ies)|colleges?|courses?|programs?|degrees?|subjects?|topics?|deadlines?|requirements?)\b/i
export function looksFactual(question: string): boolean {
  if (!question || isMathQuestion(question)) return false
  return FACTUAL_NOUNS.test(question)
}
```

- [ ] **Step 4: Run — pass.**

- [ ] **Step 5: Wire the fallback in `send`** — after `buildRagContext`, before choosing the LLM path:

```ts
if (!dataIntent && blocks.trim().length === 0 && looksFactual(retrievalQuery)) {
  // Nothing retrieved for a factual question — answer deterministically from the
  // catalog instead of letting the 1B hallucinate.
  const enumAnswer =
    (await buildListingsEnumeration(dbRef.current, retrievalQuery))
    ?? (await buildSubjectsContext(dbRef.current))
  if (enumAnswer) {
    const text = stripTagExported(enumAnswer)  // reuse the header-stripping helper
    // finalize + persist exactly like the SSoT branch (mode 'topic'), then return
  }
}
```

(Export a `stripTag` from ssotAnswer.ts, or format the enumeration into a friendly sentence there and return that.)

- [ ] **Step 6: Run tests — pass.** Add a `useKuyaChat` test: a factual question that produces empty RAG blocks yields a non-empty deterministic answer without calling `streamChatInference`.

- [ ] **Step 7: Commit** — `feat(kuya): fall back to catalog enumeration when retrieval is empty on a factual question`

---

## Phase 1 wrap-up

- [ ] Run `pnpm --filter @iskotify/mobile type-check` (clean) and the full `pnpm --filter @iskotify/mobile test` (all green).
- [ ] `eas update --branch production` (JS-only, runtime 1.7.0 — no app.json bump).

---

## Phase 2 & 3 roadmap (separate plans — NOT executed here)

These need their own detailed TDD plans. Phase 2 is gated on a spike; do not write its retrieval code until the spike passes.

**Phase 2 — On-device hybrid semantic retrieval (OTA-feasibility: likely, pending spike):**
- **T2.0 SPIKE (blocking):** Verify `llama.rn` (current pinned version) exposes a working embedding mode on-device (`initLlama({ embedding: true })` / `ctx.embedding(text)`), and that a ~30 MB GGUF embedding model (e.g. `bge-small-en` / `all-MiniLM-L6-v2`, 384-dim) loads under the 1.8 GB RAM gate alongside Gemma. Deliverable: a throwaway screen that embeds two strings and logs cosine similarity on a real device. If it fails, Phase 2 becomes a server-embedding-only design (query embedding via a proxy) — re-plan.
- **T2.1** Server-side embedding precompute for flashcards / upcat_facts / career_facts / ai_career_impact / listing title+description (~2,000 chunks); store a quantized `int8` vector column; expose via the sync pull.
- **T2.2** Runtime-download the embedding GGUF (mirror the Gemma download UX in `services/llm.ts`); load in embedding mode; `embedQuery(text): Float32Array`.
- **T2.3** Brute-force cosine top-k over the synced vectors (typed arrays, in-memory) — no vector DB.
- **T2.4** Reciprocal Rank Fusion of BM25 (existing FTS5) + cosine top-k; feed the fused list into the existing `ragPipeline` priority/budget assembly (do NOT replace lexical — BM25 keeps exact acronyms strong).
- **T2.5** Similarity-based intent-routing fallback: when no regex matches, classify by cosine to a small set of per-intent exemplar questions — kills the "add-a-regex-per-bug" cycle. Admin-editable exemplar list.

**Phase 3 — Grounding enforcement at generation (OTA-safe JS):**
- **T3.1** Number context blocks `[S1] [S2]…`; require citations in factual modes; post-process to flag/strip factual sentences that cite nothing.
- **T3.2** Deterministic fact-check: extract dates/amounts/URLs from the answer; reject + fall back to the SSoT answer if any isn't present in the retrieved context. A hard backstop the 1B can't talk past.
- **T3.3** Golden-question eval set (extend `ssotAnswer.test.ts` discipline) run in CI so every routing/prompt change is measured, not guessed.

**Admin modifiability (all phases):** `/admin/ai-config` already edits prompts/guardrails/RAG budgets/block toggles. Phase 2's exemplar questions (T2.5) and Phase 3's citation strictness (T3.1) should be added there as new `ai_chat_config` fields when built.
