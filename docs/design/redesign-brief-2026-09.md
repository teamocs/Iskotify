# Iskotify Redesign Brief: Admin Console + Mobile App

**Date:** 2026-09-26 · **Status:** proposal, not approved. No source code was changed.
**Inputs:** `PRODUCT.md` (draft, inferred fields not yet confirmed), `DESIGN.md`, `iskotify-context.md`,
`docs/audits/2026-07-02-full-app-audit.md`, `docs/superpowers/specs/2026-06-10-uiux-density-redesign.md`,
and a source read of `apps/admin` and `apps/mobile` on `feature/admin-toasts-kb-gaps` (commit `18a6eac`, plus
uncommitted KB work by another agent that this brief does not cover).

> ⚠️ DEGRADED: single-context. The two assessments were sent to isolated sub-agents, but their results
> never reached this session. So the design review (A) was redone in this context and finished before the
> detector (B) ran, which keeps the order but not the isolation.
>
> **Neither app was run.** Every finding comes from reading the code. There were no screenshots, no browser
> overlay and no device test. Contrast figures were computed from the token values in the code, not
> measured on a screen. Anything about motion, rendering, or how things feel on a real low-end Android is
> a hypothesis until it is tested.

---

## 1. Verdict in one paragraph

Both surfaces rest on sound foundations: a measured token system, a real accessibility floor, and a working
offline data layer. The problem is the structure built on top. Each shows it differently. The **admin
console** is organised around database tables rather than the work the team does. It has no home, and its
36-link sidebar pushes an operator to remember where the work is waiting. Its tables are 16 separate
hand-built copies with no search, sort or bulk actions. The **mobile app** has grown by adding sections.
The same readiness, estimate and news blocks appear on 3–4 screens. The highest-stakes screen (the timed
mock exam) has a mislabelled button that submits the exam, and no guard against leaving it. Neither
surface feels made for a Filipino student or for a review-centre content team; they are well-built generic
Tailwind and RN. A redesign should start with the **information architecture and one shared primitive
layer**, and only then change the look.

## 2. Design health scores (Nielsen, 0–4)

| # | Heuristic | Admin | Key admin issue | Mobile | Key mobile issue |
|---|---|---|---|---|---|
| 1 | Visibility of status | 2 | Only 5 `loading.tsx` files and no `error.tsx` anywhere under `app/admin`; server pages ignore query `.error` (e.g. `app/admin/flashcards/page.tsx:22-37`), so a DB failure looks like an empty list | 3 | Sync error banner, timers and plan state are good; Home loaders only `console.warn` (`app/(tabs)/index.tsx:204,236`) |
| 2 | Match with the real world | 3 | Sidebar exposes raw table names (`course_taxonomy_map`, "Admissions Updates (table)") | 2 | "EEAS Adjustment", "Palugit", "Pabigat", "Σ" timer prefix; the tab called "Exams" is really practice, while exams also appear under Lists |
| 3 | User control & freedom | 2 | `ListingDrawer` has no Escape key, focus trap or `role="dialog"` (`components/admin/ListingDrawer.tsx:223-235`) | 2 | `‹` back leaves a timed mock with no confirmation and nothing saved (`app/practice/exam/[slug].tsx:652`) |
| 4 | Consistency & standards | 2 | 16 hand-built `<table>`s; 101 raw hex classes; "Knowledgebase" (sidebar) vs "Knowledge Base" (topbar) | 2 | The same readiness blocks on Home, Exams, Progress and Profile; 128 numeric `fontSize` literals; 162 raw `rgba()` |
| 5 | Error prevention | 3 | `ConfirmDialog` is exemplary; the KB publish holds back bad items | 1 | The last-question "Review" button calls `submit()`, and nothing warns about unanswered items (`[slug].tsx:720-735`) |
| 6 | Recognition over recall | 2 | 36 links in 12 sections; emoji icons; no count badges on work queues | 3 | Labelled tabs, Today's Plan, a question navigator |
| 7 | Flexibility & efficiency | 1 | No search, sort, pagination or bulk actions on Listings or Users (`ListingTable.tsx`, `app/admin/users/page.tsx:43`) | 3 | Jump navigation, due queue, Study Sprint |
| 8 | Aesthetic & minimalist | 2 | Page title shown twice (Topbar + h2, `upcat/review-queue/page.tsx:56-59`); 9–10px uppercase labels everywhere | 2 | Home: 4 header tiles plus 7 sections; the exam header stacks 3 navigation strips above the question |
| 9 | Error recovery | 2 | Errors only as toasts ("Network error"), never next to the field that failed | 2 | Silent failures on Home and Updates loads |
| 10 | Help & docs | 3 | `/admin/guide` plus `SectionHelp` plus explanatory copy on each page | 3 | `help.tsx`, the estimator disclaimer, per-option explanations |
| | **Total** | **22/40 (Acceptable)** | | **23/40 (Acceptable)** | |

