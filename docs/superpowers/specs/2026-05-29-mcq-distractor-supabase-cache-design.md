# Design: Gemini-backed MCQ Distractor Generation with Supabase Cache

**Date:** 2026-05-29
**Status:** Approved (pending spec review)
**Owner:** chrisraro

---

## 1. Context

The mobile app's practice mode shows multiple-choice questions built from flashcards. When a flashcard has no admin-set MC options, the app today generates distractors via the on-device Gemma 1B LLM (added by the previous `enhanceCardsByIds` work). Two problems with that:

1. **Gemma 1B produces inconsistent distractors** — verbose, mismatched format (e.g. a sentence when the answer is a number), occasional answer-echo. The user has confirmed this directly.
2. **Every device repeats the work.** Each user enhances each card locally; no sharing of generated distractors across the user base. Scaling cost is N_users × N_cards.

The admin Next.js app already has a `GEMINI_API_KEY` and uses `@google/generative-ai` for PDF processing and the recently-added AI flashcard-generation endpoint. Gemini 2.5 Flash produces noticeably better distractors than Gemma 1B and we can call it server-side.

A separate but related bug: `services/sync.ts:248` currently NULLs out local `aiOptions / aiCorrectIndex / aiExplanation / aiEnhancedAt` on every re-sync. Any locally-cached distractor work is lost on the next pull from Supabase. This design fixes that as a side effect.

---

## 2. Goals / Non-goals

### Goals

- Replace local Gemma distractor generation with Gemini 2.5 Flash for **quality**.
- Cache distractors in Supabase so each unique card is Gemini'd **at most once across all users** ever.
- Three-tier graceful degradation: Supabase-cached → local Gemma → safe placeholders.
- Per-session randomization of A/B/C/D order, applied to **all** MC paths (cached, local-gen, admin-set, embedded).
- Fix the sync-wipe bug as a side effect.
- No new mobile↔HTTP surface (mobile↔Supabase only — same pattern as existing sync).
- **Sanitize legacy data**: existing Supabase rows where MC options are inline-embedded in the `question` field get parsed into `options`/`correct_answer_index` columns + cleaned question text (§12).
- **Admin AI-generation works at edit time too**: from the subject view, admins can "Generate more with AI" per topic, with duplicate prevention against existing cards (§13.1).
- **"Generate more" on manual-add**: after the first AI generation, the button re-labels and appends additional fresh cards without duplicating (§13.2).
- **Make manual-add distractor generation visible** to admins via post-save toast (§13.3).

### Non-goals

- Real-time updates of distractors across devices (sync-on-foreground is sufficient).
- Edit-time auto-regeneration (admin re-runs backfill after edits; trigger only invalidates).
- An admin UI button for backfill in v1 (a shell script is enough for current admin-of-one workflow).
- Replacing Gemma for other features (Kuya chat, math step-by-step, coach phrases all stay on local Gemma).

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ADMIN (Next.js)                                                         │
│  • POST /api/flashcards/manual       → save card + inline Gemini gen     │
│  • POST /api/flashcards/generate     → AI-gen cards + inline distractors │
│  • POST /api/flashcards/backfill     → bulk fill NULL-ai_options rows    │
│  • POST /api/flashcards/distractors  → single-card gen (internal helper) │
│         All four read/write Supabase `flashcards.ai_*` columns           │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (Supabase as source of truth)
┌──────────────────────────────────────────────────────────────────────────┐
│  SUPABASE `flashcards` table — NEW COLUMNS                               │
│    ai_options       text[]       (4-item array OR NULL)                  │
│    ai_correct_index int          (0–3 OR NULL)                           │
│    ai_explanation   text         ('' OR NULL)                            │
│    ai_enhanced_at   timestamptz  (NULL = never enhanced)                 │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (existing sync.ts, extended to pull ai_*)
┌──────────────────────────────────────────────────────────────────────────┐
│  MOBILE — practice flow                                                  │
│  1. sync.ts pulls ai_* from Supabase into local SQLite                   │
│  2. Practice loads cards. If ai_options present → use them                │
│  3. If still missing AND local Gemma model exists → fall back to Gemma   │
│  4. If still missing → safe placeholder distractors                      │
│  5. mcDistractors always RE-SHUFFLES at quiz build time                  │
│     (so A/B/C/D order is fresh per session, even for admin-set options)  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Three principles this design enforces

