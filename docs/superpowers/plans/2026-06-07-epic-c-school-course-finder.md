# Epic C — School & Course Finder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. QA: `npx react-doctor --project @iskotify/mobile --diff <base>` on changed mobile code; avoid `{n && <JSX/>}` bare-zero.

**Goal:** A School & Course Finder — university directory + profiles + "Top schools for [Course]" board rankings + non-board quality — surfaced as a Universities segment in Listings + finder screens, cross-linked to Epic D careers. (No PRC-validation feature; those source sheets were hallucinated junk and deleted.)

**Architecture:** 6 public-read Supabase tables + mobile mirrors. The only hard dedup is `tertiary_schools` (merge the two university files by normalized name+city); rankings/quality/bar are self-contained reference rows displayed by their own school_name.

**Tech Stack:** Supabase (public-read RLS); Expo RN + Drizzle/expo-sqlite + Jest; self-contained Node CSV parsers reusing `apps/admin/lib/csv/cleaners.ts` / `scripts/scholarshipNormalize.mjs` + the quote-aware reader in `scripts/import-upcat-questions.mjs`.

**Spec:** [docs/superpowers/specs/2026-06-07-epic-c-school-course-finder-design.md](../specs/2026-06-07-epic-c-school-course-finder-design.md)

**Sources:** `…/Iskotify Upgrades/university_profiles_v2 - MASTER.csv` (403), `…/universities_per_province - universities_per_province.csv.csv` (447), `…/_extracted/ISKOTIFY_TOP_SCHOOLS_BY_COURSE_v5__*.csv` (29 board + Bar), `…/_extracted/ISKOTIFY_NON_BOARD_SCHOOLS__Master.csv` (329). Next migration = 022.

---

## Task 1: canonicalizeRegion patch (TDD)

**Files:** Modify `apps/admin/lib/csv/cleaners.ts` (+ test) and `scripts/scholarshipNormalize.mjs` if it has its own region map.

