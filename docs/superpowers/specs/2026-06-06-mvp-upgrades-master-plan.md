# Iskotify MVP Upgrades — Master Plan

**Date:** 2026-06-06
**Source:** `C:\Users\User\Downloads\Iskotify Upgrades` — 17 files (8 docx, 4 xlsx → ~97 CSV sheets, 5 raw CSV), extracted to `_extracted/`.
**Method:** 17-agent comprehension workflow (~1M tokens) reading every dataset + surveying the existing app, synthesized into this plan.
**Execution directive (user):** Implement **sequentially, epic by epic** — each epic built out in full (every section's details), not a shallow one-pass.

---

## 1. Executive summary

This drop transforms Iskotify from a flashcard-and-listings study aid into a **full UPCAT/college-decision platform**, across four themes:

1. **Real exam-grade practice** — a 320-question authored UPCAT bank (human-written distractors + passage sets) that bypasses the Gemini distractor pipeline, backed by a 4-subtest → ~30-topic → 120+-subtopic taxonomy and a UPCAT-facts knowledge base for Kuya Baw.
2. **A decision layer the app lacks** — scholarships from ~8 → ~140+ (national + LGU); a net-new university/course-finder (403 profiles + 447 directory + Wilson board rankings + non-board accreditation); career-destinations + AI-career-impact knowledge.
3. **A motivation loop** — UPG Estimator turning practice into a live admission-score estimate vs per-campus cutoffs.
4. **A post-beta product correction** — 74-row beta worklist that rewires navigation (Analytics→Updates tab, Analytics into Profile), adds a Requirements vault, and reworks the practice/exam flow.

Architectural fit is strong but uneven: some datasets extend `listings` cheaply; others need net-new tables, tabs, and admin importers. Cross-cutting cost is **data cleaning** (BOM/Windows-1252 mojibake, `[UNCONFIRMED]`/`VERIFY`/`Unknown` sentinels → NULL, region-name inconsistency, quote-aware parsing). Two datasets are **internal-only** (PRC-validation, beta-feedback); several are **time-sensitive feeds** needing a refresh workflow.

---

## 2. Feature epics

### EPIC A — UPCAT Practice Mode + Authored Question Bank  · effort L
- **Datasets:** upcat-questions (320 MCQs + 23 passage sets), upcat-research (taxonomy + UPG/equity docs), kuya-context (facts + persona).
- **Feature:** timed mock-exam mode by 4 official subtests (Lang 100 / Reading 100 / Math 60 / Sci 60), passage-set rendering (1 passage → 5 linked Qs), filter by cognitive level / difficulty / format, exam-grade rationales, per-subtest score breakdown. Distinct from existing synthesized-MCQ topic quizzes.
- **New Supabase:** `upcat_questions`, `upcat_passages`, `upcat_facts`.
- **Admin:** quote-aware CSV importer (BOM strip, A/B/C/D→0–3, pack option_a..d into options[], dedupe passages by set_id, Approved→published). **No Gemini.**
- **Mobile:** new exam-mode screen (fork of practice/[topicId].tsx) with passage panel + subtest grouping; mirror to SQLite via sync.ts + client.ts MIGRATIONS; add upcat_facts to FTS5 + `[UPCAT FACTS]` chat block; persona into chatPrompts.ts.
- **Dependencies:** feeds EPIC E (subtest-tagged scores) + EPIC G exam-flow rework.

### EPIC B — Scholarship Directory Expansion · effort M
- **Datasets:** scholarships-national (~45), scholarships-lgu (99), DLSU aid window from admissions-update.
- **Feature:** ~8 → ~140+ programs with rich detail (eligibility, income ceiling, GWA, benefits, requirements checklist, service-obligation warning), eligibility matcher, provider/course/region facets, "near you" (province/city), HUC-exclusion warnings, verified badges.
- **New Supabase:** extend `listings` (+ province, city, scope enum, is_verified, scholarship_meta jsonb); add province/city to profiles.
- **Admin:** two parsers → idempotent seed migrations `ON CONFLICT(slug) DO UPDATE`; normalize currency, Unknown/TBA→NULL, recurring vs absolute deadlines, drop suspended/grad-only.
- **Mobile:** reuse listings/[slug] detail + province/city chips + "near you" derivation; mirror new columns.
- **Dependencies:** province/city from schools table; light coupling to EPIC C region canonicalization.

### EPIC C — School & Course Finder · effort XL
- **Datasets:** university-profiles (403), universities-province (447), top-schools-by-course (Wilson board rankings), non-board-schools (329 accreditation), prc-validation (internal QA gate).
- **Feature:** new Schools tab — directory by region/province/type/course, search-by-course, per-university profile (accreditation/COE-COD badges, tuition, free-tuition filter, links), "Top schools for [Course]", entrance-exam calendar cross-linked to exam listings.
- **New Supabase:** `university_profiles` (+ FK→listings), `course_exams`, `tertiary_schools`, `course_school_rankings`, `course_school_quality`, optional `bar_results`.
- **Admin:** heavy ETL — re-decode, region canonicalization (CALABARZON↔IV-A↔4A), sentinel→NULL, fuzzy name+city dedupe (~173 overlaps), header auto-detect, enum normalize, min-examinee thresholds; PRC-validation as QA checklist.
- **Dependencies:** heaviest epic; feeds admissions testing-center data (F) + AI-Safe-Score in Listings (G).

### EPIC D — AI Career Advisor (Kuya Baw upgrade) · effort L
- **Datasets:** career-destinations (478 course×country + programs + quick-ref), ai-career-impact (60-course AI exposure), shared kuya-context.
- **Feature:** "Where can this course take you?" (destination countries + salary/PR/visa/timeline + bilateral pathways), per-course "AI Impact" card, Kuya Baw career-advisor mode grounded in these datasets.
- **New Supabase:** career_courses, career_destinations, career_countries, career_programs, career_quick_ref (RAG corpus), ai_career_impact.
- **Admin:** quote-aware importers + mojibake normalization + multi-value split.
- **Mobile:** career/[courseId].tsx + career/country/[code].tsx + AI-impact card; extend chatContext with `[AI CAREER IMPACT]` + `[CAREER FACTS]` blocks.
- **Dependencies:** shares Kuya persona/FTS plumbing with A; course_id reconciliation with C (open question 6).

### EPIC E — UPG Estimator · effort L (XL with V2)
- **Datasets:** upg-calculator-brief + UPG constants from upcat-research + kuya-context.
- **Feature:** Estimated Admission Score 1.0–5.0 range bar (HS 40% / Mock 60%), recomputed after each session (rolling 3-session subtest avg), mapped to per-campus cutoffs (Likely/Possible/Unlikely), EEAS palugit/pabigat breakdown, milestone pushes, **mandatory permanent disclaimer** (no UP branding).
- **New Supabase:** grade_inputs, subtest_estimates, score_estimates (owner-only), upcat_cutoffs (public-read), app_population_stats (V2); + profile cols (schoolType, province, isIP, targetCampus); + subtest tag on flashcard_subjects/topics.
- **Backend (security-critical):** regression coefficients NEVER client-side — Edge Function / SECURITY DEFINER RPC.
- **Dependencies:** **hard dependency on EPIC A** (subtest-tagged mock scores).

### EPIC F — Admissions News & Updates Feed · effort L
- **Datasets:** admissions-update (weekly digest) → listings field-refresh + recurring feed.
- **Feature:** Admissions News feed by urgency, UPCAT 2027 countdown on Home, status/date auto-refresh on exam cards, campus-targeted pushes, results tracker. (Content for the beta-requested Updates tab.)
- **New Supabase:** `admissions_updates` (report_date, severity, school_slug, title, body, action_required, sources jsonb, verified); listings field-updates by slug.
- **Admin:** Gemini extraction (prose+emoji → structured) with human review before publish; countdowns computed at runtime.
- **Dependencies:** Updates tab shell from EPIC G; testing-center data from EPIC C.

### EPIC G — Beta-Feedback Fixes & IA Rework · effort L–XL
- **Dataset:** beta-feedback (internal worklist).
- **Feature:** nav IA overhaul (Analytics tab→Updates; Analytics→Profile), Requirements Checklist + document vault, onboarding reorder (pre-assessment last), Practice redesign, Listings restructure (remove "all"; Universities/Scholarships/Courses; AI-Safe-Score + PRC ranking), exam-flow rework (Quick vs Full; no auto-advance; skip/back/change; Retake; share). See §4.
- **New Supabase:** mostly code-only; `requirements` table + Storage bucket + RLS (vault); Updates feed (F).
- **Dependencies:** dictates *where* every new dataset surfaces; overlaps all epics.

---

## 3. Data → schema mapping

| Dataset | Target | Ingestion |
|---|---|---|
| upcat-questions | NEW upcat_questions + upcat_passages (+ SQLite mirror) | admin quote-aware CSV; no Gemini |
| upcat-research doc1 | extend flashcards/topics (format_code, frequency, branch, language, subtopic) | admin seed migration (manual transcription) |
| upcat-research doc2 | versioned config constants + static screens | code/config + MDX |
| kuya-context persona | chatPrompts.ts constants | code edit |
| kuya-context facts | NEW upcat_facts SQLite + FTS5 → `[UPCAT FACTS]` | admin import → FTS5 |
| scholarships-national | EXISTING listings (+ scholarship_meta, province/city, verification) | admin parser → seed `ON CONFLICT` |
| scholarships-lgu | EXISTING listings (+ province/city) | admin TXT parser → seed |
| university-profiles | NEW university_profiles (+FK→listings) | admin CSV, heavy normalize+dedupe |
| universities-province | merge into university_profiles | admin CSV, region-canon + fuzzy merge |
| top-schools-by-course | NEW course_exams + tertiary_schools + course_school_rankings (+bar_results) | admin ETL |
| non-board-schools | NEW course_school_quality (+ course_groups) | admin import (Master sheet) |
| prc-validation | INTERNAL-ONLY QA gate (+ optional course_validation) | internal gate; not user-ingested |
| career-destinations | NEW career_* tables; quick_ref → RAG | admin CSV + RAG |
| ai-career-impact | NEW ai_career_impact (text[]) | seed + admin re-import → `[AI CAREER IMPACT]` |
| upg-calculator-brief | NEW grade_inputs/subtest_estimates/score_estimates/upcat_cutoffs (+profile cols, subtest tag) | backend RPC + seeded cutoffs; coeffs server-only |
| admissions-update | EXISTING listings refresh + NEW admissions_updates | admin LLM extract → review → publish |
| beta-feedback | INTERNAL-ONLY backlog | manual triage |

---

## 4. Beta-feedback backlog (prioritized)

**Blockers (nav/IA — shared shells, first):**
- [ ] Analytics bottom tab → **Updates tab**; full Analytics dashboard → Profile.
- [ ] Onboarding reorder: **Pre-Assessment to END** (don't block account creation); keep calibrated level + subsection scores on completion.

**Major (exam-flow correctness):**
- [ ] No auto-advance (confirm to proceed); allow skip + return to skipped; allow changing answers; in-quiz duplicate check; in-quiz Feedback button.
- [ ] Remove manual item-count & timer pickers — only **Quick Quiz vs Full Quiz** (counts/timer from real exam stats).
- [ ] Results: "Play again" → **"Retake exam"**; add **"Share score."**

**Major (new surfaces — overlap data epics):**
- [ ] Requirements Checklist + document vault (Requirement/For-what/Deadline + upload → "Iskotify documents"; Home "kulang na requirements").
- [ ] Updates tab content: Upcoming Events + News + Iskotify updates feed (= EPIC F).
- [ ] Listings restructure: remove "all"; segment **Universities / Scholarships / Courses**; AI-resilience/demand/destination + **AI-Safe-Score**; rank by PRC passing rates (= EPIC C + D).
- [ ] Practice redesign: Enable-AI toggle + "AI General Feedback"; Overall score + Streak + Exams Taken header; "My Focus" as univ/scholarship logos with %-scores deep-linking to subtests; weak-areas→subtopics+sample exams; pick own subjects; **remove "Quick start" + "Full review deck."**

**Minor (copy/UX):**
- [ ] Home: prominent Kuya Baw entry; weak areas from onboarding; exam-prep score cards; suggested univ/scholarship/courses; upcoming deadlines.
- [ ] Onboarding order: National Univs → Regional Univs → Scholarships.
- [ ] Profile analytics dashboard: streak, active days, hours, per-subject graph, mastery/weakness, recent sessions.
- [ ] Typo fixes ("Assesment"→"Assessment").

---

## 5. Recommended sequencing

**Phase 0 — Foundations (first):** reusable admin import harness (BOM/Windows-1252 re-decode, quote-aware, region canon, sentinel→NULL); beta-feedback nav blockers (Updates tab shell + Analytics→Profile; onboarding reorder); shared schema (province/city on profiles, subtest tag on flashcard_topics).

**Phase 1 — Smallest credible MVP (parallelizable after Phase 0):**
1. EPIC A question bank (highest ROI, clean, no Gemini).
2. EPIC B national + LGU scholarships (reuse detail UI).
3. EPIC G exam-flow rework (improves the loop A just shipped).

**Phase 2 — Differentiators:**
4. EPIC E UPG Estimator MVP (depends on A subtest tagging).
5. EPIC A facts + persona + EPIC D Kuya career mode (shared RAG).

**Phase 3 — Heavy net-new:**
6. EPIC C School & Course Finder (read-only directory first).
7. EPIC D AI-impact cards + EPIC F Admissions News.

**Deferrable post-MVP:** UPG V2, exam calendar + cross-linking, map/geocoding, AI-enrichment of UNCONFIRMED fields, PRC trust badges, Requirements document vault (checklist-first).

**Internal-only, continuous:** PRC-validation as data-quality gate; beta-feedback as backlog.

---

## 6. Open questions (resolved inline as epics are reached)

1. Scope cut — which epics in v1? (recommended: Phases 0–1.)
2. UNCONFIRMED tolerance (EPIC C): FULL_PROFILE only / all-with-badges / gate behind verification. Same for ~53/99 unverified LGU.
3. Internal-only confirmation: PRC-validation stays internal; verified badge gated on STRONG MATCH; beta-feedback backlog-only.
4. UPG Estimator legal posture: UP OAA warns against third-party UPG calculators — comfort level, disclaimers, who owns annual cutoffs.
5. Recurring vs one-time content cadence (admissions weekly, salaries, deadlines, cutoffs annual).
6. Taxonomy reconciliation (C↔D): one canonical course taxonomy up front vs per-dataset loose join.
7. Scholarship schema: single scholarship_meta jsonb vs ~12 typed columns (matcher easier with typed).
8. Requirements vault scope: metadata checklist first vs real Storage upload.
9. App version bump: any native modules (document picker, etc.) forcing non-OTA release.
