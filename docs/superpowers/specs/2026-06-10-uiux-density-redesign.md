# UI/UX Density Redesign — Design Spec (approved 2026-06-10)

Goal: student-friendly screens — ONE job above the fold per screen, progressive disclosure for everything else. Grounded in the verified deep-research findings (NN/g cognitive-load + progressive disclosure, card-vs-list rule, chunking, WCAG 2.2 AA floors) and the per-screen density audit. NO trend-driven restyling (2026-trend claims failed verification) — this is a hierarchy/disclosure redesign on the EXISTING Refined Maroon token system and ui primitives.

## Verified principles applied (citable)
1. Eliminate extraneous load: remove duplicate CTAs / redundant info blocks (NN/g minimize-cognitive-load, duplicate-links).
2. Progressive disclosure: few most important blocks first; secondary behind taps/expanders; do NOT hide daily-use actions/metrics (NN/g progressive-disclosure; IxDF).
3. Lists for homogeneous scannable content; cards only for heterogeneous dashboard groupings (NN/g card-vs-list).
4. Chunking: tight intra-group spacing, larger inter-section spacing (NN/g 4-principles; tokens already support).
5. Overview-first analytics; drill-down on demand; keep streak/accuracy surfaced (IxDF/Shneiderman).
6. A11y floors: touch targets ≥44pt working standard (24pt WCAG hard floor), text contrast 4.5:1, font scaling must survive 200% — keep allowFontScaling, add `maxFontSizeMultiplier={1.4}` on dense chips/stat numbers/tab labels, no fixed-height text containers (WCAG 2.2 / RN docs).
7. NEVER pre-fill/surface prior answers during active practice (testing effect).

## Patterns (reused components)
- **Top-N + See all**: render first 3 rows of a list section + a SectionHeader trailing "See all (n)" that expands inline (state toggle). No new screens.
- **Collapsed card**: one-line summary row (icon + truncated text + chevron) that expands to the full card on tap.
- **Inline expand only** — disclosure depth stays shallow (1 level).
- All styling via existing tokens + ui primitives (Card, ListCard, SectionHeader, Badge, SplitStatCard, InfoBanner, SubjectAccordion). StyleSheet only.

## Per-screen redesign

### Wave 1a — Home (`app/(tabs)/index.tsx`)
New order: (1) greeting header (unchanged); (2) **"Continue studying" primary CTA** (the existing Quick Practice button, promoted); (3) stats card (days left / accuracy / streak — unchanged); (4) **Kuya coach collapsed** to a one-line row (mini mascot + truncated tip + chevron) → expands inline to the full card with Ask button; (5) calendar strip (unchanged position relative to dates content); (6) Weak Areas **top 3 + See all**; (7) Upcoming Dates **top 3 + See all**; (8) Missing Requirements + My Progress **merged into one 2-column compact row**; (9) **UPCAT countdown banner REMOVED** (duplicate of stats days-left + upcoming dates — verified duplicate-content rule).

### Wave 1b — Review (`app/(tabs)/practice.tsx`)
New order: (1) header + stats (unchanged); (2) subject filter chips (unchanged); (3) **Recommended rail** (core "what next"); (4) **Subjects accordion** (the core list — promoted from bottom); (5) Focus rail; (6) Saved Decks ONLY when non-empty (placeholder removed; create stays via header + button); (7) **AI Study Feedback collapsed** to a 2-line summary row → expands inline; (8) **Quick-link shortcuts (UPCAT mock / GWA / Career) collapsed** into one "Study tools" row → expands inline to the 3 links; (9) AI engine banner unchanged (download state matters).

### Wave 2 — Exams list + Listing detail
- Exams (`app/(tabs)/listings.tsx`): card → **dense list rows** (icon, title, ONE date line, ≤2 badges max: type/region OR match — drop verified/mock/course chips from the row; they live on detail). Search + segment unchanged. Recommended section stays.
- Listing detail (`app/listings/[slug].tsx`): above fold = hero + countdown + Key Dates + primary CTA (Add to Focus / Take Mock). **About, Scholarship Details, Benefits collapse** to section headers with preview line → expand inline. Requirements checklist stays (already disclosure-correct). Match block: pill + top-2 reasons, rest behind "More".

### Wave 3 — Analytics + Results + Career detail
- AnalyticsDashboard: keep filter tabs + 4 stat cards (daily metrics stay surfaced); **weekly chart + Subject Mastery default-collapsed accordions**; Recent Sessions top 3 + Load more.
- Exam results (`app/practice/exam/[slug].tsx`): review list **grouped per section, collapsed by default, wrong-answers-first** within a section; score/band/per-section/cut-offs unchanged.
- Career detail (`app/career/[courseId].tsx`): destination cards show country+salary+demand; meta chips/specializations behind "Details" expand; Programs top 1 + See all.

### Cross-cutting (each wave applies to its screens)
- `maxFontSizeMultiplier={1.4}` on Badge, chip labels, stat numbers, tab labels (dense, layout-sensitive); body text keeps full scaling.
- hitSlop to ≥44pt on small icon buttons touched in passing.
- No new colors/fonts; spacing per chunking rule (intra-group sm/8, inter-section xl/24+).

## Shipping rule
Screen-by-screen waves (1a+1b together), each: jest + tsc + react-doctor (fix new bug-level only) → OTA → **user on-device verification before the next wave**. JS-only, no app.json bump. No blind batch retrofits.
