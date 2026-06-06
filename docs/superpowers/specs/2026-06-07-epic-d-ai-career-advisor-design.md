# Epic D — AI Career Advisor (Kuya Baw Career Mode) — Design Spec

**Date:** 2026-06-07
**Status:** Draft for review
**Master plan:** [2026-06-06-mvp-upgrades-master-plan.md](2026-06-06-mvp-upgrades-master-plan.md) (Epic D §2)
**Sources (`…/Iskotify Upgrades/`):** `_extracted/Iskotify_Career_Destinations__{DESTINATIONS,COURSE_INDEX,COUNTRY_PROFILES,PROGRAMS,QUICK_REF,SUMMARY}.csv` + `ai_career_impact_context - ai_career_impact_context.csv.csv`.
**Scope:** FULL per the brief — data + Kuya career RAG + course/country screens + AI-Safe-Score, built now.
**Shares:** the Epic A Kuya FTS-RAG plumbing (`upcat_facts`/`upcat_facts_fts`/`searchUpcatFacts`/`[UPCAT FACTS]` block) — Epic D clones it as `career_facts`/`[CAREER FACTS]` + an `[AI CAREER IMPACT]` block.

---

## 1. Goal

Let students answer "Where can this course take me — and is it AI-proof?" via (a) a Kuya Baw **career-advisor chat mode** grounded in the career datasets (destination countries, salary/visa/PR/timeline, bilateral programs, per-course AI-Safe-Score), and (b) structured **course-career** + **country** screens with an AI-Impact card.

## 2. Architecture (5 areas)

- **D1 Schema** (migration 021): public-read tables `career_courses`, `career_destinations`, `career_countries`, `career_programs`, `ai_career_impact`, `career_facts`; mobile mirrors all + a `career_facts_fts` FTS5 (mirrors `upcat_facts_fts`).
- **D2 Ingestion**: self-contained Node parsers (reuse the quote-aware CSV reader from `scripts/import-upcat-questions.mjs` + cleaners) → committed idempotent seed SQL. Key on `course_id` (from COURSE_INDEX); map the AI-impact file's `course_code`/`course_name` → `course_id` via name match. Multi-value cells (`;` or `,` inside quotes) → Postgres `text[]`.
- **D3 Kuya career RAG**: `searchCareerFacts` (FTS, clone of `searchUpcatFacts`) + a `[CAREER FACTS]` block + an `[AI CAREER IMPACT]` block in `chatContext.ts`; persona note in `chatPrompts.ts` so Kuya offers honest career guidance with "verify with DMW/POEA + official sources" caveats.
- **D4 Mobile screens**: `career/index.tsx` (Career Paths browse — course list by cluster), `career/[courseId].tsx` (destinations + salary/visa/timeline + programs + AI-Safe-Score card), `career/country/[code].tsx` (country profile + in-demand courses); an `AiImpactCard` component; entry from Practice/Home + deep-links from chat.
- **D5 Sync**: pull all `career_*` + `ai_career_impact` + `career_facts` on launch.

## 3. Data model (D1, migration 021) — all public-read RLS, `updated_at` trigger

- `career_courses(course_id text pk, name, cluster, career_tag, demand, board_exam boolean, board_exam_name, duration_years numeric, top_countries text[], summary text, student_tip text, ai_note text)`
- `career_destinations(id text pk, course_id text references career_courses, country, demand_rating, salary_min numeric, salary_max numeric, salary_local, salary_type, visa_pathway, pr_pathway, credential, licensing_exam, language_required, timeline_months int, program_name, specializations text[], notes, saturation_warning, source)`
- `career_countries(code text pk, name, region, immigration_system, why_demand, language_required, pr_pathway, notes)` (code = slug of country name)
- `career_programs(id text pk, name, country_region, courses_covered text[], managing_body, slots, requirements, immigration_outcome, website, notes)`
- `ai_career_impact(course_id text pk, course_name, cluster, board_exam boolean, board_exam_name, automation_risk_low int, automation_risk_high int, ai_safety_score int, ai_safety_label, color_code, what_ai_takes_over text[], what_stays_human text[], new_jobs_emerging text[], skills_to_develop text[], career_outlook_2030, key_stat, key_source, key_quote, quote_by, ph_advantage, ph_notes, kuya_baw_summary, last_updated)`
- `career_facts(id text pk, course_id, query_type, course_name, quick_answer, key_caveat, point_to, updated_at)` — RAG corpus (QUICK_REF rows + SUMMARY "Notes for AI"/"Student Tip" + each AI-impact `kuya_baw_summary` as a fact). FTS indexes `course_name + quick_answer + key_caveat`.

