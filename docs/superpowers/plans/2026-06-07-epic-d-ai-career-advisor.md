# Epic D — AI Career Advisor (Kuya Career Mode) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. QA: `npx react-doctor --project @iskotify/mobile --diff <base>` on changed mobile code; avoid `{n && <JSX/>}` bare-zero.

**Goal:** Career datasets + Kuya career-advisor RAG ([CAREER FACTS] + [AI CAREER IMPACT]) + course-career/country screens with AI-Safe-Score.

**Architecture:** Clone Epic A's Kuya FTS-RAG (`upcat_facts`→`career_facts`) + Epic B's CSV importers. 6 public-read Supabase tables + mobile mirrors + `career_facts_fts`. Screens reach data from the local mirror.

**Tech Stack:** Supabase (public-read RLS); Expo RN + Drizzle/expo-sqlite + Jest; self-contained Node CSV parsers.

**Spec:** [docs/superpowers/specs/2026-06-07-epic-d-ai-career-advisor-design.md](../specs/2026-06-07-epic-d-ai-career-advisor-design.md)

**Sources:** `…/Iskotify Upgrades/_extracted/Iskotify_Career_Destinations__*.csv` + `…/Iskotify Upgrades/ai_career_impact_context - ai_career_impact_context.csv.csv`. Next migration = 021.

---

## Task 1: Migration 021 — 6 career tables

**Files:** Create `supabase/migrations/021_career_tables.sql`

- [ ] **Step 1: Write it** (public-read RLS + updated_at trigger on each; `text[]` for multi-value):
```sql
CREATE TABLE IF NOT EXISTS career_courses (
  course_id text PRIMARY KEY, name text NOT NULL, cluster text, career_tag text, demand text,
  board_exam boolean NOT NULL DEFAULT false, board_exam_name text, duration_years numeric,
  top_countries text[] NOT NULL DEFAULT '{}', summary text, student_tip text, ai_note text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS career_destinations (
  id text PRIMARY KEY, course_id text REFERENCES career_courses(course_id), country text NOT NULL,
  demand_rating text, salary_min numeric, salary_max numeric, salary_local text, salary_type text,
  visa_pathway text, pr_pathway text, credential text, licensing_exam text, language_required text,
  timeline_months int, program_name text, specializations text[] NOT NULL DEFAULT '{}',
  notes text, saturation_warning text, source text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_career_dest_course ON career_destinations(course_id);
CREATE INDEX IF NOT EXISTS idx_career_dest_country ON career_destinations(country);
CREATE TABLE IF NOT EXISTS career_countries (
  code text PRIMARY KEY, name text NOT NULL, region text, immigration_system text, why_demand text,
  language_required text, pr_pathway text, notes text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS career_programs (
  id text PRIMARY KEY, name text NOT NULL, country_region text, courses_covered text[] NOT NULL DEFAULT '{}',
  managing_body text, slots text, requirements text, immigration_outcome text, website text, notes text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_career_impact (
  course_id text PRIMARY KEY, course_name text NOT NULL, cluster text, board_exam boolean NOT NULL DEFAULT false,
  board_exam_name text, automation_risk_low int, automation_risk_high int, ai_safety_score int,
  ai_safety_label text, color_code text, what_ai_takes_over text[] NOT NULL DEFAULT '{}',
  what_stays_human text[] NOT NULL DEFAULT '{}', new_jobs_emerging text[] NOT NULL DEFAULT '{}',
  skills_to_develop text[] NOT NULL DEFAULT '{}', career_outlook_2030 text, key_stat text, key_source text,
  key_quote text, quote_by text, ph_advantage text, ph_notes text, kuya_baw_summary text, last_updated text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS career_facts (
  id text PRIMARY KEY, course_id text, query_type text, course_name text NOT NULL,
  quick_answer text NOT NULL, key_caveat text, point_to text, updated_at timestamptz NOT NULL DEFAULT now());

-- RLS public-read + updated_at triggers for all six
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['career_courses','career_destinations','career_countries','career_programs','ai_career_impact','career_facts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t||'_read', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t||'_updated_at', t);
  END LOOP; END $$;
```
- [ ] **Step 2: Commit** `feat(db): career_* tables (courses/destinations/countries/programs/ai_impact/facts)` (controller applies via MCP at Task 9).

