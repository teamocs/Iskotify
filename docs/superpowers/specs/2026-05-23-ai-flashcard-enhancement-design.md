# AI Flashcard Enhancement Design

## Overview

Enhance the flashcard system in two ways: (1) remove the `difficulty` field entirely from all layers, and (2) integrate Qwen 2.5 1.5B Instruct (via `react-native-llama`) to regenerate MCQ distractors and explanations on-device using same-topic cards as context. Enhancement runs silently in the background after sync. Admin content is never overwritten — AI results live in separate local-only SQLite columns.

---

## 1. Difficulty Field Removal

Remove `difficulty` from every layer it currently appears:

- **Supabase** — `ALTER TABLE flashcards DROP COLUMN IF EXISTS difficulty`
- **Local SQLite** — remove from Drizzle schema, generate migration
- **Admin review page** — remove column from card table rows, remove dropdown from edit form
- **Admin Gemini prompt** — remove `difficulty` from the expected JSON shape
- **Mobile quiz screens** — remove any difficulty-based badge, color, or label from all 3 practice screens (`[topicId].tsx`, `listing/[slug].tsx`, `deck/[deckId].tsx`)

---

## 2. Schema: Local-Only AI Fields

Four new nullable columns added to the local `flashcards` SQLite table via a Drizzle migration. These columns are **never synced to Supabase** — they are local-only and survive re-syncs unchanged.

| Column | Type | Default | Purpose |
|---|---|---|---|
| `aiOptions` | text (JSON `string[]`) | null | 4 AI-generated MCQ options |
| `aiCorrectIndex` | integer | null | Index of correct answer in `aiOptions` |
| `aiExplanation` | text | null | AI-generated explanation |
| `aiEnhancedAt` | integer | null | Unix timestamp of last enhancement; `null` = not yet enhanced |

Cards arriving from Supabase always have `aiEnhancedAt = null` on first insert. The sync layer never touches these four columns on subsequent syncs unless the card's `remoteUpdatedAt` changed — in which case `aiEnhancedAt` is reset to null so the enhancement job re-runs for that card.

---

## 3. Model Download Flow

### Trigger
When the user navigates to the Practice tab and the Qwen model is not yet on-device (`modelExists() === false`).

### RAM Check
Before showing any prompt, check available RAM. If device has < 2 GB, the download banner never appears and the enhancement pipeline is silently skipped — the app falls back to admin-authored content.

### UI
A non-blocking banner at the top of the Practice screen (not a modal, does not block navigation):

> *"Enable AI-enhanced practice — Download Qwen 2.5 1.5B Instruct (~1 GB)"*

Tapping the banner opens a bottom sheet with:
- Model name and size (~1 GB, GGUF Q4_K_M quantization)
- RAM requirement note (≥ 2 GB)
- **Download** and **Not now** buttons

### Download Behavior
- Uses `react-native-background-downloader` — download continues when user navigates away
- A persistent mini progress bar appears at the bottom of the Practice screen while downloading
- The Practice tab icon shows a subtle activity indicator during download

### Completion
On download complete:
- In-app notification fires: *"AI is ready! Your flashcards are now being enhanced."*
- Background enhancement job starts immediately for all cards where `aiEnhancedAt` is null

---

## 4. Background Enhancement Job

### Triggers
The enhancement job runs when:
1. Model download completes (enhances all unenhanced cards)
2. After each Supabase sync that produces new or updated cards (enhances only new/reset cards)

### Process
For each card where `aiEnhancedAt` is null:

1. Load up to 10 Q&A pairs from the same topic (excluding the card being enhanced) as context
2. Run Qwen 2.5 1.5B Instruct inference with the prompt below
3. Parse JSON response
4. Shuffle the 4 options (correct + 3 distractors), tracking the new correct index
5. Write `aiOptions`, `aiCorrectIndex`, `aiExplanation`, `aiEnhancedAt = Date.now()` to local SQLite

### LLM Prompt

```
You are helping a Philippine student prepare for [exam / topic name].

Question: [question]
Correct Answer: [answer]

Related questions from the same topic (for context):
- Q: [q1] A: [a1]
- Q: [q2] A: [a2]
... (up to 10)

Task:
1. Generate exactly 3 incorrect but plausible answer choices that are relevant to the topic and could be confused with the correct answer. Do not make them obviously wrong.
2. Write a 2–3 sentence explanation of why the correct answer is right.

Respond only with valid JSON:
{
  "distractors": ["distractor1", "distractor2", "distractor3"],
  "explanation": "..."
}
```

### Robustness
- Job runs one card at a time at low CPU priority
- If the model returns malformed JSON or an error, the card is skipped (retried on next sync)
- Job pauses if the app enters a low-memory state
- Already-enhanced cards (`aiEnhancedAt` not null) are skipped unless `remoteUpdatedAt` changed on last sync

---

## 5. Quiz Display Logic (`mcDistractors.ts`)

Updated priority chain — no changes to the three quiz screens themselves:

| Priority | Condition | Source |
|---|---|---|
| 1 | `aiOptions` + `aiCorrectIndex` present | AI-generated |
| 2 | `options[]` + `correctAnswerIndex` present | Admin-authored |
| 3 | `A. … B. … C. … D. …` embedded in question text | Parsed |
| 4 | Pool of other cards' answers in topic | Synthetic fallback |

**Explanation reveal** (post-answer): use `aiExplanation` if present, else admin `explanation`, else show nothing.

---

## 6. Files Affected

| File | Change |
|---|---|
| `supabase/migrations/009_remove_difficulty.sql` | Drop `difficulty` column |
| `apps/mobile/db/schema.ts` | Remove `difficulty`; add `aiOptions`, `aiCorrectIndex`, `aiExplanation`, `aiEnhancedAt` |
| `apps/mobile/db/migrations/` | New Drizzle migration for schema change |
| `apps/mobile/services/sync.ts` | Remove `difficulty` from SELECT query and upsert mapping; reset `aiEnhancedAt = null` when `remoteUpdatedAt` changed |
| `apps/mobile/utils/mcDistractors.ts` | Update priority chain to prefer AI fields |
| `apps/mobile/services/llm.ts` (new) | `react-native-llama` wrapper: Qwen 2.5 1.5B Instruct GGUF, model existence check, RAM check, inference, JSON parsing |
| `apps/mobile/hooks/useAiEnhancement.ts` (new) | Background enhancement job: trigger logic, card iteration, SQLite writes |
| `apps/mobile/hooks/useModelDownload.ts` (new) | Download state, progress, completion notification via `expo-notifications` |
| `apps/mobile/app/(tabs)/practice.tsx` | Add model download banner + progress bar |
| `apps/mobile/app/practice/[topicId].tsx` | Remove difficulty display |
| `apps/mobile/app/practice/listing/[slug].tsx` | Remove difficulty display |
| `apps/mobile/app/practice/deck/[deckId].tsx` | Remove difficulty display |
| `apps/admin/app/api/flashcards/process/[id]/route.ts` | Remove `difficulty` from Gemini prompt and response shape |
| `apps/admin/app/admin/flashcards/review/[jobId]/page.tsx` | Remove difficulty column from card table and edit form |

---

## 7. Out of Scope

- Storing raw PDF text chunks for richer LLM context (admin-managed separately, future enhancement)
- Syncing AI-enhanced content back to Supabase
- Server-side AI enhancement
- Re-generating the question text itself (only distractors and explanation are regenerated)
- iOS support for `react-native-background-downloader` differences (handle in implementation)