1. **Gemini is called server-side only**, exactly once per unique card, ever. Result is cached in Supabase and pulled by every device via sync. No API-overuse risk regardless of user count.
2. **No mobile→admin HTTP calls.** Mobile↔Supabase only — same pattern as existing sync. Simpler auth, no CORS, no new env var.
3. **Local Gemma stays as offline fallback** for cards that Supabase doesn't yet have distractors for, plus placeholder fallback as the last line. Three tiers of graceful degradation.

---

## 4. Supabase schema migration

**New migration file:** `supabase/migrations/012_flashcards_ai_distractors.sql`

```sql
-- Cached LLM-generated multiple-choice options.
-- ai_options holds the 4 final-shuffled choices; ai_correct_index points at the
-- correct one. Both NULL means "not yet enhanced — admin backfill needed".
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS ai_options       text[];
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS ai_correct_index int CHECK (ai_correct_index IS NULL OR (ai_correct_index BETWEEN 0 AND 3));
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS ai_explanation   text;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS ai_enhanced_at   timestamptz;

-- Length constraint so a malformed Gemini response can't pollute the cache
ALTER TABLE flashcards ADD CONSTRAINT IF NOT EXISTS flashcards_ai_options_len4
  CHECK (ai_options IS NULL OR array_length(ai_options, 1) = 4);

-- Partial index for the backfill job ("find every card missing distractors")
CREATE INDEX IF NOT EXISTS flashcards_unenhanced_idx
  ON flashcards (id) WHERE ai_enhanced_at IS NULL;

-- Auto-invalidate cached distractors when admin EDITS the question or answer.
CREATE OR REPLACE FUNCTION clear_ai_options_on_content_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.question IS DISTINCT FROM OLD.question
     OR NEW.answer IS DISTINCT FROM OLD.answer THEN
    NEW.ai_options       := NULL;
    NEW.ai_correct_index := NULL;
    NEW.ai_explanation   := NULL;
    NEW.ai_enhanced_at   := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flashcards_ai_invalidate ON flashcards;
CREATE TRIGGER flashcards_ai_invalidate
  BEFORE UPDATE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION clear_ai_options_on_content_change();
```

### RLS

The existing `flashcards_public_read` policy (from migration 001) already covers SELECT for `anon`, so mobile sync picks up `ai_*` for free. Only the **service role** (admin Next.js) can write to these columns — there is no public INSERT/UPDATE policy on `flashcards`.

### Schema design rationale

- **`text[]` (Postgres array) over `jsonb`**: simpler, type-safe, matches the existing `listing_slugs text[]` pattern.
- **`CHECK (BETWEEN 0 AND 3)`** prevents off-by-one bugs sneaking into the cache.
- **`array_length = 4`** guards against the "Gemini returned 3 distractors" edge case getting saved.
- **Partial index** makes the backfill query (`WHERE ai_enhanced_at IS NULL`) O(unenhanced count), not O(total cards) — matters at ~10k+ cards.
- **Auto-invalidate trigger** means admin can edit cards freely without thinking about stale distractors. Slight cost: edits force a Gemini re-call on next backfill, but that is the right trade.

---

## 5. Gemini prompt + endpoint behavior

### 5.1 Core function — `generateDistractorsForCard`

Lives in `apps/admin/lib/gemini/generateDistractors.ts` so all three call sites (manual save, AI-generate, backfill) use the same logic.

```ts
interface DistractorResult {
  options: string[]      // 4 entries, shuffled, includes the correct answer
  correctIndex: number   // 0–3
  explanation: string    // 1–2 sentence why-this-is-correct
}

async function generateDistractorsForCard(input: {
  subject: string
  topic: string
  question: string
  answer: string
}): Promise<DistractorResult | null>  // null on Gemini failure
```

### 5.2 The prompt

Tighter than the bulk-generate prompt because we already know the correct answer — we ONLY ask Gemini for distractors so it cannot hallucinate over the right answer.

```
You are writing multiple-choice distractors for a Philippine college entrance / scholarship exam flashcard.

Subject: {subject}
Topic: {topic}
Question: {question}
Correct answer (DO NOT include in your output): {answer}

Generate exactly 3 incorrect distractors that:
- Are plausible to a student who hasn't fully mastered this topic
- Reflect common student mistakes (sign errors, wrong formula application, near-synonyms, wrong dates, etc.)
- Are in the SAME format and length as the correct answer (if answer is a number → distractors are numbers; if a phrase → distractors are phrases of similar length)
- Are unambiguously WRONG when checked against the correct answer
- Are different from each other AND different from the correct answer

Also write a 1–2 sentence explanation of why the correct answer is correct (mention the relevant concept or formula). The explanation is for the student to read AFTER they answer.

Output ONLY valid JSON, no markdown, no preamble:
{
  "wrong_1": "...",
  "wrong_2": "...",
  "wrong_3": "...",
  "explanation": "..."
}
```