**Cognitive load.**
- **Admin:** fails 5 of 8 checks (single focus, minimal choices, grouping, progressive disclosure, working
  memory). The sidebar is one decision point with 36 options.
- **Mobile:** fails 4 of 8 (single focus, hierarchy, minimal choices, one-thing-at-a-time). Home shows 7
  sections, Exams 9, and Lists has 4 segments inside a 5-tab bar. The exam screen shows back, title, 1–2
  timers, a counter, a navigator strip, a section grid, a subject bar, the question, options, and a
  3-button footer.

## 3. Design specificity

**LLM assessment:** Both surfaces are interchangeable with any other product in their category.

- **Admin:** a dark sidebar with emoji icons, white cards with `shadow-[0_2px_8px…]`, and uppercase 10px
  table headers. This is the default Tailwind admin, and nothing in it speaks to review-centre work
  (question quality, figures, answer keys, exam seasons).
- **Mobile:** stacked `Card` / `SectionHeader` blocks with percentages and emoji. It could be any study app.
  The Filipino identity only shows up in copy fragments ("Para sa mga Iskolar ng Bayan", "Palugit"). The
  things that are truly specific to Iskotify never shape the layout: the exam calendar, the entrance-exam
  season, and the Review Masters Bicol backing.

**Deterministic scan:**
- `impeccable detect --json` returned **0 findings** on all five targets: `apps/admin/app/admin`,
  `apps/admin/components/admin`, `apps/admin/components/flashcards`, `apps/mobile/app`,
  `apps/mobile/components`.
- As DESIGN.md already says, the detector does not check contrast, and it has no native rules. A clean run
  here is not evidence of quality.
- The grep evidence below found what the detector missed:

| Signal | Count | Worst files |
|---|---|---|
| Admin arbitrary hex classes `[#…]` | 101 | `SubjectsView.tsx` 14, `flashcards/new/page.tsx` 14, `TopicCardSection.tsx` 13, `listings/loading.tsx` 8 |
| Admin raw Tailwind palette (`gray-100` etc.) | ~29 | `users/page.tsx`, `early-access/page.tsx`, `ReportsManager.tsx`, `AppReportsManager.tsx`, `DraftsTable.tsx` |
| Admin inline card shadow vs `shadow-card` token | 9 vs 2 | `ListingTable.tsx:55`, `StatCard.tsx:12` |
| Mobile hex literals | 17 (down from ~30 after the Sept sweep) | `settings.tsx` 7 |
| Mobile `rgba()` literals | 162 | e.g. `[slug].tsx:773,788,824,838` (these hardcode the dark-theme red, green and maroon) |
| Mobile `fontSize:` numeric literals / below the 12pt floor | 128 / 11 | `TabBar.tsx:115` (11), `[slug].tsx:769,832` |

**Visual overlays:** none. The app was not run, so there was no browser injection.

## 4. What to keep

These are the redesign's foundation. Do not throw them away.

