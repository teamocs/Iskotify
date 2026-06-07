# Epic C — School & Course Finder — Design Spec

**Date:** 2026-06-07
**Status:** Draft for review
**Master plan:** [2026-06-06-mvp-upgrades-master-plan.md](2026-06-06-mvp-upgrades-master-plan.md) (Epic C §2 — heaviest/XL)
**Sources (`…/Iskotify Upgrades/`):** `university_profiles_v2 - MASTER.csv` (403), `universities_per_province - universities_per_province.csv.csv` (447), `_extracted/ISKOTIFY_TOP_SCHOOLS_BY_COURSE_v5__*.csv` (29 board courses, ~6,265 rows + Bar), `_extracted/ISKOTIFY_NON_BOARD_SCHOOLS__Master.csv` (329), `_extracted/ISKOTIFY_VALIDATION_vs_PRC_MEDIA__*.csv` (INTERNAL QA only).
**Locked decisions:** ship ALL rows with confidence badges (no gating); PRC-validation INTERNAL-only (QA flag, never user-facing); verified badge gated on STRONG MATCH; course taxonomy = loose join now (open Q6); **IA = Universities segment in the Listings tab + detail/finder screens (no new tab); FULL scope.**

---

## 1. Goal

A School & Course Finder: browse/search ~700+ tertiary schools (region/province/type/free-tuition), per-university profiles (accreditation, COE/COD, tuition, entrance exam, links, confidence badge), and "Top schools for [Course]" rankings (PRC board Wilson scores + non-board accreditation quality) — surfaced as a **Universities segment in Listings** + a course-finder, cross-linked to Epic D career pages and exam listings.

## 2. Architecture (5 areas)

- **C1 Schema** (migration 022): `tertiary_schools` (canonical HEI directory, deduped), `university_profiles` (rich 1:1 detail), `course_school_rankings` (board, self-contained), `course_school_quality` (non-board, self-contained), `bar_results`, `course_taxonomy_map` (board-tab→career course_id). All public-read; PRC validation is NOT a user table — it contributes a `validation_status` QA flag on rankings. Patch `cleaners.ts`/`scholarshipNormalize.mjs` `canonicalizeRegion` gaps (`IVA`/`IVB`, `Region V`/`Region VII` prefixes). Mobile mirrors all six.
- **C2 ETL/ingestion**: Node parsers (reuse quote-aware reader + cleaners). The ONLY hard dedup is `tertiary_schools` (merge the two university files by normalized name+city). Rankings/quality/bar are standalone reference rows (keep their own school_name/region/province; `tertiary_school_id` best-effort nullable). Confidence tiers from `data_confidence`; `validation_status` from the PRC SUMMARY verdict. → committed seeds.
- **C3 Sync**: pull all six tables on launch (rankings ~6,265 + quality 329 are fine for SQLite).
- **C4 Mobile UI**: Listings "Universities" segment; `schools/index` directory (region/province/type/free-tuition filters + search); `schools/[slug]` university profile; `schools/course/[code]` "Top schools for [Course]" (board Wilson ranks + non-board quality); cross-links to `career/[courseId]` + exam listings.
- **C5 Onboarding**: segment the picker National Univ → Regional Univ → Scholarships (using tertiary_schools type/region; keep DepEd SchoolPicker for HS).

## 3. Data model (C1, migration 022) — public-read RLS + updated_at trigger