### 5.3 Sampler config

- Model: `gemini-2.5-flash`
- `responseMimeType: 'application/json'`
- `temperature: 0.5` (some diversity in distractor wording but mostly deterministic)
- `maxOutputTokens: 2048` (small payload — 3 distractors + short explanation)

### 5.4 Post-processing

1. Parse JSON (with the same `extractJson` fence-stripper used in `app/api/flashcards/process/[id]/route.ts`)
2. De-duplicate against the correct answer (case-insensitive). If any distractor equals the answer, return `null` (caller treats as cache miss; retries on next backfill).
3. De-duplicate distractors among themselves — return `null` if any pair matches.
4. Shuffle `[answer, wrong_1, wrong_2, wrong_3]`, record final `correctIndex`.
5. Return the shuffled options + index + explanation.

### 5.5 The distractor-generation endpoints

(See also §12.3 for `/sanitize-legacy` and §13.1 for how the topic edit-with-AI flow drives `/generate`.)

| Endpoint | Behavior |
|---|---|
| `POST /api/flashcards/manual` *(existing — modify)* | After inserting card rows, call `generateDistractorsForCard` per card in parallel (concurrency cap of 4 to avoid Gemini RPM limits). Update each row with `ai_options`. **Fire-and-forget** the distractor generation so the admin doesn't wait — return success after insert. |
| `POST /api/flashcards/generate` *(existing — modify)* | Same hook: after Gemini returns the cards, call `generateDistractorsForCard` per generated card *before* returning them in the response. Admin sees the cards already complete with distractors. **Also extended** to accept an optional `existing_questions: string[]` field. When provided, those question stems are injected into the generation prompt with the directive "DO NOT duplicate or paraphrase any of these existing questions". A **server-side dedupe pass** then runs after Gemini returns: any generated question whose stem matches an existing one (case-insensitive, whitespace-normalized) is dropped before the response. Used by the "Generate more" UI (§13.2) and the topic edit-with-AI flow (§13.1) so successive generations produce fresh content. |
| `POST /api/flashcards/distractors` *(new)* | `{ cardId }` → fetch from Supabase, call `generateDistractorsForCard`, write back. Used by the backfill loop and any future external caller (e.g. a future admin UI button). The `/manual` and `/generate` endpoints DO NOT call this HTTP endpoint — they call the `generateDistractorsForCard` library function directly (in-process). Idempotent. **Auth:** requires the same `x-admin-secret: $ADMIN_BACKFILL_SECRET` header as `/backfill` — same threat model (triggers Gemini calls). Returns 401 without it. |
| `POST /api/flashcards/backfill?limit=N` *(new)* | Scans `flashcards WHERE ai_enhanced_at IS NULL LIMIT N`, calls the distractors endpoint for each, returns `{ processed, succeeded, failed, remaining }`. Default `limit=50`. Run manually by admin (via curl or the helper script) after bulk imports. Protected by `x-admin-secret: $ADMIN_BACKFILL_SECRET` header. |

### 5.6 Error handling at each layer

- Gemini call fails (network, quota) → `generateDistractorsForCard` returns `null` → card stays with `ai_options IS NULL` → mobile falls back to local Gemma or placeholders. No exception bubbles up.
- Malformed Gemini JSON → same: log warning, return `null`, no cache write.
- Distractors all duplicate the answer → same.
- Cache write fails (RLS, network) → log, return `null` (card remains unenhanced; backfill will retry next time).

### 5.7 Cost / rate-limit ceiling

Gemini 2.5 Flash free tier: 15 RPM / 1M TPM / 1500 RPD. For a directory of ~5k cards, the worst-case full backfill is ~6 hours of throttled calls or one paid burst (~$0.25 at current pricing). Both are acceptable. Concurrency cap of 4 within the backfill loop keeps us inside the RPM limit.

---

## 6. Backfill UX

### 6.1 The endpoint

`POST /api/flashcards/backfill?limit=50`

Admin runs it via:

```bash
# Single call:
curl -X POST "https://admin.iskotify.app/api/flashcards/backfill?limit=50" \
  -H "x-admin-secret: $ADMIN_BACKFILL_SECRET"

# Drain queue (helper script — see 6.3):
./scripts/backfill-distractors.sh
```

### 6.2 Auth

