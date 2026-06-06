# Epic G — Beta-Feedback Fixes & IA Rework (scoped) — Design Spec

**Date:** 2026-06-07
**Status:** Draft for review
**Master plan:** [2026-06-06-mvp-upgrades-master-plan.md](2026-06-06-mvp-upgrades-master-plan.md) (Epic G §2 + beta-feedback worklist §4)
**Scope decision (locked):** build the parts that do NOT depend on Epics C/D now; DEFER the Listings restructure (Universities/Scholarships/Courses segments, AI-Safe-Score, PRC ranking), the Updates feed *content* (Epic F), and the Requirements *document vault* (post-MVP).

---

## 1. Goal

Fix the beta-feedback blockers and correctness issues that make the app feel rough: the broken quiz flow (auto-advance, manual pickers), the misplaced Analytics tab, the cluttered Practice tab, missing study-progress visibility, and a scattered requirements experience — without pulling in data that Epics C/D/F will provide.

## 2. In scope vs deferred

**In scope (this epic):**
- G1 Nav IA: Analytics tab slot → **Updates** shell screen; move the analytics dashboard into **Profile**.
- G2 Exam-flow rework: a single shared, corrected flashcard exam runner (no auto-advance, skip/back/change, QuestionNavigator, Quick vs Full, in-quiz report + duplicate guard, **Retake exam** + **Share score**), used by all 3 legacy entry screens; preserve the committed on-demand `enhancing` phase.
- G3 Practice tab redesign: remove "Quick Start"/"Full Review Deck"; add an Overall-score + Streak + Exams-taken header; surface AI-General-Feedback; My Focus shows %-scores.
- G4 Requirements: a standalone "My Requirements" screen + Home "kulang na requirements" widget, built on the existing `RequirementsChecklist` + `userRequirements`.
- G5 Onboarding + copy: confirm pre-assessment stays last/skippable; "Assesment"→"Assessment" + other typos; light category grouping in the onboarding listing picker (exam vs scholarship).
- G6 Home: prominent Kuya Baw entry + upcoming deadlines + weak-area cards (using existing data).

**Deferred (need C/D/F or post-MVP):** Listings Universities/Courses segments, AI-Safe-Score, PRC ranking; Updates feed content; Requirements document vault/Storage + structured For-what/Deadline fields; onboarding "National→Regional→Scholarships" university segmentation; My-Focus subtest deep-links for universities.

## 3. Architecture

The centerpiece is **deduplicating + correcting the quiz flow**. Today `[topicId].tsx`, `deck/[deckId].tsx`, and `listing/[slug].tsx` each duplicate ~the same 300-line quiz (timer, auto-advance, results). Epic G extracts the runtime into one shared component; the three routes become thin loaders that fetch their cards, run the existing `enhancing` phase, build questions via `mcDistractors.buildQuizQuestions`, and hand off to the shared runner.

### G2 — shared flashcard exam runner

`apps/mobile/components/practice/FlashcardExam.tsx` — a self-contained component:
```ts
interface FlashcardExamProps {
  title: string
  questions: QuizQuestion[]          // from buildQuizQuestions (already AI/admin/parsed/fallback resolved)
  listingSlug?: string               // for session recording
  subtest?: string                   // optional tag (kept null for flashcard decks)
  onExit: () => void
}
```
Behavior (mirrors `practice/upcat/[subtest].tsx`, the proven corrected pattern):
- Phases: `exam | results`. (Loading + `enhancing` stay in the loader screens.)
- **No auto-advance:** tapping an option only records the selection (`answers[idx] = optionIndex`); a footer **Next/Submit** (primary) advances. **Back** (disabled on Q1) + **Skip** (ghost) also present. Answers are changeable until submit.
- **QuestionNavigator** (reuse `components/upcat/QuestionNavigator.tsx`) for non-linear jump + answered/ skipped state.
- **Untimed.** The manual item-count + timer pickers are removed entirely (count is decided by Quick/Full at load; no per-question countdown — aligns with the UPCAT corrected flow and kills the picker the spec calls out).
- **In-quiz "Report" button** per question → records to a new local `question_feedback` table `(card_id, reason, created_at)` (lightweight; no network). Gives the "Feedback button" without a backend.
- **Results:** overall % + correct/total, per-question review with explanations, **"Retake exam"** (re-runs same config) + **"Share score"** (RN `Share.share` with a templated message) + a Back-to-... exit. (Removes "Play Again".)
- Records one `practiceSessions` row via `useRecordSession` on submit (as today), with correct `durationSecs` (start stamped at exam mount).

**Quick vs Full** (replaces pickers): the loader screens show a tiny Quick/Full chooser (clone the `upcat/index.tsx` bottom-sheet pattern). Quick = sample ~15 questions; Full = all available (cap 60). A pure helper `apps/mobile/utils/flashcardExam.ts` `pickQuestions(all, mode)` (TDD) does the sampling + an **in-session duplicate guard** (dedupe by normalized question text).

