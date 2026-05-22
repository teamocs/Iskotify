# AI Flashcard Enhancement Design

## Overview

Enhance the flashcard system in two ways: (1) remove the `difficulty` field entirely from all layers, and (2) integrate Qwen 2.5 1.5B Instruct (via `llama.rn`) to regenerate MCQ distractors and explanations on-device using same-topic cards as context. Enhancement runs silently in the background after sync. Admin content is never overwritten — AI results live in separate local-only SQLite columns with a cache-first lookup that costs zero battery on repeat views.

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

## 3. Native Module: `llama.rn`

### Package
Use **`llama.rn`** — the official React Native bindings for `llama.cpp`. This is the correct package for running GGUF models (including Qwen) entirely offline on Android and iOS.

> **Expo requirement:** `llama.rn` contains native C/C++ code and **cannot run in Expo Go**. The app must use an **Expo Development Build** (via `expo prebuild` + EAS Build). This is already the case since the app uses EAS for APK builds.

### Model File
- **Model:** Qwen 2.5 1.5B Instruct, GGUF Q4_K_M quantization
- **Size:** ~950 MB
- **Source:** Downloaded on-demand from a CDN or HuggingFace repository to `FileSystem.documentDirectory` — **never bundled inside the APK/IPA** (app stores reject packages that large)
- **Storage path:** `{FileSystem.documentDirectory}models/qwen2.5-1.5b-instruct-q4_k_m.gguf`

### Thread Safety
LLM initialization and inference **must run on a native background thread** managed by `llama.rn`. Never call inference on the React Native JS thread — doing so freezes the UI, halts quiz timers, and breaks button interactions. `llama.rn` handles this via its native module architecture; no extra threading code is needed beyond calling the async API correctly.

---

## 4. Model Download Flow

### Trigger
When the user navigates to the Practice tab and the model file does not exist at its storage path (`modelExists() === false`).

### RAM Check
Before showing any prompt, check available device RAM. If RAM < 2 GB, the download banner never appears and the enhancement pipeline is silently skipped — the app falls back to admin-authored content permanently on that device.

### UI
A non-blocking banner at the top of the Practice screen (not a modal, does not block navigation):

> *"Enable AI-enhanced practice — Download Reviewer Engine (~950 MB)"*

Tapping the banner opens a bottom sheet with:
- Model name: Qwen 2.5 1.5B Instruct (Q4_K_M)
- Download size: ~950 MB
- RAM requirement note: ≥ 2 GB
- **Download** and **Not now** buttons

### Download Behavior
- Uses `react-native-background-downloader` — download continues when user navigates away
- File saved to `FileSystem.documentDirectory/models/` via the downloader's destination path
- A persistent mini progress bar appears at the bottom of the Practice screen while downloading
- The Practice tab icon shows a subtle activity indicator during download

### Completion
On download complete:
- In-app notification fires: *"AI Reviewer is ready! Your flashcards are now being enhanced."*
- Background enhancement job starts immediately for all cards where `aiEnhancedAt` is null

---

## 5. Background Enhancement Job

### Cache-First Rule
Before invoking the LLM for any card, check SQLite. If `aiEnhancedAt` is not null, skip — load the cached result instantly (≈2ms, zero battery). Only invoke the model for cards where `aiEnhancedAt` is null.

### Triggers
The enhancement job runs when:
1. Model download completes (processes all unenhanced cards)
2. After each Supabase sync that produces new or updated cards (processes only new/reset cards)

### Process
For each card where `aiEnhancedAt` is null:

1. Load the card's subject name (from `subjects` table via `topics`)
2. Load up to 10 Q&A pairs from the same topic as additional context
3. Build the subject-aware prompt (see below)
4. Run Qwen 2.5 1.5B Instruct inference on a native background thread
5. Parse JSON response; if malformed → skip card, retry on next trigger
6. Shuffle the 4 options (correct answer + 3 distractors), tracking the new correct index
7. Write `aiOptions`, `aiCorrectIndex`, `aiExplanation`, `aiEnhancedAt = Date.now()` to local SQLite

### Subject-Aware Prompt Strategy

The model is used **strictly as a processor** — it is given the question, correct answer, and context, and asked only to generate wrong options and an explanation. It is never asked to solve or compute anything.

#### Science / Social Studies / General Knowledge (default)
Conceptual questions work best. Generate 3 plausible, scientifically/factually incorrect distractors.

```
[SYSTEM]
You are an expert UPCAT reviewer engine. Analyze the provided Question, Subject, and Right Answer.
Generate exactly 3 plausible, highly challenging college-level incorrect choices (distractors) that
fit the context but are factually wrong. Then write a crisp 2-sentence explanation of why the Right
Answer is correct. Output ONLY valid JSON, no other text.

[USER]
Subject: [subject name]
Question: [question text]
Right Answer: [answer text]

[OUTPUT FORMAT]
{
  "wrong_option_1": "...",
  "wrong_option_2": "...",
  "wrong_option_3": "...",
  "explanation": "..."
}
```