- [ ] **Step 1:** In `cleaners.ts` `canonicalizeRegion`, add aliases: `IVA`→Region IV-A (CALABARZON), `IVB`→Region IV-B (MIMAROPA); and ensure prefix forms like `Region V`, `Region VII`, `Region IV-A` resolve (the data has both `Region V` and `V`). Add to the existing `reg(...)` alias lists. Verify `scripts/scholarshipNormalize.mjs` — if the ETL there needs region canon, mirror the same aliases (or export/import cleaners' version).
- [ ] **Step 2:** In `apps/admin/lib/csv/__tests__/cleaners.test.ts`, add cases: `canonicalizeRegion('IVA')`, `'IVB'`, `'Region V'`, `'Region VII'`, `'Region IV-A'` → correct canonical strings. Run `cd apps/admin && pnpm vitest run lib/csv/__tests__/cleaners.test.ts`.
- [ ] **Step 3:** Commit `feat(admin/csv): canonicalizeRegion handles IVA/IVB + Region-prefix forms`.

## Task 2: Migration 022 — 6 tables + course_taxonomy_map seed

**Files:** Create `supabase/migrations/022_university_tables.sql`, `supabase/seed/course_taxonomy_map_seed.sql`

- [ ] **Step 1: migration** (public-read RLS + updated_at triggers via the DO-loop pattern from 021):
```sql
CREATE TABLE IF NOT EXISTS tertiary_schools (
  id text PRIMARY KEY, name text NOT NULL, acronym text, region text, province text, city text,
  type text, is_suc boolean NOT NULL DEFAULT false, is_luc boolean NOT NULL DEFAULT false,
  deped_school_id int, rank_in_province int, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_tertiary_region ON tertiary_schools(region);
CREATE INDEX IF NOT EXISTS idx_tertiary_type ON tertiary_schools(type);
CREATE TABLE IF NOT EXISTS university_profiles (
  school_id text PRIMARY KEY REFERENCES tertiary_schools(id), data_tier text, institution_type text,
  year_established text, known_for_courses text[] NOT NULL DEFAULT '{}', prc_top_courses text[] NOT NULL DEFAULT '{}',
  ched_coe_cod text, accreditation text, entrance_exam_name text, entrance_exam_acronym text,
  testing_center_type text, application_open text, application_close text, exam_month text,
  estimated_passing_rate text, estimated_slots text, tuition_fee_range text, free_tuition boolean,
  academic_calendar text, courses_offered text[] NOT NULL DEFAULT '{}', scholarships_offered text[] NOT NULL DEFAULT '{}',
  website_url text, application_portal_url text, facebook_url text, exam_difficulty int,
  notable_programs text[] NOT NULL DEFAULT '{}', prc_strong_boards text[] NOT NULL DEFAULT '{}',
  notes text, data_confidence text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS course_school_rankings (
  id text PRIMARY KEY, course_tab text NOT NULL, course_name text, rank int, school_name text NOT NULL,
  region text, province text, wilson_score numeric, raw_pass_rate numeric, total_examinees int,
  total_passers int, years_with_data text, exam_periods int, tertiary_school_id text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_rankings_tab ON course_school_rankings(course_tab, rank);
CREATE TABLE IF NOT EXISTS course_school_quality (
  id text PRIMARY KEY, school_name text NOT NULL, region text, province text, city text,
  course_standardized text, course_group text, school_type text, ched_coe_cod text, quality_score int,
  quality_tier text, accreditations text[] NOT NULL DEFAULT '{}', has_prc_board boolean,
  qs_subject_rank text, data_confidence text, tertiary_school_id text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_quality_group ON course_school_quality(course_group);
CREATE TABLE IF NOT EXISTS bar_results (
  id text PRIMARY KEY, school_name text NOT NULL, region text, province text, year int,
  pass_rate numeric, national_avg numeric, sc_rank int, notes text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS course_taxonomy_map (
  course_tab text PRIMARY KEY, career_course_id text, label text, kind text, updated_at timestamptz NOT NULL DEFAULT now());

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tertiary_schools','university_profiles','course_school_rankings','course_school_quality','bar_results','course_taxonomy_map'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t||'_read', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t||'_updated_at', t);
  END LOOP; END $$;
```
- [ ] **Step 2: course_taxonomy_map seed** — hand-author `supabase/seed/course_taxonomy_map_seed.sql`: map the 29 board tab codes → Epic D `career_courses.course_id` (e.g. ('LET','TEA-003','Education (LET)','board'), ('NLE','HLT-005','Nursing (NLE)','board'), ('CE','ENG-006','Civil Engineering','board'), ('CPA','BUS-001','Accountancy (CPA)','board'), ('CRIM','OTH-003','Criminology','board'), ('ECE','ENG-009',...), ('ME','ENG-017',...), ('ChemE','ENG-005',...), ('MedTech','HLT-003',...), ('Bar','OTH-009','Law (Bar)','board'), ('PLE','OTH-008','Medicine (PLE)','board'), ('MARINA','MAR-001',...), …). For tabs with no clean career match, `career_course_id` = NULL but keep label. Idempotent ON CONFLICT.
- [ ] **Step 3: Commit** `feat(db): university/course-finder tables (022) + course_taxonomy_map seed` (controller applies at Task 10).

## Task 3: ETL — tertiary_schools + university_profiles (dedup)

**Files:** Create `scripts/parse-universities.mjs` + `supabase/seed/tertiary_schools_seed.sql`, `supabase/seed/university_profiles_seed.sql`

- [ ] **Step 1:** Parse MASTER (403) + per-province (447). Reuse the quote-aware reader + `canonicalizeRegion`/`resolveSentinel`/`decodeMojibake`. Build `tertiary_schools` = union deduped by `slug(name)+'|'+slug(city)` (first wins; merge type/is_suc/is_luc/rank_in_province/acronym/region/province/city; id = `slug(name)`, suffix `-2` on id collision). `university_profiles` = MASTER rows (school_id = matched tertiary slug), multi-value (`courses_offered`, `known_for_courses`, `scholarships_offered`, `prc_top_courses`) split `;`/`,`→text[]; `free_tuition` = (type SUC/LUC) OR tuition text contains 'free'/'no tuition' else null; `data_confidence` normalized (HIGH/MEDIUM/LOW/VERY LOW); merge per-province `notable_programs`/`prc_strong_boards` into the profile where matched. NO NULL into NOT NULL (name); text[]→ARRAY[...]/'{}'.
- [ ] **Step 2:** Run; report tertiary_schools count (~650-720 after dedup), university_profiles count (403), dedup-merge count, null-rates; spot-check 5 (incl. one merged across both files). Confirm no dup ids.
- [ ] **Step 3:** Commit `feat(schools): ETL + seeds for tertiary_schools + university_profiles (deduped)`.

## Task 4: ETL — course_school_rankings + bar_results

**Files:** Create `scripts/parse-rankings.mjs` + `supabase/seed/course_school_rankings_seed.sql`, `supabase/seed/bar_results_seed.sql`

- [ ] **Step 1:** For each of the 29 board `ISKOTIFY_TOP_SCHOOLS_BY_COURSE_v5__<Course>.csv` (NOT Bar, NOT INDEX): detect the data header row (skip the ~4 emoji/metadata rows; real data rows start where col1 parses as an integer rank). course_tab = derive from filename; map columns rank/school_name(decodeMojibake for "Los Ba?os")/region(canon)/province/wilson_score/raw_pass_rate/total_examinees/total_passers/years_with_data/exam_periods. id = `${course_tab}-${rank}-${slug(school_name)}` (unique). `tertiary_school_id` = best-effort normalized-name match to a tertiary_schools id (nullable — do NOT block on it). Parse the Bar tab (different schema) → `bar_results`. Idempotent.
- [ ] **Step 2:** Run; report total ranking rows (~6,265) + per-course counts + bar rows; spot-check CE top-3 + LET count (~2,377). No dup ids.
- [ ] **Step 3:** Commit `feat(schools): ETL + seeds for course_school_rankings + bar_results`.

## Task 5: ETL — course_school_quality

**Files:** Create `scripts/parse-nonboard.mjs` + `supabase/seed/course_school_quality_seed.sql`

- [ ] **Step 1:** Parse `ISKOTIFY_NON_BOARD_SCHOOLS__Master.csv`, FILTER `school_name != ''` (drops the ~670 empty rows → 329). Map school_name/region(canon)/province/city/course_standardized/course_group/school_type/ched_coe_cod/quality_score/quality_tier/has_prc_board; compose `accreditations` text[] from the PAASCU/AACCUP/PACUCOA/ABET/AACSB level+year columns (only non-empty); qs_subject_rank from QS columns; data_confidence. id = `${slug(school_name)}-${slug(course_standardized)}`. tertiary_school_id best-effort. Idempotent.
- [ ] **Step 2:** Run; report 329 rows, course_group distribution, tier distribution; spot-check 3. No dup ids.
- [ ] **Step 3:** Commit `feat(schools): ETL + seed for course_school_quality (non-board)`.

## Task 6: Mobile schema mirror + sync

**Files:** Modify `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`, `apps/mobile/services/sync.ts` (+ sync test)

- [ ] **Step 1:** schema.ts: 6 Drizzle tables mirroring 022 (text[]→TEXT JSON '[]', booleans {mode:'boolean'}, numerics real/int, + remoteUpdatedAt on synced): `tertiarySchools`, `universityProfiles`, `courseSchoolRankings`, `courseSchoolQuality`, `barResults`, `courseTaxonomyMap`.
- [ ] **Step 2:** client.ts MIGRATIONS: CREATE TABLE for the 6 (SQLite types; text[]→TEXT NOT NULL DEFAULT '[]'; booleans INTEGER DEFAULT 0). Index on rankings(course_tab).
- [ ] **Step 3:** sync.ts: pull the 6 (full pull for tertiary_schools/university_profiles/course_taxonomy_map/bar_results; `course_school_rankings` is large — pull all but note it; `course_school_quality` full). Upsert loops: text[]→JSON.stringify, booleans !!. (Rankings ~6,265 rows sync into SQLite — acceptable.)
- [ ] **Step 4:** Extend real-SQLite sync test: seed a tertiary_schools + course_school_rankings row, assert they land. Fixtures + mocks for the 6 new from() calls.
- [ ] **Step 5:** tsc + sync test green. Commit `feat(mobile/schools): 6 university/course tables mirror + sync`.

## Task 7: Directory + university profile screens

**Files:** Create `apps/mobile/app/schools/index.tsx`, `apps/mobile/app/schools/[slug].tsx`

- [ ] **Step 1: schools/index.tsx** — load `tertiarySchools` (+ join university_profiles for confidence/free_tuition); search by name; filter chips: region, type, free-tuition; each row (name, acronym, type, region · province, confidence badge) → `schools/[slug]`. Use useMemo over local rows.
- [ ] **Step 2: schools/[slug].tsx** — load tertiary_schools + university_profiles by id. Header (name, acronym, type, region/province/city, data_confidence badge). Sections (render only when present, parse text[] JSON safely): accreditation + COE/COD badges; tuition (+ free-tuition chip); entrance exam (name/acronym, exam_month, difficulty, testing center) — link to a matching exam listing if `listings` has one (best-effort by acronym/name); known-for / notable programs; courses offered; scholarships offered; links (website/portal/FB). Permanent note for LOW/MEDIUM confidence: "Details may be unconfirmed — verify on the official site." No bare-zero.
- [ ] **Step 3:** tsc + react-doctor + render tests (mock local rows). Commit `feat(mobile/schools): directory + university profile screens`.

## Task 8: Course finder + Listings Universities segment + cross-links

**Files:** Create `apps/mobile/app/schools/course/[code].tsx`; Modify `apps/mobile/app/(tabs)/listings.tsx`, `apps/mobile/app/career/[courseId].tsx`

- [ ] **Step 1: schools/course/[code].tsx** — `[code]` = course_tab. Load `courseSchoolRankings` where course_tab=code (ordered by rank) → list (rank, school_name, wilson_score, raw_pass_rate, total_examinees). Also show `courseSchoolQuality` rows for the mapped course_group when relevant. Cross-link: via `courseTaxonomyMap`, link to `career/[careerCourseId]` + show Epic D AI-Safe-Score for that course (read ai_career_impact). Permanent "based on PRC historical pass-rate data — verify on official PRC releases" note.
- [ ] **Step 2: Listings Universities segment** — in `(tabs)/listings.tsx`, add a "Universities" segment (Exams/Scholarships/Universities). Universities list = `tertiarySchools` (search + region/type filters) → `schools/[slug]`. (Keep existing Exams/Scholarships behavior.) Optionally a "Courses" affordance linking to a course-finder index (or reuse career browse).
- [ ] **Step 3: career cross-link** — in `career/[courseId].tsx`, add a "🏫 Top schools for this course" entry that, via `courseTaxonomyMap` (career_course_id → course_tab), routes to `schools/course/[tab]` when a mapping exists.
- [ ] **Step 4:** tsc + react-doctor + tests (listings segment). Commit `feat(mobile/schools): course finder + Listings Universities segment + career cross-link`.

## Task 9: Onboarding National→Regional→Scholarships grouping

**Files:** Modify `apps/mobile/app/onboarding.tsx`

- [ ] **Step 1:** Epic G grouped step-2 picker by Exams/Scholarships. Extend so university-type listings (if any in `listings`) — OR a section sourced from `tertiarySchools` — are grouped as "National Universities" then "Regional Universities" then "Scholarships". Since the picker currently selects `listings` (exam/scholarship) for the focus, keep that selection model; if universities aren't in `listings`, the grouping applies to the exam/scholarship sections + a note (don't overbuild). Light change — match Epic G's grouping approach. (If university focus-selection isn't in scope of the listings focus model, just relabel/group the existing sections and SKIP adding universities to the focus picker — note it.)
- [ ] **Step 2:** tsc + onboarding test. Commit `feat(mobile/onboarding): National/Regional univ + Scholarships grouping`.