Single shared secret in `ADMIN_BACKFILL_SECRET` env var (added to Vercel as a secret env). The endpoint checks `req.headers.get('x-admin-secret') === process.env.ADMIN_BACKFILL_SECRET`; returns 401 otherwise. Keeps the endpoint out of Vercel function logs without full Supabase auth wiring on the script side.

### 6.3 Helper script

`scripts/backfill-distractors.sh`:

```bash
#!/usr/bin/env bash
# Drains the distractor-backfill queue. Re-runs until remaining=0.
# Requires: ADMIN_BACKFILL_URL and ADMIN_BACKFILL_SECRET env vars.

set -euo pipefail
: "${ADMIN_BACKFILL_URL:?env var required, e.g. https://admin.iskotify.app/api/flashcards/backfill}"
: "${ADMIN_BACKFILL_SECRET:?env var required}"

while true; do
  resp=$(curl -sfX POST "$ADMIN_BACKFILL_URL?limit=50" \
    -H "x-admin-secret: $ADMIN_BACKFILL_SECRET")
  echo "$resp"
  remaining=$(echo "$resp" | jq -r '.remaining // 0')
  [ "$remaining" -eq 0 ] && break
done
echo "✓ All cards enhanced."
```

### 6.4 Response shape

```json
{ "processed": 50, "succeeded": 47, "failed": 3, "remaining": 1247 }
```

The `remaining` count is what the helper script polls for the exit condition.

### 6.5 Concurrency

The endpoint processes its `limit=N` cards in batches of 4 concurrent Gemini calls (matches the manual/generate hooks). `limit=50` takes ~60–120 seconds end-to-end.

### 6.6 No UI button in v1

If the script gets run often we add a button later. Current admin-of-one workflow doesn't need it.

---

## 7. Per-session shuffle

User-facing change: every quiz session reshuffles A/B/C/D order, even for admin-set options.

### 7.1 Implementation

Two-line change in `apps/mobile/utils/mcDistractors.ts`. After each Priority resolves its `options + correctIndex`:

```ts
const shuffled = shuffleWithIndex(options, correctIndex)
return { id, stem, options: shuffled.options, answerIndex: shuffled.correctIndex, explanation }
```

A small helper `shuffleWithIndex(opts, idx)` mirrors the existing `shuffleWithCorrect` from `useAiEnhancement.ts` (shuffle while tracking where the correct element ended up). Runs at quiz-build time, per session.

### 7.2 Scope

All five sources of options reshuffle equally:
1. AI-cached (Supabase `ai_options`)
2. AI-generated (local Gemma `aiOptions`)
3. Admin-set (`options` + `correctAnswerIndex`)
4. Embedded `A)`/`A.` parsed options
5. Placeholder fallback

A card with admin-set `['Manila', 'Cebu', 'Davao', 'Iloilo']` at correctIndex 0 might appear as `['Cebu', 'Manila', 'Davao', 'Iloilo'][1]` in session N and `['Davao', 'Iloilo', 'Cebu', 'Manila'][2]` in session N+1.

### 7.3 No DB change

The shuffled order is ephemeral — a per-session arrangement of the underlying options. The cached `ai_options + ai_correct_index` in Supabase remains canonical. Cache-hit rate unaffected.

---

## 8. Mobile sync changes

### 8.1 Pull the new columns

`services/sync.ts` line ~197 — extend the SELECT:

```ts
.select('id,topic_id,question,answer,explanation,listing_slugs,options,correct_answer_index,ai_options,ai_correct_index,ai_explanation,ai_enhanced_at,updated_at')
```

### 8.2 Map the new columns into local Drizzle insert

Line ~239 — extend `vals`:

```ts
const vals = {
  id: row.id, topicId: row.topic_id, /* ... existing ... */
  aiOptions: row.ai_options ? JSON.stringify(row.ai_options) : null,
  aiCorrectIndex: row.ai_correct_index ?? null,
  aiExplanation: row.ai_explanation ?? null,
  aiEnhancedAt: row.ai_enhanced_at ? new Date(row.ai_enhanced_at).getTime() : null,
}
```

### 8.3 Fix the sync-wipe bug

Line 248 currently unconditionally NULLs out all `ai_*` fields on every re-sync, destroying any local Gemma work. The fix: only overwrite when Supabase actually has values to overwrite WITH. If Supabase's `ai_enhanced_at` is NULL, leave local fields alone (insert defaults on new rows, no-op on existing).