1. **The token contract in DESIGN.md.**
   - The web text ramp (`ink` / `ink-muted` / `ink-subtle`), with every step at or above 4.5:1 on all three
     surfaces, and the rule that there is no lighter step.
   - The three-role status colours (`DEFAULT` / `strong` / `soft`).
   - The native `useTheme()` keys with identical light and dark shapes.
   - This is measured, audited work. Any new direction extends these tables; it does not replace them.
2. **The accessibility floor.**
   - `ConfirmDialog` is the reference modal: `alertdialog`, focus in on open and restored on close, Escape,
     Tab trap (`components/admin/ConfirmDialog.tsx:22-71`).
   - The token-styled Sonner toaster with `closeButton` and a live region (`AdminShell.tsx:15-59`).
   - Native `accessibilityRole` / `accessibilityState` on tabs (`TabBar.tsx:43-45`).
   - `maxFontSizeMultiplier` discipline, and the `ScreenScroll` keyboard handling.
3. **Fonts and brand:** Outfit and Lexend self-hosted via `next/font`; maroon `#800000` at 10.95:1.
4. **Behaviour worth protecting:**
   - The estimator's compliance scaffolding (`estimator/__tests__/compliance.test.tsx`), its "Computed on
     this device, based on historical cutoffs" line, and the per-campus accessible labels.
   - The exam runner's fixed options zone, which stops the layout jumping between questions.
   - The absolute-timestamp timers.
   - The KB publish hold-backs.
   - The approved 2026-06-10 "one job above the fold" density principles. The redesign finishes that
     spec; it does not reverse it.

## 5. Ranked findings

Severity: **P0** blocks the task · **P1** major · **P2** minor · **P3** polish.

### Mobile

1. **[P0] The "Review" button submits the exam.**
   - **Where:** `app/practice/exam/[slug].tsx:720-735`. On the last question the ghost button reads
     "Review" but calls `submit()`. So does "Submit", and neither asks for confirmation or mentions
     unanswered questions.
   - **Why it matters:** in a timed mock this is a one-tap way to lose the attempt, at the most
     emotionally loaded moment in the app.
   - **Fix:** "Review" opens an overview sheet of answered, flagged and blank questions. "Submit" goes
     through a `ConfirmDialog` equivalent that says "3 unanswered".
   - *Command:* `$impeccable harden`.
2. **[P1] Leaving a timed mock loses it.**
   - **Where:** `[slug].tsx:652`. `‹` calls `router.back()` with no `usePreventRemove`, no Android
     `BackHandler` guard and no saved state. The back glyph also has no `accessibilityLabel`.
   - **Why it matters:** the Iskolar Aspirant gets interrupted, and one accidental swipe throws away
     40 minutes.
   - **Fix:** confirm on leaving, auto-save answers and the timer to SQLite, and offer "Resume mock" from
     Home.
   - *Command:* `$impeccable harden`.
3. **[P1] Mock results give pass/fail verdicts.**
   - **Where:** `[slug].tsx:550-551, 586-593`. The score card is styled pass/fail (`pct >= 60 ? s.pass :
     s.fail`, "🎉 Great work" / "📚 Keep practicing"). Course cut-offs show a red "Below cut-off (need
     Nth)" pill, measured against a percentile the screen itself calls "not a normed score".
   - **Why it matters:** this breaks the spirit of the no-pass/fail rule in PRODUCT.md. It is a
     qualification verdict built on a guess, and it lives outside the estimator's compliance test.
   - **Fix:** use neutral range language ("est. ~62nd percentile · cut-off data: 70th, 2019"), give no
     red or green verdict, and extend the compliance test to `practice/exam`.
   - *Command:* `$impeccable clarify`.
4. **[P1] Readiness is duplicated across four screens.**
   - **Where:**
     - Home: `FocusExamsFold`, `AdmissionEstimateCard`, `SubjectPreparednessGrid` (`(tabs)/index.tsx:414-440`).
     - Exams: "Subject readiness", "My Focus", `AdmissionEstimateCard` (`(tabs)/practice.tsx:965-1085`).
     - Progress: `AnalyticsDashboard`.
     - Profile: also embeds `AnalyticsDashboard`.
     - News & Dates repeats Updates.
   - **Why it matters:** no screen owns anything, so every screen is long. Home has 7 sections and Exams
     has 9, which contradicts the approved density spec.
   - **Fix:** one owner per concept (see §7). Other screens get a single line that links to the owner.
   - *Command:* `$impeccable distill`.