## Task 2: Mobile schema + FTS + sync

**Files:** Modify `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`, `apps/mobile/services/sync.ts`

- [ ] **Step 1: schema.ts** — add 6 Drizzle tables mirroring Task 1 (`text[]`→TEXT JSON default `'[]'`, booleans `{mode:'boolean'}`, numerics→real/integer): `careerCourses`, `careerDestinations`, `careerCountries`, `careerPrograms`, `aiCareerImpact`, `careerFacts` (+ `remoteUpdatedAt` integer on the synced ones).
- [ ] **Step 2: client.ts MIGRATIONS** — `CREATE TABLE IF NOT EXISTS` for the 6 tables, then the FTS5 (clone `upcat_facts_fts`):
```ts
  `CREATE VIRTUAL TABLE IF NOT EXISTS career_facts_fts USING fts5(
    fact_id UNINDEXED, course_name, quick_answer, key_caveat, tokenize='unicode61 remove_diacritics 2')`,
  `CREATE TRIGGER IF NOT EXISTS career_facts_ai AFTER INSERT ON career_facts BEGIN
    INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat); END`,
  `CREATE TRIGGER IF NOT EXISTS career_facts_ad AFTER DELETE ON career_facts BEGIN
    DELETE FROM career_facts_fts WHERE fact_id = old.id; END`,
  `CREATE TRIGGER IF NOT EXISTS career_facts_au AFTER UPDATE ON career_facts BEGIN
    DELETE FROM career_facts_fts WHERE fact_id = old.id;
    INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat); END`,
```
(Match the column DDL idiom for the 6 base tables; text[] columns become TEXT NOT NULL DEFAULT '[]'.)
- [ ] **Step 3: sync.ts** — pull all 6 tables (full select for courses/countries/programs/ai_impact; `career_destinations`/`career_facts` can use `.gt('updated_at', since)`). Upsert loops mirror existing idiom: booleans `!!`, `text[]` columns `JSON.stringify(row.x ?? [])`, numerics `?? null`. FTS triggers auto-sync career_facts_fts.
- [ ] **Step 4:** Extend the real-SQLite sync test: seed a mock `career_facts` + `career_courses` row, assert they land (text[] round-trips as JSON string). Ensure supabase mock returns `{data:[]}` for each new `from()`.
- [ ] **Step 5:** tsc + sync test green. **Commit** `feat(mobile/career): 6 career mirror tables + career_facts_fts + sync`.

## Task 3a: Importers — structured tables (courses, destinations, countries, programs)

**Files:** Create `scripts/parse-career.mjs` (or split) + `supabase/seed/career_{courses,destinations,countries,programs}_seed.sql`

- [ ] **Step 1:** Self-contained parser(s) (reuse the quote-aware reader from `scripts/import-upcat-questions.mjs` + a shared normalize helper). Read COURSE_INDEX + SUMMARY → `career_courses` (course_id, name, cluster, career_tag, demand, board_exam, duration, top_countries[], summary/student_tip/ai_note from SUMMARY); DESTINATIONS → `career_destinations` (id = `${course_id}-${countrySlug}`, all columns; salary_min/max numeric where clean else null + keep salary_local string; specializations[] split on commas); COUNTRY_PROFILES → `career_countries` (code = country slug); PROGRAMS → `career_programs` (id = program-name slug; courses_covered[] split). Emit idempotent `ON CONFLICT (pk) DO UPDATE`. **No NULL into NOT NULL cols** — emit `''`/`ARRAY[]::text[]`. Escape quotes; `text[]` as `ARRAY[...]` / `'{}'`.
- [ ] **Step 2:** Run; print row counts (expect ~100 courses, ~478 destinations, ~25-30 countries, ~30-40 programs) + null-rates; spot-check ≥5 destinations rows (incl. a multi-country course) vs source.
- [ ] **Step 3:** Commit `feat(career): importers + seeds for courses/destinations/countries/programs`.

