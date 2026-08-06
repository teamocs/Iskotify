# Homepage Optimization + Bug Fixes — Implementation Plan (2026-07-24)

Source: user "Iskotify Homepage Optimization Notes" (2026-07-24). Branch: `feature/homepage-optimization`.

## Global Constraints

- Additive migrations only; never destructive. Any migration that UPDATEs or ALTERs rows in tables mirrored to mobile MUST also `set updated_at = now()` on affected rows, or the mobile `updated_at`-cursor sync (apps/mobile/services/sync.ts) will never pull the change.
- Every new/changed Supabase column that mobile consumes needs all three: migration SQL, `apps/mobile/db/schema.ts` mirror, and a `sync.ts` mapping in the matching transaction block.
- Do NOT apply migrations to the remote database — create the SQL files only.
- Reuse existing UI primitives (`SectionHeader`, `Card`, `GridCard`, `ListCard`, `InfoBanner`, `Badge`, `PillButton`) and theme tokens from `apps/mobile/theme/tokens.ts` via `useTheme()`. No hardcoded colors.
- School/university logos do not exist as assets; use acronym monogram tiles (colored circle + acronym text) wherever the notes say "logo".
- Mobile tests: jest via `pnpm --filter @iskotify/mobile test` (verify runner name in package.json before assuming). Admin tests: vitest. Run the focused suite for what you change; full app suite once before committing.
- Preparedness/readiness %: per-exam = `getListingMockBest` (apps/mobile/services/homeAggregates.ts:330) falling back to `listingAccuracy`; per-subject = `subjectReadinessPct` (apps/mobile/utils/subjectReadiness.ts:40), tone via `readinessTone` (utils/readinessTone.ts). Do not invent new scoring formulas.
- Kuya Baw chat is being retired by default (Task 1): `chat_enabled boolean not null default false` on `ai_chat_config`; client treats missing/unsynced config as DISABLED.

## Task 1: Kuya Baw kill-switch (retire until self-hosted AI)

**Goal:** Chat is hidden app-wide unless an admin re-enables it remotely.

1. Migration `supabase/migrations/041_chat_enabled.sql`:
   - `alter table ai_chat_config add column if not exists chat_enabled boolean not null default false;`
   - `update ai_chat_config set updated_at = now() where id = 1;`
2. Mobile mirror: add `chatEnabled` to `aiChatConfig` table in `apps/mobile/db/schema.ts` (integer 0/1, follow existing column style at schema.ts:499-513); map it in the ai_chat_config pull in `apps/mobile/services/sync.ts` (around lines 717-731).
3. `apps/mobile/services/aiConfig.ts`: add `chatEnabled: boolean` to `AiChatConfig`; parse from the row; **default `false`** when row/column missing.
4. New hook `apps/mobile/hooks/useKuyaEnabled.ts`: returns `{ enabled, loading }` from `getAiConfig()` (cached); default false.
5. Hide all 4 entry points when disabled:
   - Home hero speech bubble + Kuya hero band: `apps/mobile/app/(tabs)/index.tsx:604-629` (hide the whole hero band; Task 3 will replace this area anyway — keep the removal simple, gate rendering).
   - Tab bar center FAB: `apps/mobile/components/TabBar.tsx:95` (render tab bar without the raised FAB when disabled).
   - Web sidebar item: `apps/mobile/components/web/SidebarNav.tsx:157`.
   - Practice tab "AI Chat" card: `apps/mobile/app/(tabs)/practice.tsx:1046`.
6. Defense in depth: `KuyaChatProvider.open()` (apps/mobile/providers/KuyaChatProvider.tsx:64) short-circuits with a toast/alert "Kuya Baw is taking a break — check back soon." when disabled.
7. Admin: add "Chat enabled" toggle to `apps/admin/components/admin/AiConfigEditor.tsx` + accept `chat_enabled` in `apps/admin/app/api/admin/ai-config/route.ts` + default in `lib/aiConfigDefaults.ts`.
8. Tests: aiConfig parsing (missing column → false; 1 → true); useKuyaChat/provider gate; extend existing `__tests__/aiConfig.test.ts`.

## Task 2: Diagnostic exam mode (10 questions per subject)

**Goal:** A short standalone diagnostic that seeds preparedness scores, reachable from home tiles and subject cards.

1. New route `apps/mobile/app/practice/diagnostic/index.tsx`, accepts optional `?subject=<subtest name>` param.
   - Builds questions with `buildPreAssessFromUpcat(rows, subtests, 10)` (apps/mobile/utils/preAssessmentSource.ts:39) — 10 per subtest; all 4 UPCAT subtests when no param, single subtest when param given. Fallback to bundled `preAssessment.ts` items if the question bank is empty (same as onboarding does).
   - Timed at 60s/question (same model as `app/practice/upcat/[subtest].tsx:47`), auto-submit at zero. Reuse that engine's question UI patterns (option list, progress header) — do not rebuild from scratch if extraction is cheap; copying the established layout inline is acceptable.