The three loaders after rework:
- `practice/[topicId].tsx` — fetch topic cards → enhance → buildQuizQuestions → `<FlashcardExam title={topicName} listingSlug=…>`.
- `practice/deck/[deckId].tsx` — same for a saved deck.
- `practice/listing/[slug].tsx` — same, honoring `mode=all|weak` for card selection, then Quick/Full for size.

### G1 — Nav IA

- Create `apps/mobile/app/(tabs)/updates.tsx` — a shell screen ("Updates" — Upcoming Events / News / Iskotify updates) with an empty-state placeholder ("Coming soon"); Epic F fills content. Register it in `(tabs)/_layout.tsx` in the slot currently held by `analytics` (position 4), with an Updates icon in `TabBar`.
- Move the analytics dashboard (`analytics.tsx` body + `useAnalytics` + `WeeklyChart`/`StatCard`/mastery accordion) into a new **Analytics section in `profile.tsx`** (below identity + Focus list). Delete the `analytics` tab registration. Keep the components; just relocate their host.

### G3 — Practice redesign (`(tabs)/practice.tsx`)

- Remove the "Quick Start" section (Full Review Deck + Weak Topics Only cards).
- Add a header stats row: **Overall score** (avg accuracy), **Streak** 🔥, **Exams taken** (session count) from `useAnalytics('overall')` (or a light derived hook).
- My Focus cards show a **%-score** per focus (from `useAnalytics(slug).avgAccuracy`).
- Surface an **"AI General Feedback"** entry (a card that summarizes weak subjects from session data — text only, no new model call required; uses existing mastery data).
- Keep: UPCAT card, Recommended, Saved Decks, Subject accordion, AI model banner/Enable-AI toggle.

### G4 — Requirements

- New route `apps/mobile/app/requirements.tsx` (a "My Requirements" screen): for each focused listing with `requirements`, render the existing `RequirementsChecklist`; show an aggregate acquired/total. Entry points: a card in Profile and/or Home.
- **Home "kulang na requirements" widget** in `(tabs)/index.tsx`: a compact card showing total missing requirements across focused listings (computed from `userRequirements` vs each listing's `requirements.length`), linking to `/requirements`.
- Data model unchanged (`userRequirements` index+acquired); structured For-what/Deadline + document vault are DEFERRED (noted).

### G5 — Onboarding + copy

- Verify pre-assessment is the last step and skippable (it is) — no reorder needed; add a clearer "Skip for now" affordance if missing.
- Grep + fix "Assesment"→"Assessment" and any obvious typos.
- Light grouping in the onboarding listing picker: section the existing list by Exams vs Scholarships (university segmentation deferred to Epic C).

### G6 — Home (light)

- Prominent Kuya Baw entry (chat) near the top.
- Upcoming deadlines from focused listings' `deadline`.
- Weak-area cards from mastery data. (All use existing data; no new tables.)

## 4. Data model changes

- New SQLite table `question_feedback (id, card_id text, reason text, created_at int)` (+ Drizzle + client.ts migration). Local-only (no sync) for now.
- No Supabase migration in this epic (code-only). No new synced columns.

## 5. Testing

- **G2:** `flashcardExam.ts` `pickQuestions` pure tests (Quick sample size, Full cap, duplicate-guard). `FlashcardExam` component: no-auto-advance (select doesn't navigate), skip/back/change, submit→results, Retake, Share invoked. The 3 loaders: smoke render + that they pass questions to the runner.
- **G1:** Updates shell renders; Profile shows analytics section; analytics tab no longer registered (snapshot/route test).
- **G3:** Practice renders header stats; no "Quick Start"/"Full Review Deck" text present.
- **G4:** requirements screen aggregates; Home widget shows missing count.
- Full mobile + admin suites green. Mobile JS ships in the final-batch OTA.

## 6. Sequencing (plan expands to bite-sized TDD tasks)

1. `question_feedback` schema + migration.
2. `flashcardExam.ts` `pickQuestions` pure helper (TDD).
3. `FlashcardExam.tsx` shared runner (+ tests).
4. Refactor the 3 loader screens to use it (preserve enhancing phase + mode=weak).
5. G1 Updates shell + tab swap.
6. G1 analytics → Profile move.
7. G3 Practice redesign.
8. G4 requirements screen + Home widget.
9. G5 onboarding/typos.
10. G6 Home improvements.
11. Verify (suites + build).

## 7. Open questions (proposed defaults)

- Reworked flashcard flow is **untimed** (removes the timer picker; aligns with UPCAT). If a timed mode is wanted later, add a single fixed timer driven by exam stats. (Proposed: untimed.)
- "AI General Feedback" is a **text summary from existing mastery data**, not a new LLM call. (Proposed: yes — cheap, offline.)
- Requirements For-what/Deadline structured fields + document vault: **DEFERRED** (checklist-first). (Proposed: defer.)
