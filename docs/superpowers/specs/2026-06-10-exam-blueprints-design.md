# Exam Blueprints — Data-Driven, Admin-Controlled Exam Mechanics

**Date:** 2026-06-10
**Status:** Approved design → ready for implementation planning
**Source material:** `review_items_and_mechanics` (master DB of 11 PH entrance/scholarship exams)

## Problem

The UPCAT mock exam is hardcoded: 4 fixed subtests (`apps/mobile/utils/upcatExam.ts` `SUBTESTS`), a fixed `app/practice/upcat/` flow, and a just-added flat 60s/question timer. There is no way to represent the other entrance exams (ACET, USTET, DCAT, MSU-SASE, BUCET, WVSU-CAT, DOST-SEI, SM Foundation, …), each of which has its own item counts, time limits, section structure, and strict mechanics (guessing penalty, per-section lockout, spatial/abstract requirements, scoring formulas, course-specific cutoffs).

We want these mechanics stored in an **admin-controllable system** and driven into the **mobile Review screen + Q&A engine**, connected to **exam listings, courses, and the knowledgebase**.

## Decisions (locked during brainstorming)

1. **Engine ambition — blueprint-driven, build from what exists.** Admin-editable blueprints define structure + mechanics. The engine builds the timed mock from questions that EXIST, mapping sections to current question pools where they overlap; sections without content show "coming soon". It enforces the mechanics it can: total + per-section timers, section lock, and Right−¼·Wrong scoring. New spatial/abstract content is authored over time and lights up automatically.
2. **Question→section map — shared skill categories.** A small fixed taxonomy; each question has ONE category; each blueprint section references a category. One "Mathematics" question feeds every exam's math section.
3. **Courses connection — light: link + surfaced notes.** Blueprint ↔ listing ↔ `target_courses` for relevance; course-specific thresholds stored as simple structured notes surfaced to matching students. No automated qualify/disqualify verdict engine.
4. **Architecture — extend the existing schema.** Three new tables + a category table + a `skill_category` column on the existing `upcat_questions`. Reuses the working bank, sync pipeline, mock screen, and flashcard projection.

## Out of scope (YAGNI)

- New spatial/abstract/verbal-analogy **image-based question types** and an item renderer for them. The `Spatial` / `Abstract` categories and `requires_spatial_logic` flag exist so this content can be authored later and surface automatically — but no new item type is built now.
- An automated per-course **qualify/disqualify verdict engine** (percentile calibration). Course thresholds are informational notes only.
- New UPG/GWA percentile scoring model beyond the existing GWA calculator. Scoring notes are displayed text.

## Architecture

### Data model (Supabase Postgres; mirrored to mobile SQLite)

RLS: public read, admin write (mirror existing reference-table policy).

**`exam_skill_categories`** — stable taxonomy, admin-manageable
- `name` text PRIMARY KEY
- `requires_spatial_logic` boolean NOT NULL default false
- `display_order` int NOT NULL default 0
- Seed: Mathematics, Science, English/Language, Reading Comprehension, Verbal Reasoning, Abstract/Non-Verbal Reasoning (spatial=true), Mechanical-Technical, Spatial (spatial=true).

**`exam_blueprints`** — one per exam
- `slug` text PRIMARY KEY — equals `listings.slug` for the exam (e.g. `upcat`, `acet`, `ustet`, `dcat`, `msu-sase`, `bucet`, `dost-sei`, `sm-foundation`, `wvsu-cat`)
- `name` text, `acronym` text
- `total_items` int, `total_time_minutes` int
- `has_guessing_penalty` boolean default false, `guessing_penalty` numeric default 0.25
- `section_blocked` boolean default false  — per-section hard timer (isSectionBlocked)
- `scoring_note` text  — e.g. UPG formula, "60% score + 40% GWA"
- `mechanics_note` text — calculator policy, return of service, etc.
- `status` text default 'draft'  ('draft' | 'published'), `display_order` int, `updated_at` timestamptz

**`exam_blueprint_sections`**
- `id` text PRIMARY KEY (e.g. `<slug>:<n>`)
- `blueprint_slug` text NOT NULL (FK)
- `name` text  — e.g. "Mathematics", "Abstract Reasoning"
- `skill_category` text  — FK to `exam_skill_categories.name`
- `item_count` int
- `time_minutes` int NULL  — used when `section_blocked`
- `requires_spatial_logic` boolean default false  — defaults from category, overridable
- `display_order` int

**`exam_course_notes`** — light course connection
- `id` text PRIMARY KEY
- `blueprint_slug` text NOT NULL (FK)
- `course_cluster` text  — matches `career_courses.cluster` names, or 'all'
- `note` text  — e.g. "BS Nursing ≈ 95th percentile + secondary panel interview"
- `min_percentile` int NULL, `display_order` int

**Question tagging**
- `ALTER TABLE upcat_questions ADD COLUMN skill_category text` (FK to `exam_skill_categories.name`).
- Backfill from existing `subtest`: Mathematics→Mathematics, Science→Science, Language Proficiency→English/Language, Reading Comprehension→Reading Comprehension.
- Flashcard projection (`project_question_bank_to_flashcards`) unaffected.

### Mobile