## Task 10: Verify + apply

- [ ] **Step 1:** `cd apps/mobile && pnpm test | tail -6`; `cd apps/admin && pnpm test | tail -4`; `npx react-doctor --project @iskotify/mobile --diff <epic-base> --no-warnings --no-telemetry`.
- [ ] **Step 2 (controller, MCP):** apply migration 022; apply seeds via a subagent (tertiary_schools BEFORE university_profiles for FK; course_school_rankings is large → chunk on statement boundaries; then quality, bar, taxonomy_map). Verify counts: tertiary_schools ~700, university_profiles 403, course_school_rankings ~6,265, course_school_quality 329, bar_results ~50, course_taxonomy_map ~29; 0 orphan university_profiles FK. `get_advisors security`.
- [ ] **Step 3:** Manual smoke (after OTA): Listings → Universities segment → a university profile (badges, tuition, exam); schools/course for Nursing → ranking list; career Nursing → "Top schools" cross-link.

---

## Self-review against the spec
- C1 schema → Tasks 1–2 ✓ (region patch, 6 tables, taxonomy map; no PRC/validation_status)
- C2 ETL → Tasks 3–5 ✓ (tertiary dedup, rankings+bar, non-board quality; no PRC step)
- C3 sync → Task 6 ✓
- C4 UI → Tasks 7–8 ✓ (directory, profile, course finder, Listings Universities segment, career cross-link, AI-Safe-Score reuse)
- C5 onboarding → Task 9 ✓
- Delivery via MCP (chunk rankings) + OTA → Task 10 ✓
- Type/name consistency: `tertiary_schools/university_profiles/course_school_rankings/course_school_quality/bar_results/course_taxonomy_map` ✓
