# AI Coach (Kuya Baw) Design

## Overview

Replace the static Taglish template on the Home dashboard with a personalized AI Coach powered by the locally-downloaded Qwen 2.5 1.5B Instruct model. The mascot becomes tappable — each tap shows a new phrase pulled from a pre-generated queue, making the swap feel instant. Phrases are generated from the user's profile, focused listings, weak topics, streak, today's accuracy, and exam-requirement progress.

The system is engineered so that **the coach never causes lag, flicker, or jank during navigation**. A three-layer fallback chain guarantees a phrase is always available without a database round trip; AI work happens between interactions via `InteractionManager`.

---

## 1. Categories & language

Six phrase categories, all in **Taglish — warm, casual, supportive older-sibling tone** matching the existing Kuya Baw mascot:

| Category | Trigger / data source |
|---|---|
| `motivation` | General push, used when no other category has stronger signal |
| `weak_area` | References the lowest-accuracy topic from `useHomeStats.weakTopics[0]` |
| `exam_countdown` | References `useHomeStats.daysLeft` for the focused listing |
| `streak` | References `useHomeStats.streakDays` and `todayAccuracy` |
| `requirements` | References acquired-vs-total requirements (new tracking table) |
| `daily_reminder` | Active when user has zero practice entries for today |

Each category produces one or two short Taglish sentences. Phrases optionally end with a single emoji.

---

## 2. Architecture: 3-layer fallback chain

`useAiCoach()` returns `{ phrase: string, onTap: () => void }`. The phrase is sourced via this priority chain:

**Layer 1 — Static template (RAM, zero latency).**
~15 hand-written Taglish templates in `services/coachTemplates.ts` that interpolate `HomeStats` fields. `pickTemplate(stats, ringIndex)` rotates through them deterministically. Available without the AI model. Always renders on first mount before any DB or LLM work.

**Layer 2 — Persisted AI queue (SQLite, ~5ms).**
`coach_phrases` rows from the previous session. Loaded once at app start by `AiCoachProvider`. Survives tab switches and process restarts. Stale rows pruned on launch (see context-hash invalidation below).

**Layer 3 — Live AI generation (background, 2-5s per phrase).**
`runCoachInference()` produces phrases one at a time using the persistent llama context. Each completion inserts into `coach_phrases` and (if Home is mounted) updates the in-memory queue.

**Tap behavior:** the next phrase is the first unconsumed AI phrase in queue, or — if the queue is empty — the next template from the Layer 1 ring. After each consumption, schedule a Layer 3 refill for that category. Taps are debounced at 300 ms.

---

## 3. Performance hardening

Six rules built into the design to protect navigation smoothness:

1. **Persistent llama context, single-flight inference.** `services/llm.ts` is refactored to hold a module-level `LlamaContext | null` singleton. Lazy-init on first call, reused across both coach and flashcard enhancement. A shared `Promise`-chain mutex serializes inference so the two workloads never run simultaneously.
2. **Idle-time scheduling.** Every coach generation request is wrapped in `InteractionManager.runAfterInteractions` so it waits for pending animations and transitions to finish. Navigation, scrolls, and taps complete first.
3. **Staggered batch on app launch.** Generate phrase 1 immediately (priority category), then space refills with `setTimeout(800ms)` between completions. Queue fills over ~30 s in the background, never as a burst.
4. **Read-only Home render path.** `useAiCoach()` returns from in-memory state populated by `AiCoachProvider`. SQLite is touched once at app start. Navigating to Home triggers zero DB reads. Re-mounting Home returns the same memoized phrase.
5. **AppState-aware context release.** Listen to `AppState`. After 60 s in background, call `context.release()` to free the ~1.5 GB. Lazy-init on next foreground.
6. **Focus-guarded state updates with `requestAnimationFrame`.** Generation completion callbacks check `isFocusedRef.current` before `setState`, and wrap setters in `requestAnimationFrame` so updates land on the next paint frame, never mid-transition.

**Net effect:** the mascot phrase is always available instantly. Cold launch UX is carried by Layer 1 templates while Layer 3 fills in. Worst-case device load is one model load + 6 short inferences over ~30 s, none competing with user interaction.

---

## 4. Schema additions

Two new local-only SQLite tables. Neither syncs to Supabase.