**Mobile (SQLite):** mirror all six (booleans as int, `text[]` as JSON-string TEXT) + `career_facts_fts` FTS5 (`fact_id UNINDEXED, course_name, quick_answer, key_caveat`, tokenizer `unicode61 remove_diacritics 2`) + 3 triggers (clone `upcat_facts_fts`).

**Course key:** `course_id` (COURSE_INDEX scheme, e.g. `ARCH-001`). The AI-impact CSV's `course_code` (e.g. "BS CS") is matched to `course_id` by normalized course-name during import; rows that can't be matched keep a `course_id` derived from a name-slug (documented in the importer report). Epic C may later add a canonical taxonomy + FK (open question #6 — loose name join for now).

## 4. Ingestion (D2)

Parsers under `scripts/` (model on `import-upcat-questions.mjs`), emitting idempotent `INSERT … ON CONFLICT (pk) DO UPDATE` seeds in `supabase/seed/`:
- `career_courses_seed.sql` (from COURSE_INDEX + SUMMARY merge), `career_destinations_seed.sql` (DESTINATIONS, ~478), `career_countries_seed.sql` (COUNTRY_PROFILES), `career_programs_seed.sql` (PROGRAMS), `ai_career_impact_seed.sql` (the 60-course file), `career_facts_seed.sql` (QUICK_REF + SUMMARY notes + ai-impact summaries).
- Quote-aware parse; trim/`resolveSentinel`; `decodeMojibake` (data is mostly clean UTF-8); salary "$32,000"/"AED 120k" → numeric where clean (else null + keep local string); multi-value `;`/`,` → `text[]` (`ARRAY[...]` / `'{}'`); deterministic `id`/`code` slugs; escape quotes. Each parser prints a row-count + null-rate report; spot-check ≥5 rows before commit. **No NULL into NOT NULL columns** (lesson from Epic B — emit `''`/`ARRAY[]::text[]` defaults).

## 5. Kuya career RAG (D3)

- `apps/mobile/services/flashcardRetriever.ts`: add `searchCareerFacts(db, query, limit=3)` — FTS query of `career_facts_fts` JOIN `career_facts`, identical mechanism to `searchUpcatFacts` (reuse `buildFtsQuery`). Returns `{ courseName, queryType, quickAnswer, keyCaveat, pointTo }[]`. Optionally `getAiImpactByCourseName(db, query)` to exact/like-match a course for the AI-impact block.
- `apps/mobile/services/chatContext.ts`: in `buildRetrievedFlashcards`, run `searchCareerFacts` (and AI-impact lookup) alongside the existing searches; append sibling top-level sections:
  - `[CAREER FACTS]` — `- {courseName}: {quickAnswer} ({keyCaveat}; verify with DMW/POEA & official sources)`
  - `[AI CAREER IMPACT]` — `- {courseName} — AI-Safe-Score {ai_safety_score}/5 ({ai_safety_label}): {kuya_baw_summary}` (only when a course is clearly referenced).
  Keep them as sibling sections (the Epic G fix pattern — never nested under `[RELEVANT FLASHCARDS]`).
- `apps/mobile/services/chatPrompts.ts`: extend the Kuya persona so it can act as a career advisor (honest about saturation/visa risk; never guarantee jobs/salaries/PR; "verify with DMW/POEA, embassies, and official program sites"). Keep existing rules.

## 6. Mobile screens (D4)

- `apps/mobile/components/career/AiImpactCard.tsx`: shows AI-Safe-Score (n/5 + label + color), "what AI takes over" vs "what stays human" lists, skills-to-develop, 2030 outlook, and the kuya_baw_summary. Neutral styling; cite key_source.
- `apps/mobile/app/career/[courseId].tsx`: loads `career_courses` + its `career_destinations` (grouped/sorted by demand) + `ai_career_impact` + matching `career_programs`. Renders: header (course, cluster, demand), `AiImpactCard`, a destinations list (per country: salary range, visa/PR, timeline, credential, saturation warning, source) with each country linking to `career/country/[code]`, and relevant bilateral programs. Honest disclaimers (salaries/timelines are indicative; verify officially).
- `apps/mobile/app/career/country/[code].tsx`: country profile (immigration system, why-demand, language, PR pathway, notes) + the courses in demand there (reverse lookup from `career_destinations`).
- `apps/mobile/app/career/index.tsx`: "Career Paths" browse — course list grouped by cluster, searchable, each → `career/[courseId]`.
- **Entry:** a "Career Paths" card on the Practice tab (near UPCAT/Estimator) + optionally Home; Kuya chat answers can mention courses (deep-link best-effort). (Epic C will fold this into the Courses listing.)

## 7. Sync (D5)
`sync.ts` pulls `career_courses, career_destinations, career_countries, career_programs, ai_career_impact, career_facts` (full pulls for the small reference tables; `career_facts`/`career_destinations` may use `updated_at` cursors). FTS triggers keep `career_facts_fts` synced. Mirror booleans via `!!`, `text[]` via `JSON.stringify`.

## 8. Testing
- **D2:** importer normalization unit tests (salary parse, multi-value split, slug, course_code→course_id match) + row-count/null-rate report + spot-checks.
- **D3:** `searchCareerFacts` FTS test (seed a career_facts row, query → match); `[CAREER FACTS]`/`[AI CAREER IMPACT]` blocks appear as siblings; chatPrompts persona contains the career-advisor + verify-with-DMW language.
- **D4:** screen render tests (course detail with AI card + destinations; country screen; browse list) against mocked local data.
- **D5:** sync writes career tables into SQLite (extend the real-SQLite sync test).
- **react-doctor** `--project @iskotify/mobile` on changed files; full mobile + admin suites green.

## 9. Delivery
Migration 021 + the 6 seeds applied via Supabase MCP at verify (project `dtugrsbarruizgzowgso`; next migration = 021). Mobile JS ships in the final-batch OTA.

## 10. Sequencing (plan → bite-sized TDD)
1. Migration 021 (6 tables, RLS, triggers).
2. Mobile schema: 6 mirror tables + `career_facts_fts` + triggers; sync pull.
3. Importers → seeds (courses, destinations, countries, programs, ai_impact, career_facts) + normalization tests.
4. `searchCareerFacts` + AI-impact lookup (TDD).
5. chatContext `[CAREER FACTS]` + `[AI CAREER IMPACT]` blocks + chatPrompts persona (TDD).
6. `AiImpactCard` + `career/[courseId]`.
7. `career/country/[code]` + `career/index` browse + Practice entry.
8. Verify (suites, react-doctor) + apply 021 + seeds via MCP + data-count verification.

## 11. Open questions (proposed defaults)
- Course key = `course_id` free-text from COURSE_INDEX; AI-impact matched by name; Epic C reconciles later (loose join now). (Proposed.)
- `career_facts` RAG corpus = QUICK_REF + SUMMARY notes + each ai-impact `kuya_baw_summary`. (Proposed.)
- Salaries shown as indicative ranges with a permanent "verify with DMW/POEA & official sources" caveat (career analog of the estimator disclaimer; lighter — inline note, no modal). (Proposed.)
