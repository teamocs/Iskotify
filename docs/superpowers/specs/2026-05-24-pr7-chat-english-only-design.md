# PR 7: Chat — English-only + concise responses + hard length cap

## Overview

The PR 5 chat fixes ("inject identity, math confidence, Tagalog second-person") made AI responses **worse**. User screenshot shows the 1.5B Qwen model hallucinating non-Tagalog words ("Minggap"), violating the 1-2 sentence cap, and ignoring the second-person rule it was supposed to enforce.

**Root cause:** PR 5 grew the system prompt from ~120 words to ~280 words. The 1.5B model has limited attention bandwidth. With more rules competing for it (Tagalog pronouns + math confidence + identity injection + conciseness + persona), the model pattern-matched superficially and started filling responses with hallucinated Tagalog-shaped tokens.

**Fix strategy:** Drop the rules the small model can't follow. Constrain it physically (n_predict cap). Simplify context.

Four concrete changes:
1. **English-only** — drop Tagalog response support entirely. Reply in English regardless of input language.
2. **Shorter system prompts** — cut from ~280 words to ~80 words each.
3. **Slim progress context** — drop the per-session breakdown, compress to 3 lines.
4. **Hard n_predict cap** — reduce streaming chat inference from 100 → 60 tokens (~45 words ceiling).

Ships as one OTA bundle. JS-only. No native module change.

---

## 1. English-only language policy

### Current state

`apps/mobile/services/chatPrompts.ts` `TAGALOG_PRONOUN_RULE` constant tells the model:

```
- If the student writes in Tagalog/Taglish, respond in Tagalog/Taglish.
- ALWAYS address the student in second person: use mo, ka, mong, iyong, sayo.
- NEVER refer to the student with ako, ko, akin, kong, sakin...
- Example — student says "Anong dapat kong gawin?" → answer "Dapat MONG gawin si X"...
```

This rule is contrastive ("MONG not KONG") and requires Tagalog grammar fluency — the 1.5B model can't deliver. Result: hallucinated Tagalog words like "Minggap" and incorrect "kong" usage in the live screenshot.

### Changes

**`apps/mobile/services/chatPrompts.ts`:**

1. **Delete** the `TAGALOG_PRONOUN_RULE` constant entirely.
2. **Both system prompts** gain a single explicit English-only directive:
   ```
   Always respond in clear English, even if the student asks in Tagalog.
   ```
3. Remove the Tagalog fallback `"Hindi ko sure 'to, baka mas okay i-check sa textbook"` from `SYSTEM_PROMPT_TOPIC`. Replace with English: `"If unsure, say 'I'm not sure — check your textbook.'"`
4. Remove the Tagalog wording `"Wala pa akong info diyan, sorry!"` from `SYSTEM_PROMPT_PROGRESS`. Replace with English: `"If the answer isn't in the context, say 'I don't have that info yet.'"`
5. Remove the Tagalog instruction `"Subukan mo muna!"` in math complex-case path; replace with `"Try it yourself first!"`

### Why this works

Qwen 2.5 1.5B is reliably fluent in English. Forcing English output for ALL queries (including Tagalog-language queries) makes the model fall back to its strongest capability. Filipino students reading English replies is fine — the app's UI is already English-default, and they're studying for English-medium exams (UPCAT/scholarships).

The "Kuya Baw" mascot persona (warm older sibling) remains via tone/word choice, not via language.

---

## 2. Drastically shorter system prompts

### Current state

`SYSTEM_PROMPT_PROGRESS` is ~135 words. `SYSTEM_PROMPT_TOPIC` is ~165 words. Combined with the appended `TAGALOG_PRONOUN_RULE` (~70 words), total system instruction is ~205 / ~235 words respectively. The 1.5B model's working attention is overwhelmed.

### Changes

Replace the prompts with these compact versions (~80 words each):

**`SYSTEM_PROMPT_PROGRESS`:**
```
You are Kuya Baw, a friendly review coach for UPCAT/scholarship students.
Always respond in clear English, even if the student asks in Tagalog.
Answer using ONLY the [STUDENT CONTEXT] block below. If the answer isn't
in the context, say "I don't have that info yet."
RULES:
- Maximum 2 sentences. Be direct. No preamble.
- Address the student in second person (you/your).
- End with one specific action when relevant.
```

**`SYSTEM_PROMPT_TOPIC`:**
```
You are Kuya Baw, a friendly review coach for UPCAT/scholarship students.
Always respond in clear English, even if the student asks in Tagalog.
RULES:
- Maximum 2 sentences. Be direct. No preamble.
- For complex math (multi-step, calculus, word problems): say "Try it yourself
  first!" and give the formula/concept; don't solve.
- For simple math (arithmetic, single formula): solve it step-by-step.
- If unsure, say "I'm not sure — check your textbook."
- Address the student in second person (you/your).
```