#### Mathematics (Algebra, Geometry, Trigonometry)
Do **not** ask the model to compute or solve. Instead, ask it to generate distractors based on **common student errors** (sign errors, order-of-operations mistakes, formula misapplication).

```
[SYSTEM]
You are an expert UPCAT Math reviewer. Do NOT solve the problem. Instead, generate exactly 3 incorrect
answer choices that reflect common student mistakes such as sign errors, wrong formula application, or
arithmetic slips. Write a 2-sentence explanation of why the Right Answer is correct. Output ONLY valid JSON.

[USER]
Subject: Mathematics ([sub-topic: Algebra / Geometry / Trigonometry])
Question: [question text]
Right Answer: [answer text]

[OUTPUT FORMAT]
{
  "wrong_option_1": "...",
  "wrong_option_2": "...",
  "wrong_option_3": "...",
  "explanation": "..."
}
```

#### Language Proficiency (English / Filipino)
Feed a correct sentence or usage and ask for 3 grammatically or idiomatically flawed variations.

```
[SYSTEM]
You are an expert UPCAT Language reviewer. Generate exactly 3 grammatically or idiomatically incorrect
variations of the correct answer that a student might plausibly choose. Write a 2-sentence explanation
of why the Right Answer is correct. Output ONLY valid JSON.

[USER]
Subject: Language Proficiency ([English / Filipino])
Question: [question text]
Right Answer: [answer text]

[OUTPUT FORMAT]
{
  "wrong_option_1": "...",
  "wrong_option_2": "...",
  "wrong_option_3": "...",
  "explanation": "..."
}
```

### Subject Detection
The subject name comes from the `subjects` table (joined via `topics.subjectId`). Map subject name to prompt strategy:
- Contains "Math" or "Algebra" or "Geometry" or "Trigonometry" → Math prompt
- Contains "English" or "Filipino" or "Language" → Language prompt
- Everything else → default Science/General prompt

### Robustness
- Job processes one card at a time at low CPU priority
- Malformed JSON or inference error → card skipped, retried on next trigger
- Job pauses if app enters a low-memory state
- Already-enhanced cards (`aiEnhancedAt` not null) are always skipped

---

## 6. Quiz Display Logic (`mcDistractors.ts`)

**Cache-first at display time:** when building a `QuizQuestion`, check `aiOptions` + `aiCorrectIndex` first — if present, use them instantly from SQLite with no LLM call. Fall back through the chain only if AI fields are absent.

| Priority | Condition | Source |
|---|---|---|
| 1 | `aiOptions` + `aiCorrectIndex` present | AI-generated (cached in SQLite) |
| 2 | `options[]` + `correctAnswerIndex` present | Admin-authored |
| 3 | `A. … B. … C. … D. …` embedded in question text | Parsed |
| 4 | Pool of other cards' answers in topic | Synthetic fallback |

**Explanation reveal** (post-answer): use `aiExplanation` if present, else admin `explanation`, else show nothing.

---

## 7. Files Affected

| File | Change |
|---|---|
| `supabase/migrations/009_remove_difficulty.sql` | Drop `difficulty` column |
| `apps/mobile/db/schema.ts` | Remove `difficulty`; add `aiOptions`, `aiCorrectIndex`, `aiExplanation`, `aiEnhancedAt` |
| `apps/mobile/db/migrations/` | New Drizzle migration for schema change |
| `apps/mobile/services/sync.ts` | Remove `difficulty` from SELECT query and upsert mapping; reset `aiEnhancedAt = null` when `remoteUpdatedAt` changed |
| `apps/mobile/utils/mcDistractors.ts` | Update priority chain to prefer AI fields (cache-first) |
| `apps/mobile/services/llm.ts` (new) | `llama.rn` wrapper: model path, RAM check, subject-aware prompt builder, inference on background thread, JSON parser |
| `apps/mobile/hooks/useAiEnhancement.ts` (new) | Background enhancement job: cache-first check, card iteration, subject detection, SQLite writes |
| `apps/mobile/hooks/useModelDownload.ts` (new) | Download state, progress tracking, completion notification via `expo-notifications` |
| `apps/mobile/app/(tabs)/practice.tsx` | Add model download banner + mini progress bar |
| `apps/mobile/app/practice/[topicId].tsx` | Remove difficulty display |
| `apps/mobile/app/practice/listing/[slug].tsx` | Remove difficulty display |
| `apps/mobile/app/practice/deck/[deckId].tsx` | Remove difficulty display |
| `apps/admin/app/api/flashcards/process/[id]/route.ts` | Remove `difficulty` from Gemini prompt and response shape |
| `apps/admin/app/admin/flashcards/review/[jobId]/page.tsx` | Remove difficulty column from card table and edit form |

---

## 8. Out of Scope

- Storing raw PDF text chunks for richer LLM context (admin-managed separately, future enhancement)
- Syncing AI-enhanced content back to Supabase
- Server-side AI enhancement
- Re-generating the question text itself (only distractors and explanation are regenerated)
- iOS-specific `react-native-background-downloader` configuration (handle in implementation)