```ts
// Conditional: only overwrite ai_* if Supabase has non-null values for them.
// When Supabase has nothing (ai_enhanced_at IS NULL), local Gemma work survives.
const aiVals = row.ai_enhanced_at
  ? {
      aiOptions: row.ai_options ? JSON.stringify(row.ai_options) : null,
      aiCorrectIndex: row.ai_correct_index,
      aiExplanation: row.ai_explanation,
      aiEnhancedAt: new Date(row.ai_enhanced_at).getTime(),
    }
  : {}  // Supabase has nothing — don't touch local ai_* fields

tx.insert(flashcards)
  .values({ ...vals, ...aiVals })
  .onConflictDoUpdate({
    target: flashcards.id,
    set: { ...vals, ...aiVals },  // ai_* only included when Supabase had them
  })
  .run()
```

### 8.4 Remove the on-device Gemma enhancement gate

`apps/mobile/hooks/useAiEnhancement.ts` stays as the offline-fallback path, but the practice screens (`practice/[topicId].tsx`, `practice/deck/[deckId].tsx`, `practice/listing/[slug].tsx`) get a small tweak: the "enhancing" phase only fires when Supabase **also** had no `ai_enhanced_at` for the card. If Supabase had it but mobile hasn't synced yet → trigger a sync, then proceed. If neither has it → fall back to local Gemma (existing behavior).

---

## 9. Testing strategy

### 9.1 Admin (`apps/admin/`)

- **`generateDistractorsForCard` unit tests** (Vitest, mocked `@google/generative-ai`):
  - Returns DistractorResult on valid Gemini JSON
  - Returns null on malformed JSON
  - Returns null when any distractor duplicates the answer
  - Returns null when two distractors are identical
  - Shuffles options (verify correctIndex matches actual position)
- **`/api/flashcards/distractors` route tests**:
  - 400 on missing cardId
  - 404 on unknown cardId
  - 401 without admin secret (only for backfill, distractors itself is internal)
  - 200 + cached row on Gemini success
  - 200 + null `ai_options` (left untouched) on Gemini failure
- **`/api/flashcards/backfill` route tests**:
  - 401 without secret
  - Processes up to `limit`, returns `{ processed, succeeded, failed, remaining }`
  - Respects concurrency cap of 4
- **Modified `/manual` and `/generate` tests**:
  - Manual: returns success without waiting for distractors (fire-and-forget)
  - Generate: returned cards include `aiOptions` (block until done)
  - Generate: when `existing_questions` provided, the prompt sent to Gemini includes the DO-NOT-DUPLICATE directive with those stems
- **`legacyMcq` parser unit tests** (§12):
  - Parses `A. ... B. ... C. ... D. ...` format
  - Parses `A) ... B) ... C) ... D) ...` format
  - Strips the prefix from the `answer` column and matches to options
  - Returns null on questions that look like MCQ but answer doesn't match any option
  - Returns null on questions without all 4 letter markers
- **`/api/flashcards/sanitize-legacy` route tests** (§12):
  - 401 without secret
  - `dry_run=1` returns would-be-updated rows + counts, no DB writes
  - `dry_run=0` writes back: `question` cleaned, `options` populated, `correct_answer_index` set
  - `answer_mismatch` rows reported but not modified
  - Respects `limit`

### 9.2 Mobile (`apps/mobile/`)

- **`mcDistractors` test updates**:
  - Relax option-order assertions where shuffle now reorders
  - New: verify per-session shuffle (call buildQuizQuestions twice on identical input, expect different orderings most of the time — flaky-safe with high-cardinality input)
  - Verify `shuffleWithIndex` maintains correctIndex invariant
- **`sync.ts` test updates**:
  - Verify ai_* fields pulled from Supabase land in local SQLite
  - Verify sync DOES NOT wipe local ai_* when Supabase has NULL
  - Verify sync DOES overwrite local ai_* when Supabase has a fresher `ai_enhanced_at`
- **Practice screen smoke tests** (already exist):
  - Verify "enhancing" phase still triggers when both Supabase and local lack distractors
  - Verify "enhancing" phase is skipped when Supabase has ai_*

### 9.3 Baseline preservation

The full test suite currently has 14 pre-existing failures (llm, sync, useModelDownload, home, profile). This change must not regress that baseline.

---

## 10. Migration / rollout plan

### Order matters (do NOT skip steps):

1. **Apply Supabase migration 012** via the SQL editor in Supabase Dashboard. Verify `ai_*` columns exist + RLS unchanged.
2. **Deploy admin changes** to Vercel (push to master, Vercel auto-deploys):
   - New `generateDistractorsForCard` lib + `legacyMcq` sanitizer lib
   - Modified `/manual`, `/generate` endpoints (incl. `existing_questions` support)
   - New `/distractors`, `/backfill`, `/sanitize-legacy` endpoints
   - Modified UI: `new/page.tsx` "Generate more" + `TopicCardSection.tsx` generate-more button
   - `ADMIN_BACKFILL_SECRET` env var added to Vercel project settings (Production scope)