- `tertiary_schools(id text pk /*slug*/, name text NOT NULL, acronym, region, province, city, type text /*SUC|LUC|Private Sectarian|Private Non-sectarian|State College|...*/, is_suc boolean, is_luc boolean, deped_school_id int /*nullable ref schools.id, soft*/, rank_in_province int, updated_at)`
- `university_profiles(school_id text pk references tertiary_schools(id), data_tier, institution_type, year_established, known_for_courses text[], prc_top_courses text[], ched_coe_cod, accreditation, entrance_exam_name, entrance_exam_acronym, testing_center_type, application_open, application_close, exam_month, estimated_passing_rate, estimated_slots, tuition_fee_range, free_tuition boolean, academic_calendar, courses_offered text[], scholarships_offered text[], website_url, application_portal_url, facebook_url, exam_difficulty int, notable_programs text[], prc_strong_boards text[], notes, data_confidence text /*HIGH|MEDIUM|LOW|VERY LOW*/, updated_at)`
- `course_school_rankings(id text pk, course_tab text /*LET,NLE,CE,...*/, course_name, rank int, school_name text NOT NULL, region, province, wilson_score numeric, raw_pass_rate numeric, total_examinees int, total_passers int, years_with_data, exam_periods int, tertiary_school_id text /*nullable best-effort*/, validation_status text /*STRONG MATCH|PARTIAL|DATA GAP|null*/, updated_at)` — indexes on (course_tab, rank).
- `course_school_quality(id text pk, school_name text NOT NULL, region, province, city, course_standardized, course_group, school_type, ched_coe_cod, quality_score int, quality_tier text, accreditations text[], has_prc_board boolean, qs_subject_rank, data_confidence, tertiary_school_id text nullable, updated_at)`
- `bar_results(id text pk, school_name, region, province, year int, pass_rate numeric, national_avg numeric, sc_rank int, notes, updated_at)`
- `course_taxonomy_map(course_tab text pk, career_course_id text, label, kind text /*board|non-board*/)` — static seed (LET→TEA-003, NLE→HLT-005, CE→ENG-006, CPA→BUS-001, …).

**Mobile (SQLite):** mirror all six (text[]→JSON TEXT, booleans int). No FTS needed (filter/search is local ILIKE-style over the mirrored directory).

**Region canon patch:** add to `apps/admin/lib/csv/cleaners.ts` + `scripts/scholarshipNormalize.mjs` (whichever the ETL uses) `canonicalizeRegion` aliases: `IVA`→IV-A, `IVB`→IV-B, and `Region V`/`Region VII`/etc. prefix forms.

## 4. ETL (C2)