```ts
// apps/mobile/db/schema.ts
export const coachPhrases = sqliteTable('coach_phrases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(),     // 'motivation' | 'weak_area' | 'exam_countdown' | 'streak' | 'requirements' | 'daily_reminder'
  text: text('text').notNull(),
  generatedAt: integer('generated_at').notNull(),
  contextHash: text('context_hash').notNull(),
  consumed: integer('consumed', { mode: 'boolean' }).notNull().default(false),
}, t => [index('coach_phrases_consumed_idx').on(t.consumed, t.generatedAt)])

export const userRequirements = sqliteTable('user_requirements', {
  listingSlug: text('listing_slug').notNull(),
  requirementIndex: integer('requirement_index').notNull(),
  acquiredAt: integer('acquired_at').notNull(),
}, t => [primaryKey({ columns: [t.listingSlug, t.requirementIndex] })])
```

**`contextHash`** is a short hash of `daysLeft|weakTopic.id|streakDays|todayAccuracy|acquiredCount`. On app launch, phrases whose hash no longer matches today's stats are pruned — prevents stale streak-celebrations or outdated weak-area nudges.

**Consumed phrases** remain in the table for 24 h then are GC'd. This dedup window avoids showing the same phrase twice within a short time.

`db/client.ts` gets 3 new MIGRATIONS appended (2 `CREATE TABLE IF NOT EXISTS` + 1 `CREATE INDEX IF NOT EXISTS`). Idempotent on existing installs.

---

## 5. Prompt design

**System prompt (constant across all categories):**

```
You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship
applicants. Speak in Taglish — casual mix of English + Filipino, like a
supportive older sibling. Use one or two short sentences. Optionally end
with one emoji. Output ONLY the phrase. No quotes, no markdown, no JSON,
no explanation, no labels.
```

**User-prompt skeletons by category:**

| Category | User prompt |
|---|---|
| `motivation` | `Goal: {listing.title} in {daysLeft} days. Streak: {streakDays}. Write a short motivational nudge to start today.` |
| `weak_area` | `Goal: {listing.title}. Weakest topic: {weakTopic.name} at {weakTopic.accuracy}%. Write a short, kind suggestion to focus there today.` |
| `exam_countdown` | `Exam: {listing.title} in {daysLeft} days. Match tone: >30 days relaxed, 7–30 focused, <7 intense.` |
| `streak` | `Streak: {streakDays} days. Today's accuracy: {todayAccuracy}%. Praise their consistency.` |
| `requirements` | `For {listing.title}: acquired {acquiredCount}/{totalRequirements}. Remaining: {remainingList[0..2]}. Write a short reminder. If all done, congratulate.` (Skipped entirely when `listing.requirements.length === 0` — no requirements to track.) |
| `daily_reminder` | `Goal: {listing.title} ({daysLeft} days left). They haven't practiced yet today. Write a friendly nudge to review a few cards.` |

**ChatML wrapping** is identical to the existing `buildPrompt()` in `services/llm.ts`:
```
<|im_start|>system\n{systemPrompt}<|im_end|>\n<|im_start|>user\n{userPrompt}<|im_end|>\n<|im_start|>assistant\n
```