3. **Run legacy sanitization** (BEFORE distractor backfill — see §12.4):
   ```bash
   ADMIN_BACKFILL_URL_BASE=https://admin.iskotify.app/api/flashcards \
   ADMIN_BACKFILL_SECRET=... \
   ./scripts/sanitize-legacy-mcq.sh
   ```
   Script runs dry-run first, prompts before real run. Expected: most legacy cards get clean `question` + populated `options`/`correct_answer_index`; cards that don't parse cleanly are reported for manual fix.
4. **Run distractor backfill** for the remaining cards (those without options after step 3):
   ```bash
   ADMIN_BACKFILL_URL=https://admin.iskotify.app/api/flashcards/backfill \
   ADMIN_BACKFILL_SECRET=... \
   ./scripts/backfill-distractors.sh
   ```
   Expected runtime: ~60s per 50-card batch. For 1000 unsanitized cards, ~20 minutes wall clock. Sanitization should cut this number dramatically.
5. **Push mobile OTA** with sync + mcDistractors changes (`eas update --channel preview`).
6. **Verify on device**: force-close, reopen twice, sync, start a practice session for cards that were enhanced by the backfill. Confirm:
   - "Preparing quiz options…" phase is skipped (Supabase had distractors already)
   - Options visibly different orderings across sessions
   - Distractors are plausible (Gemini quality not Gemma quality)
   - Sanitized cards no longer have option text leaking into the question stem

### Rollback

- Mobile-side regressions → roll back the OTA via `eas update:republish --group <previous-group-id>`.
- Admin-side regressions → revert the commit, push to master, Vercel redeploys.
- Schema regressions → migration 012 is additive (no drops); reverting requires writing migration 013 to drop the columns + trigger. Low risk because RLS keeps anon out of writes.

---

## 11. Risks / mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini quota exhausted mid-backfill | Medium | Backfill stops, partial coverage | Script polls `remaining`; rerun next day. Free tier resets daily. |
| Gemini returns ambiguous-quality distractors | Low (low temp + tuned prompt) | Bad MCQ for that card | Auto-rejected by post-processing if echo/duplicate; otherwise admin can manually edit (trigger invalidates). |
| Schema migration applied but admin deploy not yet → Supabase has NULL ai_* for new cards saved manually | Low | Cards land without distractors until backfill | Order in §10 above prevents this; if it happens, backfill cleans up. |
| Mobile shipped before sync fix → users continue losing local Gemma cache | Low | Same as today's bug | OTA push includes the sync fix; existing local Gemma work is preserved going forward. |
| Per-session shuffle breaks existing tests that assert exact orderings | High | Test suite red | Tests rewritten as part of this change (§9.2). |
| Admin edits a card → trigger NULLs ai_*, admin forgets to backfill → user sees "preparing quiz" | Medium | UX hiccup, not data loss | Document in admin internal notes that "edit a card → re-run backfill". Future v2: auto-regenerate on edit. |
| `ADMIN_BACKFILL_SECRET` leaks | Low | Anyone can trigger backfill (Gemini cost) | Only triggers Gemini for cards already on Supabase; bounded cost. Rotate secret on suspicion. |
| Sanitization parser misidentifies a non-MCQ question as embedded MCQ | Low | One card gets its question rewritten incorrectly | Dry-run preview in §12.5 catches before write. Parser requires ALL FOUR of `A./B./C./D.` markers AND the `answer` column to match one of them — false positive needs a question containing all 4 markers plus a coincidental letter-prefixed answer. Very unlikely. |
| Sanitization parses MCQ correctly but answer column doesn't match any option | Medium | Card reported in `answer_mismatch` bucket, left untouched | Admin reviews manually via the dry-run output. Common cause: typos in legacy answer column (`"C. Mitochodria"` vs option `"Mitochondria"`). |
| Topic-edit "Generate more" produces duplicates despite `existing_questions` | Low (Gemini follows instruction well at temp 0.4) | One or two duplicate cards land in topic | Server-side dedupe pass after Gemini returns: drop generated cards whose question stem matches an existing one (case-insensitive, after whitespace normalization). |

---

## 12. Legacy data sanitization

### 12.1 The problem