## Task 3b: Importers — ai_career_impact + career_facts (RAG)

**Files:** Create the ai_impact + career_facts parser(s) + `supabase/seed/ai_career_impact_seed.sql`, `supabase/seed/career_facts_seed.sql`

- [ ] **Step 1:** Parse `ai_career_impact_context...csv` (60 rows) → `ai_career_impact` (course_id matched to COURSE_INDEX by normalized course_name; if no match, slug the name; report unmatched). Split `;`-lists → text[]. Parse QUICK_REF → `career_facts` rows (`id` = slug of query_type+course; query_type, course_name, quick_answer, key_caveat, point_to); ALSO add SUMMARY "Notes for AI"/"Student Tip" as career_facts rows, and each ai-impact `kuya_baw_summary` as a career_fact (query_type='AI Impact'). Idempotent `ON CONFLICT (course_id|id) DO UPDATE`.
- [ ] **Step 2:** Run; report counts (60 ai_impact; ~150–250 career_facts) + unmatched course_codes; spot-check 5 (incl. one AI-impact fact + one quick-ref).
- [ ] **Step 3:** Commit `feat(career): importers + seeds for ai_career_impact + career_facts RAG`.

## Task 4: searchCareerFacts + AI-impact lookup (TDD)

**Files:** Modify `apps/mobile/services/flashcardRetriever.ts` + test

- [ ] **Step 1: Test** — seed an in-memory `career_facts` (+fts) + `ai_career_impact` row; `searchCareerFacts(db, 'nursing abroad')` returns the matching fact; `getAiImpactByCourseName(db, 'Computer Science')` returns the AI-impact row. Mirror the existing `searchUpcatFacts` test harness.
- [ ] **Step 2: Implement** `searchCareerFacts(db, query, limit=3)` — FTS MATCH on `career_facts_fts` JOIN `career_facts` (reuse `buildFtsQuery`; return `{ courseName, queryType, quickAnswer, keyCaveat, pointTo }[]`; try/catch→[]). `getAiImpactByCourseName(db, name)` — LIKE/normalized match on `ai_career_impact.course_name` (returns one row or null).
- [ ] **Step 3:** Jest green. **Commit** `feat(mobile/career): searchCareerFacts FTS + AI-impact lookup`.

## Task 5: Chat blocks + persona (TDD)

**Files:** Modify `apps/mobile/services/chatContext.ts`, `apps/mobile/services/chatPrompts.ts` + tests

- [ ] **Step 1: Test** (extend chatContext test) — with seeded career_facts + ai_career_impact, the built context contains a sibling `[CAREER FACTS]` block (with the answer + "verify with DMW/POEA") and, when a course is named, an `[AI CAREER IMPACT]` block (AI-Safe-Score + kuya summary). chatPrompts test: persona mentions career advice + "verify with DMW/POEA".
- [ ] **Step 2: Implement** — in `buildRetrievedFlashcards`, run `searchCareerFacts` (+ AI-impact lookup for a referenced course) in the existing Promise.all; append `[CAREER FACTS]` and `[AI CAREER IMPACT]` as SIBLING top-level sections (never nested — Epic G pattern). Format: `[CAREER FACTS]\n- {courseName}: {quickAnswer} ({keyCaveat}; verify with DMW/POEA & official sources)`; `[AI CAREER IMPACT]\n- {courseName} — AI-Safe-Score {score}/5 ({label}): {kuyaSummary}`. In `chatPrompts.ts`, extend the Kuya persona (honest career guidance; never guarantee jobs/salary/PR; verify with DMW/POEA/embassies). Keep existing rules + the English-output rule.
- [ ] **Step 3:** Jest green (chatContext + chatPrompts + flashcardRetriever). **Commit** `feat(mobile/kuya): [CAREER FACTS] + [AI CAREER IMPACT] chat blocks + career-advisor persona`.

