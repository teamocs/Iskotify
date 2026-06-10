# Production Data Layer — Design Spec (approved 2026-06-10)

User goal: production-ready data layer. (a) ALL Supabase data (listings, scholarships, exams, courses, etc.) loads ONCE at install, lives in local SQLite, and new/changed rows sync silently in the background without affecting performance. (b) Redis-STYLE on-device cache (in-memory TTL + invalidation) in front of local SQLite. (c) SQL aggregation + indexes for hot screens. Scope decision: NO async-driver migration (separate later effort).

## 1. Query cache layer — `services/queryCache.ts`

Redis-style in-memory key-value cache, pure TS:
- `cachedQuery<T>(key, ttlMs, fetcher: () => Promise<T>): Promise<T>` — fresh hit → return cached (no DB); stale hit → return stale IMMEDIATELY and refresh in background (stale-while-revalidate), notifying subscribers; miss → fetch, store, return.
- `invalidate(prefix: string)` — drops all keys starting with prefix; notifies subscribers.
- `subscribe(prefix, cb)` / unsubscribe — tiny emitter so hooks re-render when a background refresh or invalidation lands.
- No persistence (SQLite IS the persistent layer); cache resets per app session. Max-entries guard (e.g. 200) with simple eviction.
- Unit tests: TTL expiry, SWR behavior (stale served + refresh fired once), invalidation notify, concurrent dedup (two calls same key while fetching → one fetcher run).

**Invalidation wiring (write paths):**
- sync completion (end of `syncOnLaunch`) → `invalidate('')` (everything — catalog changed).
- `recordSession` + user_progress writes → `invalidate('home:')`, `invalidate('analytics:')`, `invalidate('practice:')`.
- settings writes (`updateSettings`) → `invalidate('settings:')`, `invalidate('home:')`.
- focus listings add/remove → `invalidate('home:')`, `invalidate('practice:')`.

**Consumers:** `useHomeStats` (`home:stats`), `usePracticeData` (`practice:data:<slug>`), `useAnalytics` (`analytics:<slug>`), listing detail blueprint check (`blueprints:slugs`). TTLs ~30s (these are local reads; the TTL mainly collapses rapid re-focus storms — invalidation handles correctness).

## 2. SQL aggregation (hot hooks stop hauling tables into JS)

- `useHomeStats` (currently: ALL user_progress + ALL flashcards + ALL topics into JS):
  - todayAccuracy → `SELECT count(*) total, sum(correct) ok FROM user_progress WHERE answered_at >= :todayStart`.
  - streak + practiceDayIndices → `SELECT DISTINCT CAST(answered_at/86400000 AS int) d FROM user_progress` (≤ a few hundred small rows); existing pure fns consume the day list (adapt signatures or map rows).
  - weakTopics → `SELECT f.topic_id, count(*) total, sum(p.correct) ok FROM user_progress p JOIN flashcards f ON f.id=p.flashcard_id GROUP BY f.topic_id` (+ topics name join or small map); JS keeps only the <60% filter/sort/slice.
  - Drizzle: use `sql` template aggregates; keep result shapes identical (parity-tested).
- `usePracticeData`: per-topic counts → `GROUP BY topic_id`; listing filter pushed into SQL with `listing_slugs LIKE '%"<slug>"%'` (JSON-array-of-strings column; slugs are [a-z0-9-], no escaping hazard). No more 1,253 JSON.parse per focus.
- `useAnalytics`: reads go through cache; grouping logic unchanged (sessions table small).
- Parity tests (real SQLite): seed realistic rows; assert new SQL paths return identical values to the previous JS computations (port the old computation into the test as the oracle).

## 3. Indexes (MIGRATIONS + CREATE_SQL)

- `user_progress(answered_at)`, `practice_sessions(completed_at)`, `practice_sessions(listing_slug)`.

## 4. Full local mirror — every catalog table incremental

Convert ALL remaining full-pull catalog tables in `services/sync.ts` to the `.gt('updated_at', since)` cursor (they all carry updated_at in Supabase): career_courses, career_countries, career_programs, ai_career_impact, tertiary_schools, university_profiles, course_school_rankings (keep pagination), course_school_quality, bar_results, course_taxonomy_map, exam_skill_categories, exam_blueprints, exam_blueprint_sections, exam_course_notes, upcat_cutoffs. Exceptions: upcat_passages has no updated_at column remotely → keep full pull (~23 rows, trivial) with a comment.
- Verify each table's remote updated_at exists before converting (information_schema check); any table lacking it stays full-pull with a comment.
- Net effect: install = one full pull (since=epoch); every later launch transfers only changed rows. The Task-1 `syncRev` heal already forces one full re-pull when cursor semantics change — bump `SYNC_REV` to 2 with this change so existing devices baseline cleanly.

## 5. Silent background sync

- Defer `syncOnLaunch` start behind `InteractionManager.runAfterInteractions()` (+ the existing fire-and-forget) so first-screen interactions settle before network/DB work.
- Keep Wave-A chunked transactions + yields. After sync completes → cache `invalidate('')` so screens pick up new data on next focus without any reload jank.

## 6. Unpublish propagation (correctness gap found in review)

Flashcards pull filters `eq('status','published')` → unpublished/demoted cards linger on devices forever. Fix: remove the eq filter, pull `status`, store it locally (schema: flashcards.status with `.notNull().default('published')` + ALTER migration), and make local readers (usePracticeData, FTS search, projections into decks) filter `status='published'`. Blueprint pull keeps its eq filter? No — same change for exam_blueprints: pull all statuses, store status (column already exists locally), local `getExamBlueprint`/`listPublishedBlueprintSlugs` already filter by status === 'published' (verified) — just remove the remote eq filter so unpublish propagates. upcat_questions: same pattern — local builders must filter status; verify and align.

## Verification & ship

Jest (cache unit tests, SQL parity tests on real SQLite, sync incremental tests), tsc, react-doctor on changed RN files. No app.json bump (JS-only). One OTA wave. On-device checklist: smooth taps during/after launch sync; Home/Review/Analytics instant on re-visits; admin unpublish disappears from device after next launch; second launch transfers near-zero rows (verify via log line: rows-pulled count per table).