Existing Supabase `flashcards` rows include question text where the MC options are **embedded inline** in the `question` field (e.g. `"What is photosynthesis? A) Respiration B) Plants making food C) Digestion D) Mitosis"`), while the `options` column is empty and `correct_answer_index` is NULL. The mobile app's `parseEmbedded` fallback handles these at display time, but:

1. The question text shown to students is noisy (the options leak into the stem).
2. Gemini distractor generation, given that polluted question, includes the embedded letters/options in its prompt context — degrading quality.
3. Per-session shuffle (§7) can't reorder embedded options without restructuring the stem text.

Fix: a one-time migration that **detects embedded MCQ format, parses it out, and writes back** clean `question` + populated `options` + `correct_answer_index`.

### 12.2 Detection + parse

Reuse the existing battle-tested regex from `apps/mobile/utils/mcDistractors.ts:parseEmbedded` — port it server-side as `parseLegacyEmbeddedMcq` in `apps/admin/lib/sanitize/legacyMcq.ts`. Handles both formats:

- `A. ... B. ... C. ... D. ...`
- `A) ... B) ... C) ... D) ...`

Correct-answer detection: the `answer` column today carries values like `"C. Mitochondria"` or `"C) 4"`. Strip the `^[A-D][.)]\s*` prefix, match against parsed options.

### 12.3 The endpoint

`POST /api/flashcards/sanitize-legacy?limit=N&dry_run=1|0` — protected by `x-admin-secret` (same header as backfill).

- Scans `flashcards WHERE question ~ '\bA[.)] .* B[.)] .* C[.)] .* D[.)]'` (Postgres regex) — only candidate rows hit the parser.
- For each candidate:
  - Parse via `parseLegacyEmbeddedMcq`
  - If parse succeeds AND the correct answer matches one of the 4 options → update row with `question = clean_stem, options = parsed, correct_answer_index = idx`
  - If parse fails OR correct answer doesn't match → log to `failed[]`, leave row alone (admin reviews manually)
- `dry_run=1` returns the would-be-updated rows + counts without writing.
- Response: `{ scanned, parsed_ok, parse_failed, answer_mismatch, updated, dry_run }`

### 12.4 Order of operations vs distractor backfill

Run sanitization **BEFORE** the distractor backfill (§10 step 3). The order matters: sanitization populates `options` + `correct_answer_index`, which the distractor backfill then sees and SKIPS (because Priority 2 in `mcDistractors.ts` already gives a usable MCQ — no Gemini call needed for these). This saves Gemini quota on the largest tranche of legacy cards.

### 12.5 Helper script

`scripts/sanitize-legacy-mcq.sh`:

```bash
#!/usr/bin/env bash
# Two-pass: dry-run first, then real run. Confirms with the operator between.
set -euo pipefail
: "${ADMIN_BACKFILL_URL_BASE:?env var, e.g. https://admin.iskotify.app/api/flashcards}"
: "${ADMIN_BACKFILL_SECRET:?env var required}"

echo "→ Dry run..."
curl -sfX POST "$ADMIN_BACKFILL_URL_BASE/sanitize-legacy?limit=1000&dry_run=1" \
  -H "x-admin-secret: $ADMIN_BACKFILL_SECRET" | jq .

read -p "Proceed with real sanitization? [y/N] " ok
[ "$ok" = "y" ] || exit 0

curl -sfX POST "$ADMIN_BACKFILL_URL_BASE/sanitize-legacy?limit=1000&dry_run=0" \
  -H "x-admin-secret: $ADMIN_BACKFILL_SECRET" | jq .
```

---

## 13. Admin UI changes — edit-with-AI and "Generate more"

### 13.1 AI generation from the subject/topic view

The existing subject view ([SubjectCardsView.tsx](apps/admin/components/admin/SubjectCardsView.tsx) + [TopicCardSection.tsx](apps/admin/components/admin/TopicCardSection.tsx)) shows each topic with its current cards and an "Add card" button per topic. **New addition**: a "✨ Generate more with AI" button alongside "Add card" on each topic row.

Behavior:
1. Button click → opens a small modal with:
   - Count selector (5/10/15/20 — defaults to 5 in this context since topics typically already have some cards)
   - "Generate" button