5. **[P1] Tab names don't match what the tabs hold.**
   - **Where:** the route `practice` is labelled "Exams" (`TabBar.tsx:18`). Actual exam listings live
     under "Lists", whose segments are Universities, Scholarships, Courses and Destinations
     (`(tabs)/listings.tsx:97-102`).
   - The Updates tab uses a bell icon, and so does the Home notifications button (`index.tsx:358`).
   - Profile is a hidden tab on native but a sidebar item on desktop web.
   - **Why it matters:** Jordan (the first-timer) looks for "UPCAT dates" under Exams and finds a practice
     hub.
   - **Fix:** name tabs after jobs, such as Today / Practice / Explore / Progress (see §7).
   - *Command:* `$impeccable clarify`.
6. **[P1] The exam screen is overloaded above the question.**
   - **Where:** `[slug].tsx:650-680`. Top bar with 1–2 timer pills and a counter, then `QuestionNavigator`
     (30×30 cells, below 44pt, still open from the July audit), then `SectionGrid`, then the subject bar.
   - **Why it matters:** on a 360×640 Android, the question gets well under half the screen height.
   - **Fix:** one slim header (section · time · n/N). The navigator moves into the Review sheet from
     finding 1. Targets become at least 44pt.
   - *Command:* `$impeccable layout`.
7. **[P2] You have to sign in before the app shows any value.**
   - **Where:** on web, `_layout.tsx:149-160` sends every visitor without a session to `/auth/sign-in`.
     Onboarding is then 5 steps: profile, listing picker, matcher, courses, and a 20-question
     pre-assessment (`onboarding.tsx:48,619-1194`).
   - **Why it matters:** the Barkada Reviewer arriving from TikTok bounces before answering a single
     question.
   - **Fix:** try 5 questions first, then "save your progress", and put the matcher and courses on Home
     as deferred nudges.
   - *Command:* `$impeccable onboard`.
8. **[P2] The Estimated Admission Score uses jargon and has the wrong emotional frame.**
   - **Where:** `estimator/index.tsx:194-316`. The title reads "Admission Score Estimator", which differs
     from the approved term. It shows "EEAS Adjustment", "Palugit", "Pabigat" and two-decimal numbers,
     and never says inline that a lower score is better.
   - **Fix:** name the screen with the approved phrase, give a one-line plain explanation per term, add a
     "lower is better" hint on `RangeBar`, and add a "what moves this" block linking to the weakest
     subtest drill.
   - *Command:* `$impeccable clarify`.
9. **[P2] Silent load failures.**
   - **Where:** Home admissions and readiness loads, and Updates, only `console.warn`
     (`index.tsx:204,236`).
   - **Fix:** use the `SyncErrorBanner` pattern for each section.
   - *Command:* `$impeccable harden`.
10. **[P2] Token drift.**
    - **Where:** 162 `rgba()` literals, many of them hardcoded dark-theme values that will be wrong in
      light mode (`[slug].tsx:773,788,824,838`); 11 font sizes below the 12pt floor (`TabBar.tsx:115`).
    - **Fix:** add alpha tokens (`accentScrim`, `dangerBorder`, `successBorder`) and a lint rule.
    - *Command:* `$impeccable polish`.
11. **[P3] The Home header has four tiles and one is not a button.**
    - **Where:** `index.tsx:333-373`. The logo tile uses the same `iconBtn` style as the three real buttons
      beside it.
    - **Fix:** make the logo plain, and move settings into Profile.

### Admin