2. On finish: record one `practice_sessions` row per subject via `useRecordSession` with `topicId: ''` and `subtest: <subject name>` (mirrors mock engines, exam/[slug].tsx:241-251) so results feed `getSubjectSessionPercentages` → subject readiness.
3. Results view: per-subject % with `readinessTone` colors, overall %, CTAs "Back to Home" and "Practice weakest subject" (→ `/practice/review/<slug>` or subjects screen).
4. Tests: pure question-building/scoring helpers (extract to `utils/` if logic is non-trivial); session-recording shape.

## Task 3: Homepage redesign

**Goal:** Home = focus exams top fold → subject preparedness → explore → recommended scholarships → merged news/dates. All in `apps/mobile/app/(tabs)/index.tsx` (extract new section components into `apps/mobile/components/home/`).

1. **Top fold — "My Entrance Exams"** (replaces the Kuya hero band):
   - 6 tile slots, 2 rows × 3 (`GridCard`-style tiles). Filled from `focusedListings` where `type === 'exam'`, priority order.
   - When fewer than 3 tiles are filled, suggest defaults `upcat`, `acet`, `dcat-dlsu` (skip ones already focused): rendered as tiles with a small "+ Add" affordance; tap adds to focus via `useFocusListings.addListing`.
   - Remaining slots render as blank dashed "+" tiles opening the exam picker.
   - Each filled tile: acronym monogram (colored circle, acronym text, `subjectColor`-style palette), preparedness % badge at top (per-exam readiness per Global Constraints; show `—` when null), small title under.
   - Tile tap: if that exam has no mock/diagnostic score yet → `/practice/diagnostic`; else → `/practice/start/<slug>`.
   - Section header action "See more" → `/(tabs)/listings`.
   - **Exam picker modal**: 3×3 grid of exam listings (blueprint-backed exams first, from `listPublishedBlueprintSlugs` + listings type=exam) + "See all" → `/(tabs)/listings`. Tap = add to focus and close.
2. **Subject preparedness** — 2 rows × 3 cards (render existing subjects, up to 6): % score (`subjectReadinessPct`, 0% when no data), fill color by `readinessTone`, CTA label "Take exam" → `/practice/diagnostic?subject=<subject name>`. Replaces the current "Subjects to improve" 3-col grid.
3. **Explore cards** — keep the existing 4-card grid (Universities, Scholarships, Courses, Destinations) as-is.
4. **Recommended scholarships** — 6 cards: scholarships ranked by `rankForDisplay` (apps/mobile/utils/listingSearch.ts:209) with the student's clusters (derive exactly as `app/(tabs)/listings.tsx:177-187` does) and `matchScholarship` eligibility; open/upcoming only; "See all" → `/(tabs)/listings?tab=scholarships`. Card shows title, provider, grant amount/stipend when present, match pill (reuse `components/scholarships/MatchPill.tsx`).
5. **Merged "News & Dates"** — single section replacing both "News & Events" and "Upcoming Dates": merge the existing three date sources (focused-listing dates, note reminders, admissions events at index.tsx:339-390) + top news rows into one date-sorted `ListCard` list, top 5, "See all" → `/(tabs)/updates`.
6. Keep: header row, date+greeting, pull-to-refresh, notifications modal, theming, `ScreenScroll`. Remove the Kuya hero band entirely (Task 1 gates chat; the hero is superseded).
7. Extract each new section as a component under `apps/mobile/components/home/` (FocusExamsFold, SubjectPreparednessGrid, RecommendedScholarships, NewsAndDates) to stop index.tsx from growing; index.tsx composes them.
8. Tests: pure helpers (default-suggestion logic, merged date-feed builder, scholarship pick) unit-tested; snapshot-free.

## Task 4: Exam timing accuracy, study sprint, readiness on exam cards, ACET/USTET data

1. Migration `supabase/migrations/042_exam_blueprint_fixes.sql`:
   - ACET: insert missing section `('acet:4','acet','General Information','General Information',65,90,false,4)` (columns per 032 shape) so sections sum to the declared 245 items / 270 min.
   - USTET: `update exam_blueprints set total_time_minutes = 180, updated_at = now() where slug = 'ustet';` (sections sum to 180; mechanics note says four 45-min subtests).
   - `update exam_blueprints set updated_at = now() where slug in ('acet','ustet');` and same for inserted/updated section rows if the sections table has updated_at.
