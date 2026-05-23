# Ask Kuya Baw Chat (Phase 1) Design

## Overview

Add a single-turn streaming chat to the Kuya Baw mascot. From the existing AI Coach card on Home, a new "💬 Ask" pill opens a full-screen modal where the student can ask Kuya questions in two modes:

- **My progress** — answers reference the student's stats (focused listing, days left, streak, today's accuracy, top weak topics, last 5 practice sessions)
- **A topic** — answers explain UPCAT/scholarship concepts. Refuses to solve math problems, redirects to "try it yourself, here's the concept."

Each question is a fresh single-turn generation — no multi-turn history, no SQLite persistence. The thread on screen is RAM only and wipes on modal close. Phase 1 deliberately avoids multi-turn coherence concerns inherent to a 1.5 B model.

The feature reuses every piece of infrastructure from the AI Coach: persistent llama context, shared FIFO mutex (so chat, coach, and flashcard enhancement never contend), `InteractionManager` idle scheduling, AppState-aware context release.

---

## 1. Surface & entry point

- A new pill **"💬 Ask"** is added inside the existing `AiModelBanner.tsx` Kuya Baw card, sitting next to the existing "AI Coach" badge.
- The pill is **enabled** only when `modelStatus === 'ready'`. When disabled (model not yet downloaded), tapping the pill shows a small toast/snackbar "Install AI Reviewer first" with a "Get it" action that navigates to the Practice tab. (React Native doesn't have tooltips out of the box — use a transient toast component or a short `Alert.alert`.)
- Tap opens `<AskKuyaModal>` — a full-screen `Modal` with `animationType="slide"` and `transparent={false}` (same convention as the AI Reviewer download sheet).
- The existing **tap-mascot → cycle phrase** behavior is unchanged. The chat is additive.

---

## 2. Modal layout

```
┌────────────────────────────────────────┐
│ ← Back        Kuya Baw          ✕      │  ← header with small mascot
├────────────────────────────────────────┤
│   [ My progress ] [ A topic ]          │  ← segmented toggle
├────────────────────────────────────────┤
│   you · 10:32                          │
│   ┌──────────────────────────────┐     │  ← user bubble (right)
│   │ Anong dapat kong i-focus    │     │
│   │ ngayong week?                │     │
│   └──────────────────────────────┘     │
│                                        │
│   Kuya Baw · 10:32                     │  ← assistant bubble (left)
│ ┌──────────────────────────────┐       │
│ │ Based sa stats mo, mahina    │       │
│ │ ka pa sa Algebra (42%). Try  │       │
│ │ mo mag-focus...▍              │       │  ← blinking cursor while streaming
│ └──────────────────────────────┘       │
│                                        │
│   💡 Try asking:                       │  ← only when input empty
│   • Anong mas kailangan kong improve?  │
│   • How am I doing this week?          │
├────────────────────────────────────────┤
│ ┌────────────────────────┐ ┌────────┐  │
│ │ Tanong mo kay Kuya...  │ │ Send → │  │
│ └────────────────────────┘ └────────┘  │
└────────────────────────────────────────┘
```

### UI behaviors

- **Streaming feedback** — assistant bubble appends one token at a time. A blinking `▍` cursor at the tip shows in-progress state, removed on completion. `FlatList` auto-scrolls to bottom on each flush via a 60 ms throttle.
- **Send button states** — *idle* (red filled with arrow), *streaming* (red filled with stop square — tap to abort), *disabled* (greyed when input is empty).
- **Mode toggle** — locks during streaming (greyed pills). Resets to "My progress" each modal open.
- **Suggested questions** — 3 chips per mode. Visible only when the input is empty AND not streaming. Tap = fills the input (no auto-send — lets the user edit before sending).
- **Empty state on first open** — small mascot hero + "Hi! Ask me about your progress or any UPCAT topic." + the 3 chips for the active mode.
- **Backdrop / back-button dismissal** — `onRequestClose` triggers abort + clears thread.
- **Accessibility** — bubbles `accessibilityRole="text"`, send button `accessibilityRole="button"` with state-appropriate label, streaming text wrapped in `accessibilityLiveRegion="polite"` for screen readers.

---

## 3. Architecture & data flow

Each tap of "Send" is a **single-turn generation**. The on-screen thread is visual context for the human reader; the model only ever sees `system + (optional data context) + the new question`.

**Per-question flow:**

1. User types question, taps Send → `useKuyaChat.send(text)`
2. Hook pushes user message to thread, sets `isStreaming = true`, locks mode toggle
3. Hook builds prompt via `buildChatPrompt(mode, question, dataCtx?)`
4. Hook calls `streamChatInference(prompt, onToken, signal)` in `services/llm.ts`
5. As each `TokenData` arrives, hook appends to a buffer; a 60 ms `requestAnimationFrame`-aligned timer flushes the buffer into the in-progress assistant message state
6. Native completion resolves OR the AbortController fires → hook sets `isStreaming = false`, unlocks toggle, chips reappear
7. On modal close OR app background: `signal.abort()` halts the visible stream

`AiCoachProvider` is **unchanged**. Chat and coach both share the persistent llama context via the existing mutex in `llm.ts` — no coordination logic needed beyond the FIFO ordering the mutex already provides.

---

## 4. Modes & system prompts

Both prompts share the Kuya Baw voice and use the existing ChatML envelope:
`<|im_start|>system\n…<|im_end|>\n<|im_start|>user\n…<|im_end|>\n<|im_start|>assistant\n`.

### Mode A — "My progress"

```
You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship
applicants. Speak in Taglish — casual mix of English + Filipino, like a
supportive older sibling. Answer the student's question using ONLY the
context block below. If the answer isn't in the context, say "Wala pa
akong info diyan, sorry!" — never make up stats. Keep answers under 3
short sentences. End with one specific action they can take today.

[STUDENT CONTEXT]
Focused exam: {listing.title} in {daysLeft} days
Streak: {streakDays} days
Today's accuracy: {todayAccuracy}%
Top weak topics: {weakTopics joined as "name (acc%)"}
Recent sessions (last 5):
  - {date}: {topic} — {score}/{total}
  - …

[QUESTION]
{user's question}
```

Context budget ≈ 350 tokens, leaving ≈ 1500 for the answer in a 2048-token window.

### Mode B — "A topic"

```
You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship
applicants. Speak in Taglish — casual mix of English + Filipino, like a
supportive older sibling. Explain concepts clearly with one short example.

IMPORTANT RULES:
- If the student asks you to SOLVE a math problem, DO NOT solve it.
  Instead say "Subukan mo muna! Pero here's the concept:" then explain
  the relevant formula or approach.
- If you don't know the answer, say "Hindi ko sure 'to, baka mas okay
  i-check sa textbook." Never make up facts.
- Keep answers under 4 sentences. One concrete example if helpful.

[QUESTION]
{user's question}
```

A lightweight regex heuristic in `chatPrompts.ts` detects math-solve requests via patterns like `\bsolve\b`, `\bsimplify\b`, `\bevaluate\b`, `\bcompute\b`, `\bfind\s+x\b`, `=\s*\?`. On match, the user message is prepended with `(Note: refuse to solve, only explain.)` as a belt-and-suspenders signal alongside the system rule.

### Inference parameters

| Param | Value | Reason |
|---|---|---|
| `n_predict` | 250 | Bounded answer length — ~25 s on mid-range Android |
| `temperature` | 0.5 | Coherent but not robotic; between coach 0.7 and MCQ 0.1 |
| `top_p` | 0.9 | Standard |
| `repeat_penalty` | 1.1 | Reduce token loops |
| `stop` | `['<\|im_end\|>', '</s>', '<\|im_start\|>']` | Standard Qwen ChatML stops |

### Suggested questions (rendered as tappable chips)

**My progress mode:**
- "How am I doing this week?"
- "Anong dapat kong i-focus today?"
- "Am I on track for the exam?"

**Topic mode:**
- "Ano ang photosynthesis?"
- "Explain Newton's 3rd law"
- "What is a topic sentence?"

---

## 5. Performance & failure modes

### Latency targets (mid-range Android, ~10 tok/s Qwen 1.5B Q4)

| Stage | Time | UX impact |
|---|---|---|
| Cold start (context not loaded) | 1–3 s before first token | "Thinking…" placeholder |
| Warm start (context already in memory) | <300 ms before first token | Cursor appears immediately |
| Full answer (250 tokens) | 20–25 s end-to-end | Streaming makes it feel responsive |
| User reading speed (≈150 wpm) | ~25 s for a 60-word answer | Reading ≈ generation = sweet spot |

Streaming is the entire UX gamble. Without it, a 25-second blank screen would be unusable. With it, a steady stream of Taglish words makes the wait feel acceptable.

### Six performance rules (extends AI Coach §3)

1. **Reuse persistent llama context** — `streamChatInference` calls existing `getContext()` in `services/llm.ts`. Cold-start cost paid once across coach + MCQ + chat.
2. **Mutex shared with coach and enhancement** — chat goes through the same `withMutex()` wrapper. If enhancement is mid-card, chat waits ~2–5 s. Honest serialization trade-off.
3. **AbortController-based cancellation** — `streamChatInference(prompt, onToken, signal)` polls `signal.aborted` inside the token callback. When aborted, returns the partial completion immediately. Native generation may continue briefly until `n_predict` or stop tokens, but the UI is already free.
4. **`InteractionManager`-wrapped send** — `send()` wraps the actual `streamChatInference` call so the modal slide animation completes before inference starts.
5. **Token-callback throttling** — UI updates batch every 60 ms via `requestAnimationFrame` rather than per-token to avoid React thrash. Buffer accumulates tokens between flushes.
6. **AppState aware** — `useKuyaChat` registers an `AppState.addEventListener('change', …)` while the modal is open. On `background` or `inactive`, it calls `abort()` on the current AbortController. On return to `active`, partial answer remains visible, `isStreaming = false`, Send button is re-enabled.

### Failure modes

| Scenario | Handling |
|---|---|
| Model not downloaded | "Ask" pill disabled with tooltip "Install AI Reviewer first" linking to Practice download flow |
| Inference throws (native crash, OOM) | `llm.ts` catches, releases context, re-throws. Hook shows inline red error "Kuya Baw can't answer right now. Try again sa moment." |
| Empty / whitespace-only output | Hook detects post-stream and shows "Hmm, hindi ko ma-process yan. Try mong i-rephrase!" |
| User taps Send while previous streams | Button is locked during streaming — no race possible |
| Math problem in tutor mode | System prompt + regex heuristic refuse. If model still attempts, a banner below the answer reads "⚠️ Always verify the math" |
| AppState backgrounds mid-stream | Abort fires. Partial answer kept. Foreground returns with `isStreaming = false` and Send re-enabled |
| Low-memory event | Abort current stream, release context, show "Naka-restart si Kuya. Try ulit sa konting saglit." |

### Quality watchpoints (manual on-device validation, not test-gated)

- Math refusal: does the model honor "Subukan mo muna" reliably? If <80 % adherence, tighten regex.
- Taglish coherence: existing coach phrases prove yes for short outputs; verify at 250-token length.
- Filipino-subject accuracy (Panitikan, Wika): risk area — Qwen's Filipino-language training is thin. Needs real student testing.

---

## 6. File layout

### New files

| File | Responsibility |
|---|---|
| `apps/mobile/services/chatPrompts.ts` | Pure: two system prompts + `buildChatPrompt(mode, question, dataCtx?)` + math-detect heuristic + `parseChatChunk` (filters ChatML mid-stream leak) |
| `apps/mobile/services/chatContext.ts` | Pure DB: `buildProgressContext(db, stats)` — queries last 5 `practice_sessions`, joins topic names, formats into prompt-ready string |
| `apps/mobile/hooks/useKuyaChat.ts` | Hook the modal consumes — owns `{ mode, setMode, messages, send, abort, isStreaming }`, AbortController, 60 ms RAF throttle |
| `apps/mobile/components/AskKuyaModal.tsx` | Full-screen Modal — header, mode toggle, FlatList of bubbles, streaming cursor, input row, chips, empty state |
| `apps/mobile/components/ChatBubble.tsx` | Single bubble renderer — user vs assistant variants, accessibility, in-progress cursor |
| `apps/mobile/services/__tests__/chatPrompts.test.ts` | System prompt invariants, ChatML envelope, mode data injection, math heuristic positive/negative, `parseChatChunk` |
| `apps/mobile/services/__tests__/chatContext.test.ts` | `better-sqlite3` in-memory; verifies last-5 ordering, topic join, empty case |
| `apps/mobile/hooks/__tests__/useKuyaChat.test.ts` | Mode switch resets, `send` appends messages, abort preserves partial, throttle batching, empty output handling |

### Modified files

| File | Change |
|---|---|
| `apps/mobile/services/llm.ts` | Add `streamChatInference(prompt, onToken, signal): Promise<string>` reusing persistent context + mutex (~25 lines) |
| `apps/mobile/services/__tests__/llm.test.ts` | 2 new tests: token callback fires; abort halts visible streaming |
| `apps/mobile/components/AiModelBanner.tsx` | Add "💬 Ask" pill next to AI Coach badge — disabled when not ready; tap opens AskKuyaModal |
| `apps/mobile/app/(tabs)/__tests__/home.test.tsx` | Update mock if existing assertions break on the new pill |

---

## 7. Out of scope (Phase 2 / 3 candidates)

- Multi-turn conversation memory (each Send is independent)
- Persisted chat history across modal closes / app restarts
- Subject picker dropdown for tutor mode
- Voice input / TTS output
- Conversation summarization
- Server-side fallback when the local model fails
- Larger model (3 B+) for stronger math reasoning