1. **[P1] The sidebar is organised by table, not by work.**
   - **Where:** `components/admin/SidebarContent.tsx:9-102`. 36 links in 12 sections, 19 of them raw
     `data/[table]` browsers. "Admissions Updates" appears twice. `/admin` redirects to Listings
     (`app/admin/page.tsx:4`). Active state matches the exact path only (`:152`), so nested pages such as
     `/flashcards/subjects/[id]` highlight nothing. There is no `aria-current`.
   - **Why it matters:** an operator can't see what needs attention: pending reports, drafts, flagged
     distractors, date corrections, KB files with missing figures.
   - **Fix:** add a real **Inbox/Overview** home with a count for each queue. Group the sidebar into 5
     jobs (see §7). Put the raw tables behind one "Data" index page.
   - *Command:* `$impeccable distill` + `$impeccable layout`.
2. **[P1] The sidebar chrome fails WCAG AA, and DESIGN.md doesn't cover it.**
   - Section labels are `text-white/25` at 9px on `#1d1d1f`: about **2.3:1**.
   - "Admin Console" and the sign-out `↩` are `white/30`: about **2.7:1**.
   - "Super Admin" is `white/35`: about 3.1:1 (`SidebarContent.tsx:144,150,182,187`).
   - The sign-out button has only a `title`, no `aria-label`. "Super Admin" is a hard-coded string.
   - **Why it matters:** DESIGN.md claims every text step clears 4.5:1, but the dark sidebar sits outside
     its tables.
   - **Fix:** add `sidebar-ink` / `sidebar-ink-muted` tokens measured on `#1d1d1f`, make the labels at
     least 11px, and give sign-out an `aria-label`.
   - *Command:* `$impeccable audit`.
3. **[P1] There is no shared table.**
   - **Where:** 16 hand-built `<table>`s, e.g. `ListingTable.tsx:78-128`, `upcat/review-queue/page.tsx:77-121`,
     `users/page.tsx`, `DataTableManager.tsx`. None has search, sort, pagination or bulk actions.
   - Listings mixes type and status in one single-select filter (`ListingTable.tsx:11`), so you can't pick
     "active scholarships".
   - The chips have no `aria-pressed`.
   - Row actions are emoji buttons (✏️ 🗑) at 28px with only a `title` (`:108-117`).
   - **Fix:** build one `DataTable` primitive in `packages/ui` with a sticky header, sortable columns,
     search, faceted filters, row selection with bulk actions, a density toggle, and labelled icon
     buttons. Migrate all 16.
   - *Command:* `$impeccable extract`.
4. **[P1] The Distractor Review Queue has no way to act.**
   - **Where:** `upcat/review-queue/page.tsx:77-121`. The copy says "so a human can fix them by hand", but
     no row links to an editor, and there is no "looks fine, dismiss" action.
   - **Fix:** each row gets Edit (inline or a drawer) plus Dismiss-flag. A queue should shrink as you work
     through it.
   - *Command:* `$impeccable harden`.
5. **[P2] The Listing drawer is below the modal floor.**
   - **Where:** `ListingDrawer.tsx:223-235`. No `role="dialog"`, `aria-modal`, Escape, focus trap or focus
     restore. The ✕ has no name. Type and Status use `<label>` without `htmlFor` plus a duplicate
     `aria-label`. Errors appear only as a toast (`:203-211`), never next to the field.
   - **Fix:** a shared `Drawer` built from the `ConfirmDialog` pattern, and a `FormField` with
     `aria-describedby` and `aria-invalid`.
   - *Command:* `$impeccable harden`.
6. **[P2] Server failures look like empty data.**
   - **Where:** there is no `error.tsx` under `app/admin`, and page queries drop `.error`
     (`flashcards/page.tsx:22-37`, `users/page.tsx:43-64`).
   - **Fix:** add `app/admin/error.tsx`, and make every page render an explicit error state, not an empty
     one.
   - *Command:* `$impeccable harden`.
