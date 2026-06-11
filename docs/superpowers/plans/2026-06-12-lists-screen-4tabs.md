# "Lists" Screen — Rename + 4-Tab Navigation — Spec & Plan

> SDD execution. apps/mobile, JS-only → OTA 1.6.0 + web auto-deploy. TDD where logic is pure. Never `{count && <JSX/>}`. Density rules hold (≤2 badges/row, one primary action, 44pt targets, maxFontSizeMultiplier 1.4 on dense text).

## Spec

### 1. Rename "Exams" → "Lists" (label-only; route stays /listings)
- components/TabBar.tsx:21 label; components/web/SidebarNav.tsx:44 label; app/(tabs)/_layout.tsx:26+45 titles; listings.tsx header title "Lists" + subtitle → "Universities, scholarships, courses & career destinations".
- User-facing copy that says "Exams tab": app/(tabs)/index.tsx:492-493 (InfoBanner message + actionLabel → "Lists"), services/chatPrompts.ts:37 SCOPE_BLOCK + :65 URL_RULE → "Lists tab".
- Tests updated: chatPrompts.test (4 refs), useKuyaChat.test (1), SidebarNav.test (1), listings.test (title/tab assertions).

### 2. Four-tab navigation UI (replaces the 2-segment control in listings.tsx)
- Tabs: **Universities** | **Scholarships** | **Courses** | **Destinations**. State `tab: 'universities'|'scholarships'|'courses'|'destinations'` (replaces `segment`).
- UI: full-width nav bar row (not floating chips): 4 equal flex items, single-line labels (typo.xs/sm, maxFontSizeMultiplier 1.4, numberOfLines 1); ACTIVE item = highlighted pill (maroon `rgba(128,0,0,0.82)` bg, white text, radius.pill) — inactive = plain secondary text, pressed feedback; ≥44pt height; accessibilityRole="tab"/selected state. On very narrow screens labels may ellipsize — acceptable.
- Switching tabs resets search + AI results (existing onChangeSegment semantics).

### 3. Tab content
- **Universities** = the existing exam slice unchanged (recommended-for-region section, AI/keyword search, dense rows, Mock/Focus badges). Only the section label "All entrance exams" stays.
- **Scholarships** = existing scholarship slice unchanged (match pills, profile banner).
- **Courses** = the course picker ABSORBED inline (REMOVE the "🏫 Find top universities by course" uniLink row entirely):
  - Data: resolveCourseTabs(userSettings.targetCourses, courseTaxonomyMap) → "★ Your target courses" section (when non-empty) + "All courses" (deduped courseTaxonomyMap, alphabetical) — same logic as app/schools/course/index.tsx (REUSE: extract the data assembly into a small hook/helper usable by both, or inline re-query; the standalone /schools/course route REMAINS for deep links — career screen links to it).
  - Rows: ListCard-style dense rows; tap → router.push(`/schools/course/${courseTab}`) (same flow as today).
  - Search box on this tab = plain label filter (no AI call).
- **Destinations** = career-path data by destination country:
  - Data: local `careerCountries` (code,name,region) LEFT-joined logically with `careerDestinations` counts — count courses per country via `countryCodeFromName(dest.country) === country.code` (the existing utility; destinations.country is a NAME string). Show countries that have ≥1 destination first (sorted by course count desc), then any remaining careerCountries rows.
  - Rows: dense ListCard — flag/emoji or initial, country name, subtitle `{region} · {n} courses in demand`; tap → router.push(`/career/country/${code}`) (existing screen lists "Courses in demand here" → tapping a course there already leads to /career/[courseId]).
  - Search box on this tab = country-name filter.
  - **Destination-specific detail polish**: app/career/country/[code].tsx course rows → push `/career/${courseId}?country=${code}`; app/career/[courseId].tsx reads optional `country` param and AUTO-EXPANDS the matching destination card (the Wave-3c collapsed cards) + scrolls is optional (auto-expand suffices). This delivers "details about the career path on that course with the specific destination".
- Recommended section + scholarship banner render only on their respective tabs. listHeader logic per tab.

### 4. Data/perf notes
- Courses + Destinations tab data loaded lazily on first tab visit (state-cached in-screen; queries via cachedQuery 'practice:'-style keys NOT required — small tables; plain queries with useState ok, but wrap in cachedQuery('lists:courses'/'lists:destinations', 300s) for consistency with the data layer).
- All queries local SQLite (career tables synced). No supabase calls.

## Tasks (SDD)
**Task 1 — the whole screen restructure + renames** (single cohesive change): listings.tsx 4-tab refactor + Courses/Destinations tabs + uniLink removal + all renames + career/[courseId] `country` param auto-expand + career/country/[code] passes the param. Pure helpers TDD: country-aggregation helper `aggregateDestinationCountries(countries, destinations): {code,name,region,courseCount}[]` in utils/ with unit tests (name→code matching via countryCodeFromName, count, ordering, zero-dest countries last). Tests updated/added: listings.test (4 tabs render, active pill state, courses tab rows, destinations tab rows + navigation pushes, renames), career screens light assertions if harness allows.
**Review** — combined spec+quality (regression focus: Universities/Scholarships slices byte-identical behavior, search/AI path intact, no bare-zero, density rules).
**Ship** — full jest+tsc, push (web auto-deploys), OTA.