The math confidence rule survives (it was the one prompting rule that worked well in PR 5 — the "Am I on track?" question in the screenshot got a good answer).

### Why this works

Less competing instruction = more attention for the actual question. The "Be direct. No preamble." line is the most important conciseness signal — explicit, terse, and at the top of the rule list.

---

## 3. Slim progress context

### Current state

`apps/mobile/services/chatContext.ts` `buildProgressContext` emits a 7-line block:

```
Student: Maria (Grade 11 student at UP Diliman).
Focused exam: UPCAT 2026 in 60 days
Streak: 5 days
Today's accuracy: 65%
Top weak topics: Algebra (32%), Biology (45%)
Recent sessions (last 5):
  - Nov 22: Algebra — 7/10
  - Nov 21: Biology — 8/10
  - Nov 20: mixed practice — 6/10
  - Nov 19: Algebra — 5/10
  - Nov 18: Biology — 9/10
```

The per-session breakdown (lines 6-11) takes ~50% of the context tokens but the model never uses individual session data meaningfully — it's noise.

### Changes

**`apps/mobile/services/chatContext.ts` `buildProgressContext` rewrite:**

Compact the output to 3 lines:

```
Student: Maria (Grade 11, UP Diliman).
Exam: UPCAT 2026 in 60 days. Today: 65% accuracy, 5-day streak.
Weak topics: Algebra (32%), Biology (45%).
```

Specifically:
- Drop the `Recent sessions (last 5):` section entirely. No more SQLite query for recent sessions. No more topic-id-to-name lookup. (Simpler hook code AND fewer DB queries per chat send.)
- Combine `Focused exam` + `Streak` + `Today's accuracy` into one line with semicolon separators.
- Drop the `(no recent sessions)` and `(no stats available yet)` fallback handling — the line is just absent when stats aren't set.
- For the no-listing edge case (`!stats.listing`): keep the identity line, but the rest becomes `No focused exam yet. Pick one from Listings to get personalized advice.`

**Identity-line wording change:**
- From: `Student: Maria (Grade 11 student at UP Diliman).`
- To: `Student: Maria (Grade 11, UP Diliman).` (drop the word "student", combine grade + school with comma)

This shaves ~3 tokens per request.

---

## 4. Drop topic-mode context entirely

### Current state

`apps/mobile/hooks/useKuyaChat.ts` calls `buildTopicContext(db)` in topic mode (added in PR 5). The function returns `loadStudentIdentity(db)` — one identity line. `buildChatPrompt` then wraps it in a `[STUDENT CONTEXT]` block and prepends to the user message.

### Changes

1. **`apps/mobile/hooks/useKuyaChat.ts`:** topic-mode branch reverts to passing `undefined` instead of the identity line:
   ```ts
   const dataCtx = mode === 'progress'
     ? await buildProgressContext(db, stats)
     : undefined
   ```
2. **`apps/mobile/services/chatContext.ts`:** delete the `buildTopicContext` function export. Its only caller is the hook (now reverted).
3. **`apps/mobile/services/chatPrompts.ts`:** topic-mode `buildChatPrompt` already handles `dataContext` being undefined gracefully (PR 5 work). No additional changes needed.

### Why

For topic questions like "What is photosynthesis?" or "Solve x² = 16", knowing the student's name/grade/school adds zero value to the answer. It crowds the prompt with irrelevant context. The 1.5B model is more reliable when given less material to weigh.

---

## 5. Hard inference-level cap

### Current state

`apps/mobile/services/llm.ts` `streamChatInference`:
```ts
const params = {
  ...
  n_predict: 100,
  top_k: 40,
  ...
}
```

100 tokens is roughly 70-75 English words — enough room for a 3-4 sentence answer. The model fills the cap with hallucinated content when given conflicting instructions.

### Changes

Reduce `n_predict` from 100 to 60 in `streamChatInference` only.

- 60 tokens ≈ 45 words ≈ exactly 1-2 short sentences.
- If the model would have generated more, it gets physically cut off mid-sentence (the streaming pipeline handles this gracefully — the bubble just stops growing).
- `runInference` (MCQ generation, n_predict 400) **unchanged**.
- `runCoachInference` (n_predict 80) **unchanged**.

### Why

Belt + suspenders. If the prompt rule "Maximum 2 sentences" is ignored, the inference call physically prevents drift.

---

## 6. File map

**Modified files (3):**