7. **[P2] Token bypass.**
   - **Where:** 101 arbitrary hex classes. `SubjectsView.tsx` alone reintroduces Tailwind's gray scale
     (`#f3f4f6`, `#d1d5db`, `#e5e7eb`, `#f9fafb`) and a fifth maroon `#6b0000`. `ListingTable.tsx:73,110`
     hard-codes `#3a3a3c` and `#e5e5ea`. `StatCard.tsx:16` has `#fff8f8`.
   - **Why it matters:** DESIGN.md's single most important rule ("Never write a raw colour value") is
     broken 101 times on this surface alone.
   - **Fix:** fold this into the primitive migration, then add a lint rule that bans `\[#` in `className`.
   - *Command:* `$impeccable polish`.
8. **[P2] Page titles are repeated and names disagree.**
   - Topbar h1 plus a page h2 with the same text (`review-queue/page.tsx:56,59`).
   - "Knowledgebase" (sidebar) vs "Knowledge Base" (topbar, `flashcards/page.tsx`); the route is
     `/flashcards`.
   - **Fix:** one `PageHeader` (title, description, primary action, breadcrumb).
9. **[P3] The Users page loads up to 50 pages of auth users on every visit.**
   - **Where:** `users/page.tsx:43`. No search or pagination in the UI.
   - **Fix:** paginate on the server and add search by email.

## 6. Persona red flags

- **Iskolar Aspirant** (low-end Android, prepaid data, interrupted, one hand on the phone):
  - The exam `‹` sits at top-left, out of thumb reach, yet one accidental tap loses the attempt.
  - 30×30 navigator cells.
  - Home's 7 sections all mount at once and run 4+ queries (`index.tsx:183-240`).
  - The estimator's two-decimal numbers with "EEAS" jargon.
- **Jordan (first-timer):**
  - Web sign-in wall before any content.
  - 5-step onboarding ending in a 20-question test.
  - A tab called "Exams" that doesn't list exams.
  - "Σ 38:12" timer.
  - The mock result verdict "Below cut-off" with no explanation of where the cut-off came from.
- **Sam (screen reader / keyboard):**
  - Mobile:
    - The exam back glyph has no name.
    - The QuestionNavigator is too small.
  - Admin:
    - The drawer doesn't trap focus or respond to Escape.
    - Emoji-only row actions are named only by `title`.
    - Filter chips have no `aria-pressed`.
    - The sidebar has no `aria-current`.
    - Sign-out is `↩` with a `title`.
- **Alex (admin power user):**
  - No search, sort or bulk actions on any table.
  - No keyboard shortcuts.
  - No count badges, so every queue has to be opened to find out whether it is empty.
  - The review queue can't be worked in place.
- **Sacrificing Parent (FB-first):**
  - There is nothing to share. No progress card, no deadline card, no share entry point (audit P2, still
    open).

## 7. Direction options

All three options keep the DESIGN.md tokens, the accessibility floor, the compliance rules and the offline
architecture. They differ in how much of the visual world changes.

### Option A: "Refined Maroon, Rebuilt" (structural only)

Keep the current look almost exactly. Spend the whole budget on IA and primitives:

- **Admin:** an Inbox home, a 5-group sidebar, and shared `DataTable` / `Drawer` / `FormField` /
  `PageHeader` / `EmptyState` / `ErrorState` in `packages/ui`.
- **Mobile:** one owner per concept, renamed tabs, and the exam runner fixes.

This is the lowest risk, the fastest to ship, and fits a solo developer during exam season. But it leaves
the specificity problem alone: Iskotify will still look like every other study app. Choose it if the goal
is fixing findings before the next UPCAT cycle, with branding to come later.

### Option B: "Kuwaderno" (a review-centre notebook world)

A warmer, more distinctive world taken from the real things of Filipino exam prep:

- Pad-paper ruled surfaces and margin-red annotations for explanations.
- Tabbed index dividers for Lists.
- The review-centre handout as the model for question screens.
- Maroon used as a rubber-stamp or ink accent.
- The admin console becomes an "editorial desk" where questions are proofs to mark up.

This gives the most specificity, is highly shareable with the Barkada crowd, and naturally shows off the
Review Masters Bicol backing. The costs:

- Every surface and status token has to be re-measured for contrast.
- Paper textures cost performance on low-end Android.
- It risks nostalgia kitsch.
- Maroon plus school imagery drifts towards the UP association the compliance rules forbid.
- It needs a full rewrite of DESIGN.md.

Choose it if brand differentiation matters more than fixing things quickly.

### Option C: "Isang Hakbang" / "One Next Step" (calm focus system), **RECOMMENDED**

The visual system stays Refined Maroon, but it is re-tuned for **focus under pressure**:

- **Colour:** neutral surfaces, with maroon reserved for exactly one primary action per screen.
- **Type:** big tabular numerals for countdowns, timers and estimate ranges; everything else quieter.
- **Motion:** almost none.

The IA is rebuilt around "what do I do now":

- **Mobile tabs: Today / Practice / Explore / Progress** (4 tabs).
  - **Today** owns the plan, the one focused-exam countdown, and a single "resume" or "next task" card.
  - **Practice** owns the mock exams, drills, due cards and the estimator.
  - **Explore** owns exams, scholarships, schools and courses, including all dates and news.
  - **Progress** owns readiness and analytics.
  - Profile moves to the avatar.
- **The exam runner becomes a focus mode:** a slim header, a review sheet, a submit confirmation and
  auto-resume.
- **The admin console becomes a work inbox:**
  - The home is a set of queues with counts: Reports, Drafts, Flagged distractors, Date corrections,
    Missing figures, Feedback.
  - Five sidebar jobs: **Inbox · Content** (question bank, flashcards, blueprints, KB sync) **· Catalog**
    (listings, updates, schools and data) **· People** (users, early access, feedback) **· Insights**.
  - Tables at desk density with keyboard navigation.
- **Brand specificity comes from content and moments, not decoration:**
  - The exam-season calendar as a signature element on Today.
  - Taglish microcopy at the end of a session, the peak-end moment ("Tapos na! 38/50 — Science is your
    next hakbang").
  - Shareable progress and deadline cards for the parent and the barkada.
  - Kuya Baw artwork kept for the empty and celebration states.

**Why this one:** it fixes every P0 and P1 above, finishes the approved 2026-06-10 density spec, and keeps
DESIGN.md's measured contrast work intact (it adds tokens, it doesn't replace any). It suits the reference
device and the persona most at risk (the Iskolar Aspirant). It also keeps the compliance surface calm and
exact, which is where both the "no pass/fail" rule and the anxious personas are most sensitive. Option B's
notebook texture can be tried later on the landing page, and on share cards, where it costs nothing in
performance or contrast.

## 8. Phased plan (for Option C)

Each phase ships on its own, behind the existing test suites. Admin and mobile can run in parallel.

| Phase | Mobile | Admin | Exit criteria |
|---|---|---|---|
| **0: Safety (≈1 wk)** | Fix Review→submit, add a submit confirmation with the unanswered count, guard leaving and auto-save the exam; neutral mock-results language, with the compliance test extended to `practice/exam` | Sidebar contrast tokens + `aria-current` + sign-out label; `app/admin/error.tsx`; surface `.error` on pages | Findings M1–M3 and A2 closed; jest and vitest green |
| **1: Primitives** | Add `rgba` alpha tokens plus a lint rule; a `FocusHeader` for the exam; 44pt `QuestionNavigator` inside a Review sheet | `packages/ui`: `DataTable`, `Drawer`, `FormField`, `PageHeader`, `EmptyState`, `ErrorState`, `CountBadge`; a lint rule against `\[#` | Primitives documented in DESIGN.md with measured contrast |
| **2: IA** | 4-tab bar (Today / Practice / Explore / Progress); remove duplicate blocks from Home, Exams and Profile; Updates folds into Explore | Inbox home with queue counts; 5-group sidebar; Data index page; Review Queue gets Edit and Dismiss | Home ≤ 4 sections; sidebar ≤ 6 top-level entries |
| **3: Flow screens** | Exam runner focus mode → Results (peak-end) → Estimator plain-language pass → Onboarding "try 5 questions first" | Migrate tables in order of use: KB/Question bank → Listings → Reports/Feedback → Users → Data tables | Every table uses `DataTable`; the onboarding value moment comes before sign-in on web |
| **4: Moments** | Share cards (progress, deadline), exam-season calendar on Today, Taglish microcopy pass | Keyboard shortcuts (`/` to search, `j`/`k` to move, `e` to edit) | Share entry points shipped (closes the audit P2) |