Self-contained Node parsers (`scripts/parse-*-schools.mjs`), reuse quote-aware reader + `stripBom`/`decodeMojibake`/`resolveSentinel`/`canonicalizeRegion`:
- **tertiary_schools** (the dedup): union of MASTER (403) + per-province (447). Normalize key = `slug(name)+'|'+slug(city)` after canonicalizing; first occurrence wins; merge type/region/rank/is_suc/is_luc. slug id = `slug(name)` (suffix on collision). Emit ~700+ rows.
- **university_profiles**: from MASTER (403), school_id = the matched tertiary_schools slug; multi-value (`courses_offered`, etc.) split on `;`/`,`→text[]; `free_tuition` derived from type (SUC/LUC → true tendency) or tuition text; `data_confidence` normalized. Merge per-province `notable_programs`/`prc_strong_boards`/`rank_in_province` where the school matches.
- **course_school_rankings**: parse the 29 board tabs (skip the 4 emoji/metadata rows; data rows start where col1 is an integer rank). school_name/region/province/wilson_score/raw_pass_rate/examinees/passers/periods. `validation_status` joined from VALIDATION_SUMMARY verdict by course+school (#1/#2 only). `tertiary_school_id` = best-effort normalized-name match (nullable).
- **course_school_quality**: NON_BOARD Master (filter `school_name != ''` → 329); accreditations text[] composed from the PAASCU/AACCUP/PACUCOA/ABET/AACSB columns; quality_tier/score; tertiary_school_id best-effort.
- **bar_results**: the Bar tab (year-by-year SC top schools).
- **course_taxonomy_map**: hand-authored static seed (board tab → career_courses.course_id) — ~30 rows; unmatched tabs map to null career_course_id but keep a label.
Each parser: row-count + null-rate report; **no NULL into NOT NULL** (emit ''/ARRAY[]); idempotent `ON CONFLICT (pk) DO UPDATE`; spot-checks. PRC SUMMARY is read ONLY to compute validation_status — never emitted as a user table.

## 5. Mobile UI (C4)

- **Listings "Universities" segment** (`(tabs)/listings.tsx`): add a third segment (Exams / Scholarships / **Universities**). Universities list = `tertiary_schools` (search + region/type filters), each card → `schools/[slug]`. (This fulfills Epic G's deferred Listings restructure for the Universities part; Courses segment can be the course-finder entry.)
- `apps/mobile/app/schools/index.tsx` — full directory: search by name, filters (region, province, type, free-tuition), confidence badge per row; → `schools/[slug]`.
- `apps/mobile/app/schools/[slug].tsx` — university profile: header (name, acronym, type, region/province/city, confidence badge), accreditation + COE/COD badges, tuition (+ free-tuition chip), entrance exam (name, month, difficulty, testing center) cross-linked to a matching exam listing when one exists, known-for / notable programs, scholarships offered, links (website/portal/FB). Permanent "details may be unconfirmed — verify on the official site" note for LOW/MEDIUM confidence.
- `apps/mobile/app/schools/course/[code].tsx` — "Top schools for [Course]": board Wilson ranking list (rank, school, wilson score, pass rate, examinees) + a "STRONG MATCH ✓ (PRC-validated)" badge where validation_status='STRONG MATCH'; a non-board quality section when applicable; cross-link to `career/[courseId]` via `course_taxonomy_map`. Entry from career detail ("Top schools for this course") + a Courses segment/finder.
- **AI-Safe-Score** reuse: on the course-finder + (optionally) Listings Courses segment, show Epic D's `ai_career_impact.ai_safety_score` for the mapped course (via course_taxonomy_map → career_course → ai impact). (Lightweight; the data exists.)

## 6. Onboarding (C5)
Extend the step-2 picker grouping (Epic G grouped Exams/Scholarships) to: **National Universities → Regional Universities → Scholarships** using `tertiary_schools` type/region for the university groups (National = NCR/major SUCs vs Regional). Keep the DepEd `SchoolPicker` for the student's own high school (step 1). Light — reuse existing grouping UI.

## 7. Testing
- ETL: dedup-key normalization unit tests; region-canon patch tests (IVA/IVB/Region V); rank-row detection (skip emoji/metadata rows); accreditation composition; row-count/null-rate reports + spot-checks.
- Sync: the six tables land in SQLite (extend real-SQLite sync test; text[] round-trip).
- UI: directory filters; university profile renders confidence badge + sections; course-finder ranking list + STRONG MATCH badge; Listings Universities segment.
- react-doctor `--project @iskotify/mobile`; full mobile + admin suites green.

## 8. Delivery
Migration 022 + the seeds applied via Supabase MCP at verify (next migration = 022). The board-rankings seed is large (~6,265 rows) — apply in chunks. Mobile ships in the final-batch OTA.

## 9. Sequencing (plan → bite-sized TDD)
1. cleaners region-canon patch (IVA/IVB/Region-prefix) + tests.
2. Migration 022 (6 tables) + course_taxonomy_map seed.
3. ETL: tertiary_schools + university_profiles (dedup) → seeds + tests.
4. ETL: course_school_rankings + bar_results → seeds.
5. ETL: course_school_quality → seed.
6. Mobile schema mirror (6 tables) + sync.
7. schools/index directory + schools/[slug] profile.
8. schools/course/[code] finder + Listings Universities segment + career cross-link.
9. Onboarding National→Regional→Scholarships grouping.
10. Verify (suites, react-doctor) + apply 022 + seeds via MCP (chunk rankings) + data-count verification.

## 10. Open questions (proposed defaults)
- tertiary_schools dedup = normalized-exact (slug name+city), not Levenshtein — accept residual near-dup rows (documented). (Proposed.)
- rankings/quality displayed by their own school_name; `tertiary_school_id` FK is best-effort/nullable (no hard join required for display). (Proposed.)
- free_tuition derived: SUC/LUC → true, else from tuition text/"free"; null when unknown. (Proposed.)
- course_taxonomy_map hand-seeded for the 29 board tabs; non-board groups loose-linked by course_group. (Proposed.)