- Mirror the four new tables into SQLite (drizzle schema + `db/client.ts` migrations + `services/sync.ts` pull, using the paginated `fetchAllPaginated`). The `upcat_questions.skill_category` column added to the local schema + migration + sync select.
- **Generic engine:** new `app/practice/exam/[slug]/` flow (generalize the current `app/practice/upcat/`). For a `slug`:
  - Load the published blueprint + sections + course notes + the local question pool.
  - For each section: sample `item_count` questions tagged with `skill_category` (preferring the exam's own slug-tagged content where present; falling back to the shared category pool). If a section has 0 available questions → show it in the structure preview marked "Content coming soon", excluded from the runnable mock.
  - **Timers:** total countdown from `total_time_minutes`. If `section_blocked`, each section runs its own `time_minutes` countdown that hard-locks and auto-advances on expiry (no carryover). Reuse/refactor the timer just built in `[subtest].tsx`.
  - **Guessing penalty:** if `has_guessing_penalty`, show a one-time pre-start warning modal (Part 4 requirement) and compute `score = correct − guessing_penalty × wrong` (blank = 0), displayed beside the raw count. Otherwise no penalty.
  - **Course notes:** before start and on results, surface `exam_course_notes` whose `course_cluster` matches the student's `targetCourses` (via `career_courses.cluster`), plus `scoring_note` / `mechanics_note`.
  - **Results:** per-section breakdown + a rough percentile band; write to `practice_sessions` (existing streaks/analytics).
- The legacy `upcat` slug becomes just one blueprint; the old `practice/upcat` route redirects to `practice/exam/upcat` (or is replaced) so existing deep links keep working.

### Admin (Next.js)

- New "Exam Blueprints" area: list + CRUD for blueprints; reorderable sections editor; course-notes editor; category-taxonomy editor. Toggle the 3 mechanics flags, set items/times, edit scoring/mechanics notes, publish/draft.
- Add a **skill-category** picker to the question add/edit UI and CSV import (`importUpcatCore` maps a `skill_category` column; default derived from subtest when absent).
- **Seed migration** populating the **9 exams that administer a test** + their sections + notable course notes from the MD (idempotent upsert), category-mapped: DOST-SEI, SM Foundation, UPCAT, ACET, USTET, DCAT, MSU-SASE, BUCET, WVSU-CAT. **OWWA** (selects on DOST-SEI scores) and **CHED CMSP** (exempt from testing, GWA ≥ 93% + income ≤ ₱500k) have no exam of their own — they are captured as informational `mechanics_note` text on the relevant scholarship listing, not as runnable mock blueprints. UPCAT is published (has content); the others are seeded published where their shared sections (Math/Science/English/RC) reuse the existing pool, and their exam-unique sections (Abstract, Verbal, Mechanical-Technical, Spatial) start empty/"coming soon".

### Connections

- **Listings:** `exam_blueprints.slug = listings.slug`. Exams tab + listing detail launch the mock; mock header shows listing context. Only listings with a published blueprint show a "Take mock exam" action.
- **Courses:** `exam_course_notes.course_cluster` ↔ `career_courses.cluster` ↔ `listings.target_courses`; notes surface by the student's chosen `targetCourses`.
- **Knowledgebase:** `upcat_questions.skill_category` ↔ `exam_blueprint_sections.skill_category` ↔ `exam_skill_categories`. Authoring/importing a question in a category instantly feeds every section using it.

## Phasing (each phase its own implementation plan)

1. **Schema + seed + sync** — migrations for the 4 tables + `skill_category` column + RLS; seed the 11 exams from the MD; drizzle schema + mobile migrations + sync pull (paginated); backfill categories. Reproduction-style real-SQLite test for the new sync.
2. **Mobile generic engine** — `practice/exam/[slug]`, blueprint-driven section builder, data-driven total timer, per-section lock, penalty scoring + warning, course notes, content-gap handling; redirect legacy `upcat` route. Unit tests for the builder + scoring + timer transitions.
3. **Admin CRUD + question tagging** — blueprint/section/notes/category CRUD pages + API routes (admin-gated), skill-category picker on add/edit + CSV import. Route + idempotency tests.
4. **Launch points + polish** — wire Exams/listing "Take mock exam", surface notes/flags in UI, percentile band, results polish.

## Testing strategy

- **Unit (mobile):** blueprint→mock builder (section sampling, 0-content sections excluded), penalty vs no-penalty scoring, section-blocked timer transitions, course-note matching by cluster.
- **Sync (mobile):** real-SQLite (better-sqlite3) test of pulling the 4 new tables + `skill_category` (using the `onboardingPersist.repro` / `sync.test` patterns) — guards against schema/migration drift.
- **Admin (vitest):** blueprint CRUD routes, seed idempotency, `importUpcatCore` skill_category mapping, category picker.
- **No-regression:** existing UPCAT mock, flashcard projection, and 662 mobile / 33 admin tests stay green.

## Risks / notes

- **Schema/migration drift:** every NOT NULL column added via migration must carry `.notNull().default()` in the drizzle schema (see `project_schema_migration_notnull_drift`) — this exact class of bug broke onboarding earlier. The phase-1 repro test is the guard.
- **Sync 1000-row cap:** the new tables are small, but use `fetchAllPaginated` for consistency if any grows.
- **Content gap is expected:** non-UPCAT exam-unique sections will be empty until authored; the engine must degrade gracefully (preview + "coming soon"), never crash or present an empty timed run.
- **Legacy route compatibility:** keep `practice/upcat` working via redirect.
