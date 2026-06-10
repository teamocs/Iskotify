# Audit Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans + superpowers:test-driven-development for DB/pure logic. Checkbox (`- [ ]`) steps. All mobile work is JS-only → OTA (NO app.json version bump). NativeWind is REMOVED — `StyleSheet.create` only. Never `{count && <JSX/>}` (bare-zero crash) — use `cond ? (...) : null`.

**Spec:** `docs/superpowers/specs/2026-06-10-audit-fixes-design.md`. Ship order: Task 1 → 5 → 4 (OTA wave A), then Task 2 → 3 (OTA wave B).

**Schema rule (critical):** any new NOT NULL column in `db/client.ts` MIGRATIONS must carry `.notNull().default(...)` in `db/schema.ts`, or Drizzle inserts NULL and the whole write throws silently.

**Verified grounding (from investigation — re-verify line numbers before editing):**
- `services/sync.ts`: `fetchAllPaginated` :22-35 (correct); `since` calc :207-209; flashcards pull :290-300 (paginated, per focus slug); ONE giant `db.transaction` :308-651 with per-table loops (listings :309, subjects/topics :354-364, flashcards :366-395, upcat :402-426, career :437-525, university :541-618, blueprints :620-651); cursor write `lastSyncedAt` :653-657 (inside the transaction, last).
- `hooks/useHomeStats.ts`: `load()` :114-200 scans listings + ALL user_progress + ALL flashcards + topics on every focus (`useFocusEffect` :207).
- `hooks/usePracticeData.ts`: `load()` :79-200; `JSON.parse(fc.listingSlugs)` per flashcard :102-121; `useFocusEffect` :~185.
- `app/(tabs)/index.tsx`: sequential per-focus-listing `getAcquiredRequirementIndices` loop :501-520.
- `hooks/useAnalytics.ts`: mastery grouping :107-133 — `const key = s.topicId || s.deckId` :109, skips `!key || '__full__' || '__weak__'` :110; title fallback :139-143 (no subtest case); avgAccuracy :94-98.
- Session writers all pass `topicId:'', deckId:''`: `components/practice/FlashcardExam.tsx` :52-60; `app/practice/upcat/[subtest].tsx` :95-103; `app/practice/exam/[slug].tsx` :130-138 (blueprint — DO pass section as `subtest` already).
- Kuya Baw: `components/TabBar.tsx` FAB `onPress={openKuya}` :95 (no model check), `useKuyaChatModal()` :16; `components/AskKuyaModal.tsx`; `hooks/useKuyaChat.ts` `isModelReady` :45, `modelExists()` effect :63-67; `hooks/useModelDownload.ts` status `'unknown'|'absent'|'downloading'|'ready'|'unsupported'` :8, `progress`/bytes :73-79, `startDownload()` :186; `services/llm.ts` `modelExists()` :55, model ~750MB Gemma 3 1B.
- Chat: `services/chatContext.ts` `buildProgressContext` :48-76, truncation helper (140-char) :80-86, `buildRetrievedFlashcards` :140-166; `services/chatPrompts.ts` 3 prompts :3-61; assembly `buildChatPrompt` :130-184; invocation `hooks/useKuyaChat.ts` :156-175.
- Local tables for context: `listings` (slug,title,type,examDate,deadline,grantAmount,targetCourses,provider…), `careerCourses` (courseId,name,cluster,boardExam,boardExamName,demand), `focusListings`.
- Prod truth: 1,253 published flashcards; the 1000-card cap on devices is the stale-cursor gap (cards' updated_at < device lastSyncedAt).

---

## Task 1: Sync heal (`syncRev`)

**Files:** `db/schema.ts`, `db/client.ts`, `services/sync.ts`, test `services/__tests__/syncHeal.repro.test.ts` (new) or append to `services/__tests__/sync.test.ts`.

- [ ] 1.1 Schema: add to `userSettings` in `db/schema.ts`: `syncRev: integer('sync_rev').notNull().default(0)`. Add to `db/client.ts` MIGRATIONS: `ALTER TABLE user_settings ADD COLUMN sync_rev integer NOT NULL DEFAULT 0;` (follow the existing MIGRATIONS array pattern exactly).
- [ ] 1.2 TDD repro (real SQLite, model on `db/__tests__/onboardingPersist.repro.test.ts` harness or the sync.test.ts mock pattern — whichever exercises the real `since` selection): device state `lastSyncedAt = T2`, `syncRev = 0`; a remote flashcard row with `updated_at = T1 < T2` exists. Assert: with the fix, sync requests `since = epoch` (full pull) and after success persists `syncRev = 1`; a second sync (syncRev=1) uses the incremental cursor again. Write test → run → FAIL.
- [ ] 1.3 Implement in `services/sync.ts`: `const SYNC_REV = 1` near the top with a comment explaining the cursor-gap heal (devices that truncated at 1000 pre-pagination). Where `since` is computed (:207-209): `const needsHeal = (settings.syncRev ?? 0) < SYNC_REV; const since = needsHeal || settings.lastSyncedAt === 0 ? '1970-01-01T00:00:00.000Z' : new Date(settings.lastSyncedAt).toISOString()`. Where the cursor is written (:653-657): include `syncRev: SYNC_REV` in BOTH the `.values()` and the `onConflictDoUpdate.set`.
- [ ] 1.4 Run → PASS; run full `services` jest project; fix any mock-chain fallout in `sync.test.ts` (the settings row mock must include `syncRev`).
- [ ] 1.5 Commit: `fix(mobile): sync heal — force one full re-pull to recover cards missed by the pre-pagination 1000-row cap`.

## Task 5 (wave A, do second): Performance

**Files:** `hooks/useHomeStats.ts`, `hooks/usePracticeData.ts`, `app/(tabs)/index.tsx`, `services/sync.ts`, existing tests.

- [ ] 5.1 Debounce focus loads: in `useHomeStats` and `usePracticeData`, add `const lastLoadRef = useRef(0)`. At the top of `load()`: `if (Date.now() - lastLoadRef.current < 2000) return` and set `lastLoadRef.current = Date.now()` after a successful load. The manual `refresh()` exported by `usePracticeData` must BYPASS the debounce (reset the ref to 0 before calling load). Keep deps unchanged.
- [ ] 5.2 Batch the Home N+1: in `app/(tabs)/index.tsx` :501-520, replace the sequential `for` loop of `await getAcquiredRequirementIndices(db, row.slug)` with `const acquiredLists = await Promise.all(rows.map(r => getAcquiredRequirementIndices(db, r.slug)))` then combine.
- [ ] 5.3 Yielding sync: in `services/sync.ts`, split the single `db.transaction` (:308-651) into SIX sequential transactions grouped: (1) listings + admissions_updates; (2) subjects + topics + flashcards; (3) upcat passages/questions/facts/cutoffs; (4) career tables; (5) university/course tables; (6) blueprints + skill categories + course notes + **the cursor write (`lastSyncedAt`, `syncRev`) — cursor stays LAST so an interrupted sync re-pulls next launch**. Between transactions insert `await new Promise<void>(r => setTimeout(r, 0))` to yield the JS thread. Each transaction keeps the existing sync `.run()` callback style (expo-sqlite sync driver — callbacks must stay synchronous INSIDE each transaction).
- [ ] 5.4 Run full mobile + services jest; `sync.test.ts` will need its transaction-call expectations adjusted (it may assert one transaction — update to six, or relax to "cursor written after card insert"). tsc clean.
- [ ] 5.5 Commit: `perf(mobile): debounce focus reloads, batch home requirement queries, yielding chunked launch sync`.

## Task 4 (wave A, do third): Analytics real data

**Files:** `hooks/useAnalytics.ts`, `components/practice/FlashcardExam.tsx` (+ its call sites to thread topicId), test `hooks/__tests__/useAnalytics.test.ts` (extend).

- [ ] 4.1 TDD: extend the useAnalytics test (or add an integration-style test of the exported computation if the hook isn't directly testable — check how the existing test file exercises `computeStreak`/`computeWeeklyData`; if grouping is inline in the hook, EXTRACT it to an exported pure function `computeTopicMastery(sessions, topicNameMap, deckMap)` first so it's testable). Seed the 3 real shapes: (a) `{topicId:'t1', subtest:null}`, (b) `{topicId:'', deckId:'', subtest:'Mathematics', listingSlug:'upcat'}`, (c) `{topicId:'', deckId:'', subtest:'Reading Comprehension', listingSlug:'ustet'}`. Assert: mastery contains topic t1 (by name) AND 'Mathematics' AND 'Reading Comprehension' groups with correct accuracy; weak-areas ordering = lowest accuracy first; Recent-Session title for shape (b) = 'Mathematics'. Run → FAIL.
- [ ] 4.2 Implement two-tier grouping: in the grouping loop (:107-133), key = `s.topicId || s.deckId || (s.subtest ? 'subtest:' + s.subtest : '')`; still skip `''`, `'__full__'`, `'__weak__'`. Label resolution: `subtest:` keys → the subtest string itself; topic keys → topics map (existing); deck keys → deck map (existing). Title fallback (:139-143): add `else if (s.subtest) title = s.subtest` before the generic `'Session'`.
- [ ] 4.3 Thread topicId from flashcard quizzes: find where `FlashcardExam` is launched (practice screen → topic tap / deck tap). Pass the launching `topicId` (single-topic quiz) or `deckId` (saved deck) into `FlashcardExam` props → `recordSession({ topicId, deckId, ... })` (:52-60). If `FlashcardExam` already receives the topic/deck identity, just stop hardcoding `''`. Multi-topic "full review"/"weak topics" decks: keep the existing `'__full__'`/`'__weak__'` deckId sentinels if that's what the launcher uses — do NOT invent new sentinels.
- [ ] 4.4 Run → PASS; full jest; tsc.
- [ ] 4.5 Commit: `fix(mobile): analytics mastery/weak areas from real sessions (topic + subtest two-tier grouping)`.

## Task 2 (wave B): Kuya Baw download gate

**Files:** the Kuya chat provider (find it — `KuyaChatProvider`, exposes `openKuya`), `components/TabBar.tsx`, new `components/KuyaDownloadSheet.tsx`.

- [ ] 2.1 Read the provider + `useModelDownload` fully. Expose model status through the provider (or a sibling hook the TabBar can call cheaply — `modelExists()` is a file-stat; do NOT run it on every render: check on tap).
- [ ] 2.2 New `components/KuyaDownloadSheet.tsx` (`StyleSheet.create`, theme tokens like `TargetCoursesCard`'s sheet styles): bottom-sheet Modal with the mascot image (`assets/images/kuya-baw-mascot.png`), title "Kuya Baw needs to download his brain 🧠", body "One-time download (~750 MB). Wi-Fi recommended.", primary Download button → `startDownload()`, Cancel. While `status === 'downloading'`: progress bar (View width %) + `Math.round(progress*100)%` + MB downloaded/total. On `status === 'ready'`: auto-close sheet AND open the chat (call `openKuya`). `status === 'unsupported'`: replace body with "This device doesn't have enough memory (needs ≥ 2 GB RAM) to run Kuya Baw locally." and hide Download.
- [ ] 2.3 TabBar FAB onPress: `ready` → `openKuya()`; otherwise → open the sheet. Determine readiness at tap time (await `modelExists()` or provider state seeded once) — must not add per-render DB/file work.
- [ ] 2.4 tsc + jest (TabBar has tests? run the mobile project) + react-doctor on the new/changed files.
- [ ] 2.5 Commit: `feat(mobile): gate Ask Kuya Baw behind the model download with a progress sheet`.

## Task 3 (wave B): Chat context + guardrails

**Files:** `services/chatContext.ts`, `services/chatPrompts.ts`, `hooks/useKuyaChat.ts`, tests `services/__tests__/chatContext.test.ts` (extend).

- [ ] 3.1 TDD `buildListingsContext(db, question)`: seed local `listings` rows (one exam w/ examDate, one scholarship w/ deadline+grantAmount). Asserts: question "when is the UPCAT?" → block contains the UPCAT title + formatted date, ≤2 listings, each ≤2 lines, fields truncated via the existing 140-char helper; question with no listing mention → returns `undefined` (no block). Match on title words / slug / acronym (case-insensitive token match against the question) PLUS intent words (deadline, exam date, requirements, scholarship, when, magkano) only when a listing token also matches. Run → FAIL → implement → PASS. Format: `[LISTINGS]\n- <title> (<type>): exam <date> / deadline <date>; <grant or 1 key fact>`.
- [ ] 3.2 TDD `buildCourseConnectionContext(db, question)`: seed `careerCourses` (name,cluster,boardExam,demand) + `listings` with `targetCourses` JSON + `focusListings`. Question "is nursing a good course?" → block with cluster, board exam name, demand, and "Accepted by your focused: <listing titles whose targetCourses ∩ {cluster,'all'}>". ≤2 courses. No course match → `undefined`. Run → FAIL → implement → PASS.
- [ ] 3.3 Guardrails in `chatPrompts.ts`: append to ALL THREE prompts a scope block: "SCOPE: You help ONLY with (a) academics — math, science, English, study skills; (b) this app's data — exams, scholarships, courses, the student's progress. For ANYTHING else (gossip, politics, relationships, money advice, current events), reply with exactly one friendly sentence redirecting to studying, e.g. 'Usapang aral muna tayo — ask me about your review or your target exams! 📚'. NEVER invent exam dates, deadlines, cutoffs, or listings not shown in the context blocks; if not in context, say you don't have that info and point to the Exams tab." Keep the math prompt's no-refusal rule for MATH questions (scope rule must not break step-by-step solving).
- [ ] 3.4 Wire into `useKuyaChat` (:163-168): add both builders to the existing `Promise.all`; pass results into `buildChatPrompt` (extend its signature; insert blocks after [STUDENT CONTEXT], before [RELEVANT FLASHCARDS]). Blocks are omitted when `undefined` — prompt unchanged for unrelated questions.
- [ ] 3.5 Full jest + tsc + react-doctor.
- [ ] 3.6 Commit: `feat(mobile): Kuya Baw listings/course context blocks + scoped guardrails`.

## Verification & ship

- [ ] After wave A (Tasks 1,5,4): full `npx jest` + `npx tsc --noEmit` + react-doctor on changed files. Controller pushes + `eas update --branch production` (wave A message: "sync heal + perf + analytics").
- [ ] After wave B (Tasks 2,3): same verification. Controller pushes + OTA wave B.
- [ ] On-device checklist for the user: (1) Review header grows past 1000 → ~1,253 cards after one sync; (2) rapid tab-tapping during first launch no longer freezes; (3) Subject Mastery/Weak Areas populate after a mock exam + a flashcard quiz; (4) Kuya FAB without model → download sheet with progress, auto-opens chat when done; (5) chat answers listing/course questions from real data, redirects off-topic.