| File | Changes |
|---|---|
| `apps/mobile/services/chatPrompts.ts` | Delete `TAGALOG_PRONOUN_RULE` constant. Rewrite both system prompts (English-only, ~80 words each). Math confidence rule retained but rephrased in English. |
| `apps/mobile/services/chatContext.ts` | Rewrite `buildProgressContext` to emit 3-line compact format. Drop the recent-sessions SQLite query. Delete `buildTopicContext` export. Update `loadStudentIdentity` identity-line wording. |
| `apps/mobile/hooks/useKuyaChat.ts` | Revert topic-mode `dataCtx` to `undefined` (no longer call `buildTopicContext`). Remove `buildTopicContext` from import. |
| `apps/mobile/services/llm.ts` | `streamChatInference`: change `n_predict: 100` → `n_predict: 60`. |

**Modified test files (3):**

| File | Changes |
|---|---|
| `apps/mobile/services/__tests__/chatPrompts.test.ts` | Delete the 2 "second-person Tagalog" tests. Update the math-rule test to assert English phrasing (`"Try it yourself first!"`). Update the "system prompts mention Kuya Baw and Taglish" test → assert English-only rule string (`"clear English"`) instead of `"Taglish"`. Drop assertion for `topic mode includes context block`. |
| `apps/mobile/services/__tests__/chatContext.test.ts` | Update `buildProgressContext` tests: assert the 3-line compact format (no "Recent sessions" line). Drop `Recent sessions (last 5)` assertion. Drop the entire `buildTopicContext` describe block. Drop the session-related tests since the function no longer queries practice_sessions. Update identity-line tests to assert new wording (`"Maria (Grade 11, UP)"` without the word "student"). |
| `apps/mobile/hooks/__tests__/useKuyaChat.test.ts` | If any test asserts `buildTopicContext` was called, update to assert it's NOT called (or that topic mode passes undefined). |

**Tests deleted from `chatContext.test.ts`:**
- `'includes recent practice sessions joined with topic names, ordered most-recent-first'`
- `'emits "(no recent sessions)" when practice_sessions is empty'`
- `'handles sessions whose topic was deleted (falls back to "mixed practice")'`
- Entire `'buildTopicContext'` describe block

Total tests touched: ~10 deleted, ~5 updated, ~0 added.

---

## 7. Testing approach

**Unit tests (Jest):**
- `chatPrompts`: both system prompts contain `"clear English"`, NOT `"Taglish"`. Topic prompt contains `"Try it yourself first!"`, NOT `"Subukan mo muna"`. No assertions about second-person Tagalog pronouns.
- `chatContext.buildProgressContext`: output is exactly 3 lines (Student / Exam-stats / Weak topics). No "Recent sessions" string anywhere. Single SQLite query for `userSettings` only.
- `useKuyaChat`: in topic mode, `dataCtx` is `undefined` (existing mock should already cover this).

**No new tests for `n_predict` change** — that's a constant value tweak; the existing inference tests don't assert on it. Verified manually on-device.

**Manual on-device validation (post-OTA):**
1. Ask "Anong dapat kong i-focus today?" → reply is **English**, 1-2 sentences, names a specific weak topic.
2. Ask "What is photosynthesis?" → 1-2 sentence English explanation.
3. Ask "Solve x² + 5x = 24" → "Try it yourself first!" + 1-sentence concept.
4. Ask "What's 12 × 8?" → "96" + brief reason or context.
5. Ask "Anong photosynthesis?" → **English** explanation (NOT Tagalog).
6. Ask "Am I on track for the exam?" → uses Today's accuracy + days left from context, 1-2 sentences.
7. Verify NO response exceeds ~50 words (the n_predict cap enforces this physically).

---

## 8. Rollout

Single OTA:

```bash
cd apps/mobile
eas update --branch preview --environment preview \
  --message "fix(mobile): chat english-only + concise + n_predict cap"
```

No version bump. No native module change. Targets v1.1.0 APK.

---

## 9. Out of scope

- Upgrading to a larger model (Qwen 7B, Llama 3.2 3B) — would require a native rebuild + much larger download, separate project.
- Multi-language toggle (user-configurable English vs Taglish) — premature without first proving English-only works.
- Streaming token-by-token UI animations — already works fine via existing FLUSH_INTERVAL_MS.
- Adding chat history persistence across sessions — separate feature.
- Few-shot prompting (showing example Q→A pairs in the system prompt) — adds tokens for marginal model gain; revisit if English-only still has issues.
- Server-side LLM fallback (when local LLM fails, route to Gemini/Claude API) — separate project.
- Customizing how `Math.PI`, `√`, etc. render in chat bubbles — markdown polish, future work.