**First screens:**
- **Mobile:** `app/practice/exam/[slug].tsx`, then `(tabs)/index.tsx`, `(tabs)/practice.tsx`,
  `estimator/index.tsx`.
- **Admin:** `components/admin/SidebarContent.tsx` + a new Inbox page, then `upcat/review-queue`, then
  `ListingTable`.

## 9. DESIGN.md conflicts (DESIGN.md left unchanged)

- DESIGN.md says every text step clears 4.5:1. The admin **sidebar** (`#1d1d1f` with `white/25–35`) is
  not in its tables and fails. It needs its own measured sidebar-ink ramp.
- DESIGN.md sets a 12pt type floor for native. `TabBar.tsx:115` uses 11, and there are 10 other cases.
- DESIGN.md bans raw colour values, yet 162 `rgba()` literals on mobile and 101 hex classes on admin
  remain. The rule needs an **alpha-token** section and lint enforcement to hold.
- DESIGN.md says the mobile app "carries a dark theme". `ThemeContext.tsx:42` falls back to **dark** when
  the system scheme is unknown, while the landing hero calls light "the app's default look". Decide which
  theme is the default.
- Option C adds tokens (sidebar ink, alpha borders and scrims, a tabular-numeral display size) and
  component rules (one primary action per screen). Option B would replace the surface palette and require
  re-measuring every table.
- Brand check to confirm: the landing eyebrow reads "Para sa mga Iskolar ng Bayan"
  (`components/landing/Hero.tsx`). "Iskolar ng Bayan" is strongly associated with UP. Confirm it is
  allowed under the no-UP-branding rule.

## 10. Open questions for the owner

1. **Direction:** A (structural only), B (Kuwaderno notebook world), or C (One Next Step, recommended)?
2. **Mobile tabs:** may the 5 current tabs (Home / Exams / Lists / Updates / Progress) become 4 (Today /
   Practice / Explore / Progress), with Updates folded into Explore? Or is Updates a tab you want to keep?
3. **Mock-exam results:** can "Below cut-off (need Nth)" and the pass/fail colouring go, in favour of
   neutral percentile-range language? Or are course cut-off verdicts a feature you want to keep, with
   different wording?
4. **Onboarding:** can the web build let visitors try questions before signing in? Or is sign-in required
   for data or legal reasons?
5. **Default theme:** light or dark on a first launch with no system preference?
6. **Admin users:** is it only you, or do Review Masters Bicol content staff use the console every day?
   That decides desk density versus a guided layout, and whether keyboard shortcuts are worth building.
7. **Brand:** is maroon plus "Iskolar ng Bayan" copy cleared under the no-UP-branding rule? How may the
   "backed by Review Masters Bicol" claim appear in the app?
8. **Parents:** is a shareable progress or deadline card (Facebook-friendly) in scope for this redesign,
   or later?
9. **Timing:** should Phase 0 ship before the current exam season, ahead of any visual work?
10. **PRODUCT.md:** please confirm or correct every "(inferred — confirm)" line, especially the personas'
    device and data profile, the success signals and the voice rules.

---

*Run notes:*
- **Target:** both surfaces, source-only.
- **Ignore list:** none (`.impeccable/critique/ignore.md` is absent).
- **Assessment independence:** degraded (see the banner at the top).
- **Detector:** ran, 0 findings, a known blind spot for contrast and native.
- **Browser and overlay:** not attempted, because the app could not be run.
- **Snapshot:** not written to `.impeccable/critique/`, because this task allowed edits to two docs only.
  This file is the archive.