2. POST to `/api/flashcards/generate` with:
   - `subject_name` (inferred from the topic's subject_id → fetched server-side)
   - `topic_name` (inferred from the topic)
   - `listing_slugs` (inherited from existing cards in this topic — query: distinct listing_slugs across topic's cards)
   - `count` (selected)
   - **`existing_questions`** — the question stems of all current cards in this topic, so Gemini doesn't duplicate
3. Generated cards inserted directly into the topic (server-side INSERT — no UI review step, unlike `/new` page which is interactive). Cards land with `status='published'` and inherit the topic's existing `listing_slugs`.
4. Distractors generated inline as part of the existing `/generate` chain (§5.5).
5. Topic row auto-refreshes to show the new card count.

The "Add card" button stays as-is for single manual adds. The new "Generate more with AI" button is the bulk-AI path for existing topics.

### 13.2 "Generate more" on the manual-add page

The existing `/admin/flashcards/new` page has a "Generate with AI" panel (left column). **New behavior**: after the first generation completes and cards are populated in the right column, the same button changes label to "**+ Generate {N} more**" and clicking it appends a fresh batch to the existing list.

Implementation in [new/page.tsx](apps/admin/app/admin/flashcards/new/page.tsx):
- Track `cards` state as before (already does)
- On `handleGenerate`, pass current `cards.map(c => c.question).filter(Boolean)` as `existing_questions` to the generate endpoint so the next batch doesn't duplicate
- Append rather than replace (already does this when `existing_has_content === true` — extend to ALWAYS append on subsequent calls, never replace once cards exist)
- Button label switches dynamically: "✨ Generate {N} flashcards" first time, "+ Generate {N} more" subsequent times

This addresses the user's UX request: "after it generate first the flashcards, they can regenerate again more and add on the currently generated flashcards".

### 13.3 Manual add — make distractor generation visible

The `/api/flashcards/manual` endpoint already chains `generateDistractorsForCard` fire-and-forget (§5.5). **UI clarification**: after the admin clicks "Save to Knowledgebase" in `new/page.tsx`, show a brief success toast that includes "AI is generating multiple-choice distractors in the background — they'll be ready for students within ~30 seconds per card."

No new endpoint or behavior — just makes the existing fire-and-forget step visible so admins understand what's happening.

---

## Appendix A — File-level change list

### New files

- `supabase/migrations/012_flashcards_ai_distractors.sql`
- `apps/admin/lib/gemini/generateDistractors.ts`
- `apps/admin/lib/gemini/__tests__/generateDistractors.test.ts`
- `apps/admin/lib/sanitize/legacyMcq.ts` *(§12 — port of mobile parseEmbedded)*
- `apps/admin/lib/sanitize/__tests__/legacyMcq.test.ts`
- `apps/admin/app/api/flashcards/distractors/route.ts`
- `apps/admin/app/api/flashcards/distractors/__tests__/route.test.ts`
- `apps/admin/app/api/flashcards/backfill/route.ts`
- `apps/admin/app/api/flashcards/backfill/__tests__/route.test.ts`
- `apps/admin/app/api/flashcards/sanitize-legacy/route.ts` *(§12)*
- `apps/admin/app/api/flashcards/sanitize-legacy/__tests__/route.test.ts`
- `apps/admin/components/admin/GenerateMoreModal.tsx` *(§13.1 — per-topic generate UI)*
- `scripts/backfill-distractors.sh`
- `scripts/sanitize-legacy-mcq.sh`

### Modified files

- `apps/admin/app/api/flashcards/manual/route.ts` (chain distractor gen, fire-and-forget)
- `apps/admin/app/api/flashcards/generate/route.ts` (chain distractor gen, accept `existing_questions`, await)
- `apps/admin/app/admin/flashcards/new/page.tsx` (§13.2 — "Generate more" label + always-append on subsequent calls + pass `existing_questions` + success toast for §13.3)
- `apps/admin/components/admin/TopicCardSection.tsx` (§13.1 — add "Generate more with AI" button per topic row)
- `apps/mobile/services/sync.ts` (pull ai_*, fix wipe bug)
- `apps/mobile/utils/mcDistractors.ts` (per-session shuffle)
- `apps/mobile/utils/__tests__/mcDistractors.test.ts` (test updates)
- `apps/mobile/services/__tests__/sync.test.ts` (test updates)

### Environment variables

- New (Vercel admin production): `ADMIN_BACKFILL_SECRET` (generated, 32 random bytes hex)

---

## Appendix B — Out of scope (deferred to v2)

- Admin UI button to trigger backfill from the dashboard
- Auto-regenerate (vs invalidate) on card edit
- Per-user-per-card RNG seed for shuffle (current shuffle is per-session, not per-user-per-card-deterministic — acceptable)
- Distractor quality scoring + auto-retry
- Multi-language distractor support (current scope: English + Tagalog, same as the rest of the app)