**Inference config:** `n_predict: 80`, `temperature: 0.7` (higher than MCQ's 0.1 — we want variety across taps), `stop: ['<|im_end|>', '</s>', '\n\n']`.

**Output validation pipeline** (`parseCoachPhrase`):
1. Trim, strip surrounding quotes / asterisks / backticks
2. Reject if empty, < 10 chars, > 280 chars, contains `{` or `}` (JSON leak), or contains `<|`
3. Strip trailing newlines, normalize whitespace
4. Return `string` or `null` → caller falls back to next template

A new exported `runCoachInference(prompt: string): Promise<string | null>` in `services/llm.ts` reuses the persistent context but bypasses the MCQ-shaped `parseResponse`. The existing `runInference()` keeps its current `LlmOutput` return shape (unchanged API).

---

## 6. Requirements checklist UI

A new section on the listing detail screen lets users mark which exam requirements they've acquired. This populates the `requirements` coach category.

**New file:** `apps/mobile/components/RequirementsChecklist.tsx`
- Renders one row per item in `listing.requirements` (the existing JSON array column)
- Each row is a `Pressable` with a checkmark icon; tap inserts/deletes a `user_requirements` row
- Shows a progress count at the top: `3 of 5 acquired`
- Empty state when listing has no requirements: render nothing

**Modified file:** `apps/mobile/app/listings/[slug].tsx` — mount `<RequirementsChecklist listingSlug={slug} requirements={listing.requirements} />` below the listing description.

The coach reads acquired counts via a small helper in `services/coachQueue.ts` that joins `user_requirements` against the focused listing's `requirements.length`.

---

## 7. File layout

**New files (10):**

| File | Responsibility |
|---|---|
| `apps/mobile/services/coachPrompts.ts` | System prompt constant + 6 user-prompt builders keyed by category |
| `apps/mobile/services/coachTemplates.ts` | ~15 hand-written Taglish templates, `pickTemplate(stats, i)` rotator |
| `apps/mobile/services/coachQueue.ts` | DB layer for the queue — pure functions, no React |
| `apps/mobile/hooks/useAiCoach.ts` | The hook Home consumes — `{ phrase, onTap }` |
| `apps/mobile/providers/AiCoachProvider.tsx` | Top-level provider — owns queue, runs initial load, schedules refills, AppState listener |
| `apps/mobile/components/RequirementsChecklist.tsx` | Checklist UI on listing detail screen |
| `apps/mobile/services/__tests__/coachPrompts.test.ts` | Each category produces correct ChatML + interpolation |
| `apps/mobile/services/__tests__/coachTemplates.test.ts` | All 15 templates render for edge cases; rotator is deterministic |
| `apps/mobile/services/__tests__/coachQueue.test.ts` | Prune, GC, FIFO consumption order |
| `apps/mobile/hooks/__tests__/useAiCoach.test.ts` | Layer 1 immediately, swap to AI when ready, tap debounce |

**Modified files (5):**

| File | Change |
|---|---|
| `apps/mobile/services/llm.ts` | Persistent `LlamaContext` singleton, shared inference mutex, `runCoachInference()`, `parseCoachPhrase()`, AppState-based release. Existing `runInference()` API unchanged. |
| `apps/mobile/db/schema.ts` | Add `coachPhrases` + `userRequirements` tables |
| `apps/mobile/db/client.ts` | Append 3 new MIGRATIONS (2 CREATE TABLE + 1 index) |
| `apps/mobile/app/_layout.tsx` | Wrap existing tree with `<AiCoachProvider>` |
| `apps/mobile/app/(tabs)/index.tsx` | Replace static `kuyaMsg`: mascot becomes `<Pressable>` calling `onTap` from `useAiCoach()`; phrase renders with 150 ms opacity crossfade |
| `apps/mobile/app/listings/[slug].tsx` | Mount `<RequirementsChecklist />` below listing description |

---

## 8. Testing approach

**Unit tests (Jest, no native modules):**
- `coachPrompts.test.ts` — ChatML structure + stat interpolation for all 6 categories
- `coachTemplates.test.ts` — 15 templates render for edge inputs (no listing, no streak, missing weak topics); rotator deterministic
- `coachQueue.test.ts` — prune-by-contextHash, 24h GC of consumed, FIFO consumption order, `markConsumed` does not delete
- `useAiCoach.test.ts` — Layer 1 renders on first mount, swaps to AI after queue populates, 300 ms tap debounce, `isFocused=false` blocks state updates

**Integration test (light):**
- `AiCoachProvider.test.tsx` — mock `runCoachInference` to return canned phrases. Assert staggered generation timing, mutex respected against mocked `runEnhancement`, context released after `AppState` background event

**Out of scope** (manual on-device verification):
- Phrase coherence and tone quality (subjective)
- Real RAM release on background (Android-specific, verified via `adb shell dumpsys meminfo`)
- Tap latency under heavy load (guaranteed by §3 architecture)

---

## 9. Rollout safety

- All three layers ship together — no feature flag. If LLM generation fails for any reason, Layer 1 templates carry the UX. Users without the model installed get the same Layer 1 experience as before, just nicer (templates now interpolate more stats).
- Coach generation is gated behind `modelExists()`. Zero cost on devices without the model.
- Persistent `LlamaContext` is the riskiest internal change because it touches existing flashcard enhancement. Mitigation: the change is internal to `services/llm.ts` (existing `runInference()` callers see no API change). A small benchmark in the test suite asserts the second back-to-back inference call is faster than the first, proving context reuse works.

---

## 10. Out of scope

- Multi-turn conversation with the coach (this is one-way tap-to-phrase)
- Voice / audio output
- Coach phrases referencing peers, rankings, or social data
- Server-side phrase generation
- Cross-device sync of coach phrases or requirements (both are local-only)
- Localization beyond Taglish (could be added later via a language selector)