## Task 6: AiImpactCard + course-career screen

**Files:** Create `apps/mobile/components/career/AiImpactCard.tsx`, `apps/mobile/app/career/[courseId].tsx`

- [ ] **Step 1: AiImpactCard** — props from `ai_career_impact` row; renders AI-Safe-Score (n/5 + label, tinted by color_code), "AI takes over" vs "stays human" lists, skills-to-develop chips, 2030 outlook, kuya_baw_summary, key_source. Theme tokens; avoid bare-zero (`score > 0 ? … : null`).
- [ ] **Step 2: career/[courseId].tsx** — load `careerCourses` by id + its `careerDestinations` (parse specializations JSON; sort by demand) + `aiCareerImpact` (by course_id) + `careerPrograms` (where courses_covered contains the course). Render: header, `<AiImpactCard>`, destinations list (per country: salary range or local, visa/PR, timeline, credential, saturation warning, source; each row → `career/country/[code]`), programs section, and a permanent "Salaries/timelines are indicative — verify with DMW/POEA & official sources" note.
- [ ] **Step 3:** tsc + react-doctor + a render test (mock local data). **Commit** `feat(mobile/career): AiImpactCard + course-career detail screen`.

## Task 7: Country screen + browse + entry

**Files:** Create `apps/mobile/app/career/country/[code].tsx`, `apps/mobile/app/career/index.tsx`; Modify `apps/mobile/app/(tabs)/practice.tsx`

- [ ] **Step 1: country/[code].tsx** — load `careerCountries` by code + reverse-lookup `careerDestinations` where country matches → list courses in demand there (link back to `career/[courseId]`). Country profile fields + notes.
- [ ] **Step 2: career/index.tsx** — "Career Paths" browse: `careerCourses` grouped by cluster, searchable; each → `career/[courseId]`.
- [ ] **Step 3:** Practice tab: add a "🌍 Career Paths" card routing to `/career` (near UPCAT/Estimator cards).
- [ ] **Step 4:** tsc + react-doctor + tests. **Commit** `feat(mobile/career): country screen + Career Paths browse + Practice entry`.

## Task 8: Verify + apply

- [ ] **Step 1:** `cd apps/mobile && pnpm test | tail -6`; `cd apps/admin && pnpm test | tail -4`; `npx react-doctor --project @iskotify/mobile --diff <epic-base> --no-warnings --no-telemetry`.
- [ ] **Step 2 (controller, MCP):** apply migration 021; apply the 6 seeds via execute_sql (a subagent reading the seed files, like the Epic B apply — courses before destinations for the FK); verify: `SELECT count(*) FROM career_courses/career_destinations/ai_career_impact/career_facts`; `get_advisors security`.
- [ ] **Step 3:** Manual smoke (after OTA): Practice → Career Paths → a course → AI-Safe-Score + destinations + a country; Kuya chat "where can nursing take me?" → `[CAREER FACTS]`/`[AI CAREER IMPACT]` surface.

---

## Self-review against the spec
- D1 schema → Tasks 1–2 ✓ (6 tables + FTS + sync)
- D2 ingestion → Tasks 3a/3b ✓ (6 seeds, course_id key, multi-value→text[], no-NULL-into-NOT-NULL)
- D3 RAG → Tasks 4–5 ✓ (searchCareerFacts + [CAREER FACTS]/[AI CAREER IMPACT] sibling blocks + persona)
- D4 screens → Tasks 6–7 ✓ (AiImpactCard, course detail, country, browse, entry)
- D5 sync → Task 2 ✓
- Delivery via MCP + OTA → Task 8 ✓
- Type/name consistency: `career_courses/career_destinations/career_countries/career_programs/ai_career_impact/career_facts`, `searchCareerFacts`, `getAiImpactByCourseName`, `AiImpactCard` ✓
