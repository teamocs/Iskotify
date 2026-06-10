# Audit Fixes — Design Spec (approved 2026-06-10)

User audit surfaced 5 issues. All mobile, JS-only → OTA-deliverable. Approved decisions: download-prompt sheet for the LLM gate; mastery grouped by BOTH subjects/sections and topics; guardrails = redirect-but-allow-academics; perf = cheap + structural.

## 1. Sync heal — full card sync (bug)

**Root cause (verified):** prod has 1,253 published flashcards; devices that synced 1,000 cards before the pagination fix saved `lastSyncedAt` cursors NEWER than the missing 253 cards' `updated_at`, so incremental sync (`.gt('updated_at', since)`) skips them forever. Pagination fix only helps fresh installs.

**Fix:** sync revision constant.
- `user_settings.syncRev` integer column (schema + `MIGRATIONS` ALTER, `.notNull().default(0)` — NOT-NULL drift rule).
- `SYNC_REV = 1` const in `services/sync.ts`. In `syncOnLaunch`: if `settings.syncRev < SYNC_REV` → use `since = epoch` (full re-pull). After successful sync, persist `syncRev: SYNC_REV` alongside `lastSyncedAt`.
- Idempotent upserts make the re-pull safe. Future cursor-gap bugs: bump the constant.
- Test (real SQLite): device with cursor ahead of a row's updated_at + syncRev 0 → heal pulls the row; second sync with syncRev 1 → incremental again.

## 2. Kuya Baw LLM download gate

The TabBar floating button currently calls `openKuya()` unconditionally. Gate it on model state:
- `KuyaChatProvider` exposes model status (reuse `useModelDownload`: `unknown|absent|downloading|ready|unsupported`).
- `ready` → open chat (unchanged). `absent`/`downloading` → open a **download prompt sheet** (Modal bottom sheet): mascot image, "Kuya Baw needs to download his brain first (~750 MB — Wi-Fi recommended)", Download/Cancel buttons, live progress bar (`progress`, bytes), auto-transition to chat when status flips to `ready`. `unsupported` → sheet explains device RAM is insufficient.
- One shared sheet component; TabBar stays dumb (asks provider which to open).

## 3. Chat context + guardrails

Keep existing FTS retrieval (flashcards / upcat_facts / career_facts / ai_career_impact) + progress block. Model is Gemma 3 1B — context stays token-tight; new blocks are retrieved-on-demand, max ~2 items, 1–2 lines each.

- **[LISTINGS] block** (`buildListingsContext`): keyword-match the question against local `listings` titles/slugs/acronyms (and "deadline/exam date/requirements/scholarship" intent words). Inject ≤2 listings: title, type, exam_date/deadline (formatted), grant amount or key facts. Pure function + unit tests.
- **[COURSES] block** (`buildCourseConnectionContext`): when a career course name matches, inject cluster, board exam, demand + which of the user's focus listings accept it (`listings.target_courses` ∩ course cluster). ≤2 courses.
- **Guardrails** (all 3 system prompts in `chatPrompts.ts`): scope rule — academics (math/science/English/study skills) + app data (exams, scholarships, courses, user progress) are in-scope; anything else → ONE friendly redirect line back to studying; NEVER invent listings, dates, cutoffs, or facts not present in the provided context blocks; keep existing no-guarantee + verify-at-official-source rules.
- Token budget: each new block ≤ ~120 tokens; field truncation reuses the existing 140-char helper.

## 4. Analytics with real data

**Defect (verified):** every session writer passes empty `topicId`/`deckId`; `useAnalytics` mastery groups by `topicId || deckId` → Subject Mastery is ALWAYS empty. Mock exams record `subtest` (section names) which analytics ignores.

- **Two-tier mastery** in `useAnalytics`: sessions with `topicId` → group by topic (label from topics table); sessions with empty topicId but a `subtest` → group by subtest section name. Merged into `topicMastery` (and Subject Mastery UI). Weak Areas derives from the same merged groups (lowest accuracy, ≥1 session).
- **Flashcard quizzes write `topicId`**: thread the launching topic/deck's topicId through `FlashcardExam` → `recordSession`. (Multi-topic decks: pass deckId instead — existing deck label path already handles it.)
- **Recent Sessions title**: fallback chain gains `else if (s.subtest) title = s.subtest`.
- **Integration test**: seed practice_sessions rows of all 3 real shapes (flashcard+topicId, upcat mock subtest-only, blueprint subtest-only) → assert mastery groups, weak areas, titles.

## 5. Performance — freezes after 3+ taps

Verified causes: (a) launch sync = 2,000+ synchronous SQLite writes in ONE blocking transaction overlapping user taps; (b) `useHomeStats`/`usePracticeData` full-table re-scans on EVERY tab focus (10k+ rows, 1,000+ JSON.parse); (c) Home N+1 per-focus-listing requirement queries.

- **Debounce focus loads** (cheap): `useHomeStats.load` + `usePracticeData.load` skip if last completed load < 2,000 ms ago (ref-based; manual `refresh()` bypasses).
- **Batch N+1** (cheap): Home requirements loop → `Promise.all` (or one IN query).
- **JSON parse cache** (cheap): `usePracticeData` caches parsed `listing_slugs` per row id in a module-level Map keyed by row count + lastSyncedAt.
- **Yielding sync** (structural): split the single giant transaction in `services/sync.ts` into per-table-group transactions (listings+updates / subjects+topics+flashcards / upcat / career / university / blueprints) with `await new Promise(r => setTimeout(r, 0))` between groups so the JS thread services taps. Each group stays atomic; `lastSyncedAt`+`syncRev` cursor written ONLY in the final group, so an interrupted sync re-pulls next launch (safe, idempotent).
- Sync tests updated to match new transaction grouping.

## Ship order & verification

1 (sync heal) → 5 (perf) → 4 (analytics) → 2 (gate) → 3 (chat). Two OTA waves: [1+5+4], then [2+3].
Each piece: Jest (real-SQLite where DB-touching), tsc, react-doctor on changed RN files (fix new bug-level findings, esp. bare-zero `{n && <JSX/>}`). No app.json bump (JS-only). On-device verification list provided to the user per wave (cannot render RN here).
