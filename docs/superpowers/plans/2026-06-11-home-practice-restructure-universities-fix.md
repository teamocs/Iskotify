# Home/Practice Restructure + Universities-by-Course Fix — Spec & Plan

> Executed via superpowers:subagent-driven-development. Mobile only (`apps/mobile`), JS-only → OTA, NO app.json bump. NativeWind REMOVED — StyleSheet + tokens. Never `{count && <JSX/>}`. Density rules ([[uiux-density-patterns]]) still apply EXCEPT where the user explicitly overrode them (Kuya full card on top is a user decision).

## Spec

### Task 1 — Home dashboard restructure + calendar → Updates
New Home order (app/(tabs)/index.tsx):
1. Greeting header (unchanged, :704-741)
2. **Kuya Baw FULL card** — always expanded (current expanded JSX :778-819), directly after header. DELETE the collapse/expand mechanism: `coachExpanded` state, collapsed row JSX (:820-840), "Show less" control, related styles/testIDs.
3. **Quick Practice CTA** (existing block :745-763) moved UNDER Kuya.
4. **Focus list cards** (NEW): one full-width card per `focusedListings` entry (ListCard-style row): title, type badge (`#priority · exam/scholarship`), days-left line (examDate/deadline → "X days left" or date), and MINI STATS: `Readiness N%` (per-listing accuracy, see below) + `🔥 N-day streak` (global streakDays). Tap → `/listings/{slug}`. Empty state when no focus listings: keep a slim InfoBanner-style prompt linking to Exams tab.
5. **Upcoming Dates** (existing top-3 + See all block :888-948) — LAST section.
REMOVE from Home entirely: stats card (SplitStatCard :765-774), Weak Areas section (:853-886; keep `weakTopics` data in useHomeStats — Quick Practice CTA still uses `weakTopics[0]`/firstTopicId for its destination), CalendarStrip block (:842-851), Missing Requirements + My Progress merged row (:950-980; the user's final order ends at Upcoming Dates — progress now lives on focus cards; requirements remain on listing detail screens).

**Per-listing readiness data**: add `getListingAccuracy(db)` to services/homeAggregates.ts — `SELECT listing_slug, SUM(score) ok, SUM(total) total FROM practice_sessions WHERE total>0 GROUP BY listing_slug` → `Map<slug,{ok,total}>` (or row array). Real-SQLite test (seed sessions incl. zero-total rows excluded). useHomeStats exposes `listingAccuracy: Record<string, number|null>` (rounded % or null when no sessions) — computed in the same cachedQuery load.

**Calendar relocation → app/(tabs)/updates.tsx**: move the `CalendarStrip` component definition (currently inline in index.tsx :35-207) into `components/calendar/CalendarStrip.tsx` (export it + only the helpers it needs; Home keeps timeGreeting/phHour for the greeting — check which helpers each side needs and split accordingly). Updates renders it after its header, before ResultsTrackerCard, with the SAME full functionality: DateActionSheet + MonthSheet modals, reminder handlers (handleSaveReminder/handleSaveAndOpenEditor/handleDeleteReminder/handleOpenNoteEditor/handleOpenListing — move them from index.tsx :360-425), day-index data via `useHomeStats()` (cheap — cached 'home:stats'). DELETE all calendar state/handlers/modals from Home (activeDayMs, showMonth, DateActionSheet, MonthSheet renders :985-1005). NotificationModal + AskKuyaModal STAY on Home.

Tests: home.test.tsx — remove/update assertions for stats card (:162-172), weak areas (:175-182, 297-335), coach collapsed/expand (:143-159 → assert full card always: 'AI Coach' badge visible immediately); ADD: focus card renders title + Readiness + streak + navigates; section order sanity. Updates tests (if any) + new: calendar strip renders on Updates.

### Task 2 — Practice screen restructure
app/(tabs)/practice.tsx new order: header + stats (unchanged :614-628) → **My Focus grid** → **Recommended grid** → **Mock Exams grid** → **Subjects accordion** → Saved Decks → AI Study Feedback (collapsed) → Study Tools (collapsed).
- **REMOVE AiModelBanner** usage (:631 + import). Component file stays (unused elsewhere? leave file; only remove usage — note: model download remains reachable via the Kuya download gate).
- **REMOVE subject filter chips** block (:634-656) AND remove `selectedSubjectId`/`setSelectedSubjectId` + the filteredTopics filter from hooks/usePracticeData.ts (:145-147, interface, state) — accordion always shows all subjects' topics. Update usePracticeData consumers/tests.
- **FocusCard** (:285-347): Review button ALWAYS rendered on EVERY card (delete the `isActive` gate on the button AND the `(isActive || hasMockBlueprint)` actions-wrapper gate — actions area now constant → no layout shift). **DELETE the Mock exam button** + `hasMockBlueprint`/`onMock` props + blueprintSlugSet usage for focus cards (Mock Exams section covers discovery). Card tap STILL selects (`setActiveFocusSlug`) — selection keeps driving the active border + Recommended filtering (activeTopicIds) — verify that still works.
Tests: practice.test.tsx — delete chip tests (:121-124, 132-143); update focus-card Mock-button tests (:294-320 → Mock button never renders on focus cards; Review renders on all cards without tapping); section-order spot checks unchanged (text queries).

### Task 3 — Fix "Find Top Universities by Course" (ROOT CAUSE CONFIRMED)
listings.tsx :428 does `router.push('/schools/course')` but only `app/schools/course/[code].tsx` exists — it mounts with `code=undefined`, queries `courseTab=undefined`, renders empty. Career screen does it right (`/schools/course/${courseTab}`).
**Fix**: create `app/schools/course/index.tsx` — course picker:
- "Your target courses" section first: parse `userSettings.targetCourses` (CourseOption[] {id,label,careerCourseId}); resolve each to a courseTab: id `tax:<courseTab>` → direct; else careerCourseId → `courseTaxonomyMap WHERE careerCourseId = X` → courseTab. Pure helper `resolveCourseTabs(targetCourses, taxonomyRows): {courseTab,label}[]` in utils/ with unit tests (tax-id direct, careerCourseId lookup, unresolvable skipped, dedupe).
- "All courses" section below: full `courseTaxonomyMap` list (label, ordered alphabetically), ListCard rows.
- Tap → `router.push('/schools/course/' + courseTab)`. Screen styling: ScreenScroll + ListCard/SectionHeader, tokens, top bar with back.
- Defensive: in `[code].tsx`, if `!code` → render the picker prompt or `router.replace('/schools/course')` (avoid the silent empty state).
- listings.tsx link unchanged (`/schools/course` now resolves to index).
Tests: helper unit tests + a light render test of the picker (mock db rows: target course resolves to tab; all-courses list renders; tap pushes correct route).

## SDD execution
Task 1 → Task 2 → Task 3, each: fresh implementer → spec reviewer → quality reviewer (fix loops). Final integration review (esp.: Home↔Updates calendar move completeness — no orphaned state/imports on Home, reminders still schedule; usePracticeData interface change ripple). Then controller: full jest+tsc+react-doctor, push, ONE OTA, on-device checklist.