2. **Timer scaling** in `apps/mobile/app/practice/exam/[slug].tsx` (startExam, ~line 215): when `built.totalQuestions < blueprint.totalItems`, scale total time to `max(1, round(totalTimeMinutes * built.totalQuestions / totalItems))` minutes. Scale per-section timers by the same per-section ratio (sampled/declared). Show the scaled time on the prestart card.
3. **Study Sprint (30 min)**: prestart screen offers two buttons: "Full Mock" and "Study Sprint · 30 min". Sprint samples a proportional subset per section targeting 30 total minutes (`itemsPerSection = round(section.itemCount * 30 / totalTimeMinutes)`, min 1 where pool non-empty), timer fixed 30 min. Sessions record identically (they already write per-section rows).
4. **Readiness on exam cards**:
   - Lists tab `apps/mobile/app/(tabs)/listings.tsx` renderCard (~:427): for exams with a blueprint, show readiness % chip (per-exam readiness per Global Constraints, tone colors); `—` when no attempts.
   - Mock exam picker `apps/mobile/app/practice/exam/index.tsx`: add best-score % to each blueprint card.
5. Tests: timer-scaling math and sprint sampling as pure functions in `apps/mobile/utils/examBuilder.ts` (or sibling util) with unit tests; ACET seed sums asserted if a seed test exists.

## Task 5: Universities — working filters, requirements vs qualifications, richer cards

1. Migration `supabase/migrations/043_university_reqs_quals.sql`:
   - `alter table university_profiles add column if not exists requirements text[] not null default '{}';`
   - `alter table university_profiles add column if not exists qualifications text[] not null default '{}';`
   (No data backfill — admin fills later. Do not touch updated_at since values are empty.)
2. Mobile mirror + sync mapping for both columns (schema.ts:389-420 block; sync.ts university_profiles pull).
3. University detail `apps/mobile/app/schools/[slug].tsx`: two new sections rendered only when non-empty, using the `safeParseArray` splitter + pill pattern (:73-99, :553-565):
   - "Application Requirements" (paper documents: Form 137/138, report card, clearance, barangay certificate, ID photos, etc.)
   - "Qualifications" (eligibility criteria: GWA minimums, strand, citizenship, age).
4. **Filter fixes** in `apps/mobile/components/schools/SchoolsDirectory.tsx` (:117-176):
   - Free tuition: `freeTuitionOnly` passes when `profile.freeTuition === true` OR `school.isSuc` OR `school.isLuc` (RA 10931 covers SUCs/LUCs) — no longer silently drops the 324 profile-less schools.
   - Type chips: normalize raw `type` strings into buckets via a new pure util `apps/mobile/utils/schoolType.ts` (`normalizeSchoolType(raw): 'SUC' | 'LUC' | 'Private' | 'State College' | 'Other'`), chips built from normalized values, filter compares normalized.
   - Search box understands region + free-tuition tokens: a light intent parse — if the query contains a region name/alias (`canonicalizeRegion`, utils/region.ts), set/OR the region filter; if it contains "free" / "free tuition" / "libre", set freeTuitionOnly; remaining tokens still substring-match name/acronym. "free tuition universities in bicol" must return Bicol SUC/LUC/free schools.
5. **Richer school card** (`SchoolCard` in SchoolsDirectory.tsx:62-93): add entrance-exam acronym chip (from joined `university_profiles.entrance_exam_acronym`), free-tuition badge (existing), and "Requirements ✓" indicator when the new arrays are non-empty.
6. Tests: `normalizeSchoolType`, the search intent parse, and the free-tuition predicate as pure functions with unit tests.

## Task 6: Admin — subjects/topics/questions CRUD + AI-assisted generation

1. **Create subject**: new `POST /api/flashcards/subjects` route (service-role insert into `flashcard_subjects`, admin-gated like siblings, 409 on duplicate name 23505) + "New subject" button/modal in `apps/admin/components/admin/SubjectsView.tsx`.
2. **Topic rename/delete**: add `PATCH` and `DELETE` to `apps/admin/app/api/flashcards/topics/[id]/route.ts` (23503 → 409 with message "Cannot delete: students have practice history on this topic."); wire rename/delete UI in the subject detail (`SubjectCardsView.tsx` topic sections).
3. **Subject delete 409**: keep the guard; improve the message to name the cause (practice history) and suggest archiving instead.
4. **AI-assisted question generation from format/samples** (extend the existing Gemini pipeline — do NOT add a new AI provider):
   - `apps/admin/app/api/flashcards/generate/route.ts`: accept optional `formatNotes: string` (admin's description of the desired question format) and `sampleText: string` (pasted or uploaded sample questions, ≤20k chars); feed both into `buildGenerationPrompt` as explicit sections ("FORMAT INSTRUCTIONS FROM ADMIN", "SAMPLE QUESTIONS TO IMITATE").
   - UI in `apps/admin/app/admin/flashcards/new/page.tsx` AI panel: textarea for format description + file drop (reuse `CsvDropzone` accepting .txt/.csv/.md, parsed client-side to text) + existing count selector.
5. Tests (vitest): subjects POST route (duplicate name), topics DELETE (FK 409 path mocked), prompt builder includes format/sample sections.

## Task ordering

1 → 2 → 3 (3 depends on 1's removal of the hero + 2's diagnostic route). 4, 5, 6 independent afterward.
