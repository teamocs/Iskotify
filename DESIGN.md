# Iskotify Design System

Two surfaces, two implementations, one visual language: **Refined Maroon**.

| Surface | Implementation | Source of truth |
|---|---|---|
| `apps/admin` — admin console + landing page | Tailwind classes | [`packages/ui/tailwind-preset.js`](packages/ui/tailwind-preset.js) |
| `apps/mobile` — Expo React Native app | `StyleSheet` + `useTheme()` | [`apps/mobile/theme/tokens.ts`](apps/mobile/theme/tokens.ts) |

They are deliberately separate files — a Tailwind preset cannot drive React Native
`StyleSheet`, and the mobile app carries a dark theme that the web does not.
Keep the *palette intent* aligned; do not try to merge the files.

---

## The rule that matters

**Never write a raw colour value in a component.** Not `text-[#6e6e73]`, not
`color: '#4ade80'`. Every colour comes from a token.

This is not style preference. Both classes of bug below shipped in this codebase
and were found by the September 2026 accessibility audit:

- `#aeaeb2` was the defined `text-tertiary` token and measured **2.21:1** — a WCAG
  AA failure baked into the system, reproduced across 58 call sites including
  10px table headers.
- Mobile screens hard-coded `#4ade80` / `#f87171` / `#fbbf24`. Those are the
  *dark* theme's values, so they never switched — light mode rendered them at
  **1.54–2.77:1**.

A hard-coded colour cannot re-theme and cannot be audited. A token can be both.

---

## Web tokens (`packages/ui/tailwind-preset.js`)

### Text ramp

Every step clears **4.5:1 on all three backgrounds the system paints on**
(`#ffffff`, `surface-2 #f5f5f7`, `surface-3 #fafafa`), so any step is safe for
small text anywhere without re-checking.

| Class | Hex | white | f5f5f7 | fafafa |
|---|---|---|---|---|
| `text-ink` | `#1d1d1f` | 16.83 | 15.46 | 16.12 |
| `text-ink-muted` | `#55555a` | 7.41 | 6.81 | 7.10 |
| `text-ink-subtle` | `#6e6e73` | 5.07 | 4.66 | 4.86 |
| `text-ink-inverse` | `#ffffff` | — | on maroon: 10.95 | |

**There is deliberately no fourth, lighter step.** Nothing above `#6e6e73` can
reach 4.5:1 on `#f5f5f7`, so a lighter token would be one that is illegal to use
for body copy. De-emphasize with weight, size, or spacing instead.

### Brand and surfaces

`maroon` (`#800000`, 10.95:1 on white) · `maroon-light` (`#a00000`) ·
`maroon-dim` / `maroon-mid` tints · `surface` / `surface-2` / `surface-3` ·
`sidebar` (`#1d1d1f`).

### Status colours — three roles, and picking wrong is a contrast bug

```
DEFAULT   text or icon on a plain surface, and as a fill behind white text
strong    text on that status's own `soft` tint
soft      a tint used as BACKGROUND ONLY
```

`strong` exists because a 10% tint costs roughly 0.2–0.5 of contrast ratio — enough
to drop `success` and `warning` below 4.5:1. Measured worst case across white and
`surface-2`:

| Token | DEFAULT | on plain | `strong` | on own tint | white text on DEFAULT |
|---|---|---|---|---|---|
| `success` | `#15803d` | 4.61 | `#166534` | 5.75 | 5.02 |
| `warning` | `#b45309` | 4.61 | `#92400e` | 5.71 | 5.02 |
| `danger` | `#b91c1c` | 5.94 | `#991b1b` | 6.47 | 6.47 |
| `info` | `#1e40af` | 8.01 | `#1e3a8a` | 8.08 | 8.72 |

```jsx
<span className="bg-success-soft text-success-strong">Active</span>   {/* correct */}
<span className="bg-success-soft text-success">Active</span>          {/* 4.39:1 — fails */}
```

### Type and shape

`font-heading` Outfit · `font-body` Lexend — both self-hosted via `next/font` in
[`apps/admin/app/layout.tsx`](apps/admin/app/layout.tsx), which sets the
`--font-heading` / `--font-body` variables the preset reads. Do **not** add a
`<link>` to fonts.googleapis.com; it re-introduces a render-blocking request.

Radii `sm 10 · md 16 · lg 22 · pill 980` · shadows `sm` and `card`.

### Global floor (`apps/admin/app/globals.css`)

- `:focus-visible` paints a 2px maroon ring on every focusable element for
  keyboard users only. Components may override, never remove.
- `.sr-only` + `focus:not-sr-only` back the skip link in the root layout.
- `prefers-reduced-motion` cuts animation to ~0 but keeps transitions at 120ms,
  so state changes stay perceptible rather than snapping invisibly.

---

## Admin console (`apps/admin`)

The console is a desk tool used every day by Review Masters Bicol content staff.
It is tuned for **density, speed and the keyboard**, in the light theme only.
Maroon marks **one primary action per screen**. Everything else is secondary
or ghost. Built in phases A1 (primitives, sidebar, Inbox home) and A2 (every
page moved onto them).

### Admin tokens (`apps/admin/tailwind.config.ts`, extending the preset)

The ratios below are WCAG contrast values computed from the hex values. For
alpha tokens they are computed after compositing over white.

| Class | Value | Role | Measured |
|---|---|---|---|
| `bg-maroon-hover` | `#660000` | hover and pressed state on maroon fills | white on it 13.42 |
| `bg-surface-hover` | `#f3f3f5` | row hover, ghost-button hover | `ink-subtle` on it 4.58 |
| `bg-neutral-soft` | `rgba(0,0,0,.06)` | neutral badge, skeleton, code chip (background only) | `ink-muted` 6.50 · `ink` 14.77 |
| `bg-maroon-dim` | preset | selected row, bulk-action bar | `ink` 14.40 · `ink-muted` 6.34 · `maroon` 9.37 |
| `bg-scrim` | `rgba(0,0,0,.40)` | backdrop behind a Dialog or Drawer | none |
| `border-subtle` | `rgba(0,0,0,.08)` | hairlines between rows and around cards (decorative) | none |
| `border-strong` | `rgba(0,0,0,.16)` | edge of a secondary button | none |
| `border-control` | `#8a8a8e` | boundary of a form control | 3.44 on white, 3.16 on `surface-2` (meets the 1.4.11 3:1 minimum) |
| `text-ui` | 13px / 20px | dense UI text: tables, nav, secondary buttons | 12px (`text-xs`) is the floor |
| `shadow-overlay` | two-layer | floating layers only (Dialog, Drawer) | Cards use a border, not a shadow |
| `sidebar-ink` / `sidebar-ink-muted` | `#f5f5f7` / `#a1a1a6` | text on the dark sidebar `#1d1d1f` | 15.46 / 6.54 on the background, 10.42 / 5.42 on active or hover |

### Primitives (`apps/admin/components/ui`)

| Primitive | Contract |
|---|---|
| `Topbar` (`components/admin`) | Holds the page's **only** `h1`. Page actions go on the right. A page never repeats its title as an `h1` or `h2` in the body. |
| `PageBody` | The scrolling area under the Topbar. Standard gutter. `intro` takes one orienting sentence, not a heading. `width` is `full`, `wide` or `narrow`. |
| `Card` | A bordered region. Given a `title` it becomes a labelled `<section>` with an `h2` (or an `h3`). Use `flush` for full-bleed tables. Never nest cards. |
| `Button` / `IconButton` / `buttonClass` | Variants `primary`, `secondary`, `ghost` and `danger`. `loading` announces the busy state and keeps the label. `IconButton` requires a `label`, which becomes its accessible name and tooltip. |
| `Badge` | The text carries the status and the tone only reinforces it. Tones: `neutral`, `success`, `warning`, `danger`, `info`, `brand`. |
| `Field` + `controlClass` | Render-prop. Ties label↔control with `htmlFor`/`id`, and hint and error with `aria-describedby`. An error sets `aria-invalid` and `role="alert"` and sits **next to its field**. `required` sets the attribute and adds an `aria-hidden` `*`. |
| `Dialog` / `Drawer` | Modal contract: labelled, `aria-modal`, focus moved in, trapped and restored, Escape and the scrim close it. `onSubmit` turns the panel into a real `<form noValidate>`, so Enter submits and a `type="submit"` footer button is the submit; the default action is prevented. `dirty` makes every close path (Escape, scrim, ✕, and the guarded `close` passed to a `footer={close => …}` function) ask **"Discard unsaved changes?"** first, with Keep editing focused. It also arms the browser's leave-page prompt. |
| `DiscardChangesDialog`, `closeOrConfirm` | The same guard for full-page forms (for example Cancel on the new-flashcard page). |
| `ConfirmDialog` (`components/admin`) | Destructive yes/no, built on `Dialog` as an `alertdialog`. Cancel is focused first. |
| `DataTable` | The console's one table. Search (`q`), sort (`sort=-col`), filters, page and hidden columns (`hide=a,b`) live in the **URL**, so a view survives a refresh and can be shared; `paramPrefix` namespaces two tables on one page. Headers are human labels, the header is sticky, and sortable headers are buttons with `aria-sort`. "No data" and "no matches" are different states. `loading` shows skeleton rows. `selection` (controlled ids, `rowLabel`, `actions`) adds labelled row checkboxes, a select-all for the current page, and a bulk bar that appears only while something is selected. `columnChooser` adds a Columns disclosure; one column always stays visible. Rows are plain `<tr>`: the primary action is a real button or link in the first data cell. Toolbar: search, filters as chips (native `<select>`, with per-option counts on client tables), removable active-filter pills with **Clear all**, Columns, and a Comfortable/Compact density toggle persisted console-wide in `localStorage`. The select-all is indeterminate on a partial page; the bulk bar floats (sticky to the bottom of the view) with "N selected", the actions and **Clear selection**; `announcement` is an always-present live region. Footer: "26–50 of 312", rows per page (`size=`, client tables only; server tables keep their fixed page) and first/previous/next/last. `error` + `onRetry` replace the rows with an `ErrorBanner` and keep the toolbar. `numeric` right-aligns a column in tabular figures; `truncate` clamps to one line with the full text as its title; `hideOnMobile` drops a column below 768px. The first data column (and the checkbox) is pinned while the table scrolls sideways inside its focusable region. Rows are memoised: selecting a row re-renders that row only, provided the caller memoises `columns`. Wrap a table in `TABLE_FRAME` (no overflow clipping, so the bulk bar can stick). |
| `Table` primitives / `RowActions` | `TableRegion`, `Table`, `THead`, `Th`, `Td`, `Tr` (in `Table.tsx`) are what `DataTable` is built from; tables that cannot be a `DataTable` (the question-bank editor grid, the guide's column references, a topic's cards) use them directly. `RowActions` is the row's overflow menu (WAI-ARIA menu button: arrows, Home/End, Escape returns focus). The one frequent action stays inline (Resolve, Approve, Dismiss, Publish); secondary and destructive ones go in the menu, danger last. Give an item a `name` ("Delete Scholar A") when the row must be named. |
| `EmptyState` / `ErrorBanner` | An empty state says what belongs here and how it gets here. A failed query renders `ErrorBanner` (`role="alert"`), **never** an empty list. |
| `Icon` / `Kbd` | One inline icon set: 24-unit grid, 1.75 stroke, `currentColor`, decorative by default. No emoji or Unicode glyphs as icons. The one exception is the ✓ glyph that marks a correct answer next to its colour, backed by screen-reader text. |
| `useFocusTrap` + `trapStack` | Overlays can stack (a Drawer with a discard prompt on top). Only the topmost trap reacts to Escape and Tab. |

### Page rules

- Every route under `app/admin` renders `Topbar` (the `h1`), then `PageBody`, then
  `Card` sections or a `DataTable`.
- `app/admin/error.tsx` is the route error boundary. It names the failure, offers
  **Try again** (`reset`) and **Back to Home**, and shows the error digest as a
  reference.
- Bulk status changes (reported questions, bug reports, feedback) call the same
  per-item route for each selected id. They report one summary toast, name any
  partial failures, clear the selection and call `router.refresh()`.

### Enforcement

`apps/admin/lib/__tests__/noRawColours.test.ts` scans `app/admin/**` and
`components/{admin,ui,flashcards}/**`. It fails on arbitrary colour classes
(`-[#…]`), on raw `#rrggbb`/`#rgb` inside string literals, and on the stock
`gray-*`, `slate-*` and `purple-*` palettes. Exceptions go in its `ALLOWED` list
with a reason, and an entry that no longer matches anything fails as well. The
landing page (`components/landing`) and the email template (`lib/email`) are out
of scope.

---

## Mobile Design System (`apps/mobile`)

The mobile app runs on phones (native), tablets (native and web), and the web build. The design system lives in `apps/mobile/theme/tokens.ts` and is consumed through `useTheme()` — never import `darkTheme` / `lightTheme` directly.

### Tokens: colours and typography

Reach tokens through `useTheme()`:

```tsx
const { theme: t } = useTheme()
const s = useMemo(() => StyleSheet.create({
  label: { color: t.textSecondary, ...textStyle('bodySm', t.textSecondary) },
}), [t])
```

Both theme objects **must** keep identical keys — `Theme = typeof darkTheme`, so a
key missing from `lightTheme` is a type error, and a key missing from `darkTheme`
silently disappears from the type.

#### Colour roles

**Text layers** (measured WCAG contrast, dark on `#1a1a2e`; light is worst-of `#fdf4f4` / `#ffffff`):

| Role | Dark | Light | Usage |
|---|---|---|---|
| `textPrimary` | 17.06 | 16.75 | Primary body text, labels |
| `textSecondary` | 9.30 | 8.72 | Secondary text, hints, muted labels |
| `textTertiary` | 5.47 | 5.09 | Disabled, very subtle text |
| `textInverse` | — | — | Text/icons on maroon fills (44pt+ targets use `accentText` instead) |

**Surfaces and backgrounds**:
- `bg` — page background (`#1a1a2e` dark, `#fdf4f4` light, warm maroon tint)
- `surface` / `surface2` — cards, raised panels, interactive states
- `surfaceRaised` — modal sheets/dialogs (darker opaque composite)
- `surfaceSubtle` — skeleton loaders, dividers
- `border` — card and control edges
- `inputBorder` — form-control boundary (text fields, pickers), non-text 3:1: dark 5.06 bg · 4.04 surface · 3.30 surface2; light 3.48 bg · 3.76 surface · 3.09 surface2

**Brand and status** — named by function, not colour:
- `accent` + `accentText` — primary interactive elements (maroon `#800000`)
- `accentSurface` — soft background tint (10% opacity)
- `accentStrong` — opaque maroon for filled pills, badges, active tabs
- `accentBorder` — accent control borders (meets 3:1 non-text contrast on both surfaces)
- `accentPressed` — hover/pressed fill (`#5c0000`)
- `success` / `successSurface` / `successStrong` + `successBorder` — status colours, measured for readability
- `danger` / `dangerSurface` / `dangerStrong` + `dangerBorder`
- `warning` / `warningSurface` / `warningStrong` + `warningBorder`

**Elevation**: `shadowSm` (1px 3px, soft) and `shadowMd` (deeper, cards). Dark theme uses deeper black; light theme uses warm maroon tint.

**Scrim** (full-screen overlay dimming, media viewer): `scrim` (dark in both themes) and `scrimControl` (icons on the scrim).

**Theme selection rule** (`resolveColorScheme.ts`): explicit user choice (`light` / `dark` in Settings) always wins; `system` (the default) follows the OS; when the OS reports nothing, **fall back to light** (the owner's 2026-09 directive for first launch).

#### Type roles and the `textStyle()` helper

Type scale bottoms out at **12pt** (`xs`) — nothing below that is readable.

| Role | Size | Font | Line height | Use case |
|---|---|---|---|---|
| `display` | 48 | Heading Bold | 54 | Largest hero text (rare) |
| `title` | 26 | Heading Bold | 32 | Section titles |
| `headline` | 20 | Heading Bold | 26 | Card titles, list headers |
| `titleSm` | 17 | Heading SemiBold | 22 | Small card titles |
| `body` | 16 | Body Regular | 24 | Primary reading text |
| `bodySm` | 13 | Body Regular | 19 | Secondary text, descriptions |
| `label` | 13 | Body SemiBold | 18 | Form labels, button-adjacent text |
| `button` | 16 | Heading Bold | 20 | Button labels |
| `caption` | 12 | Body Regular | 16 | Badges, hints, metadata |
| `numeric` | 22 | Heading Bold | 28 | Tabular numbers (scores, counters) |
| `numericLg` | 36 | Heading Bold | 42 | Large tabular numbers (exams, times) |

Use via `textStyle(role)` or `textStyle(role, color)` to get a TextStyle with optional colour:

```tsx
<Text style={textStyle('body', t.textPrimary)} numberOfLines={1}>
  Your primary text
</Text>
```

Font families: `Outfit` (headings, numbers); `Lexend` (body, labels) — loaded via `expo-font` in `app/_layout.tsx`.

#### Spacing and radius

**4/8 spacing rhythm** (all in pt):

| Token | Value | Usage |
|---|---|---|
| `xs` | 4 | Tight gaps (icon + text) |
| `sm` | 8 | Default gap between elements |
| `md` | 12 | Medium padding inside components |
| `lg` | 16 | Card padding, small gutter |
| `xl` | 20 | Section spacing |
| `xxl` | 24 | Large sections, between folds |
| `xxxl` | 32 | Full-height spacing, layout gaps |

**Radii** (pair with `borderCurve: 'continuous'` except pills):

| Token | Value | Usage |
|---|---|---|
| `sm` | 10 | Small elements |
| `md` | 14 | Chips, badges |
| `lg` | 18 | Buttons, cards |
| `xl` | 22 | Sheets, dialogs |
| `xxl` | 28 | Large surfaces |
| `pill` | 999 | Fully rounded (buttons, pills, badges) |

### Responsive layout

Three window-size breakpoints (Material 3):
- **compact** < 600 (phones, portrait tablets)
- **medium** 600–1023 (landscape tablets)
- **expanded** ≥ 1024 (desktop web, landscape large tablets)

Use `useBreakpoint()` to get the current class; `breakpointForWidth(width)` for pure mapping.

#### Layout dimensions

**Gutters** (horizontal page padding, responsive):
- compact: 16 (spacing.lg)
- medium: 24 (spacing.xxl)
- expanded: 32 (spacing.xxxl)

**Content max-widths**:
- `reading` — 720 (single-column, readable prose measure)
- `wide` — 1040 (two-column dashboards, grid-heavy screens)

**Tab bar**: 64pt height + device bottom safe-area inset. Screens using tabs reserve `layout.tabBarClearance` (80pt = 64 + 16 gap).

#### Layout primitives

| Component | Purpose | Breakpoint handling |
|---|---|---|
| `<Screen>` | Safe area + themed ground + responsive gutter + centered content column (non-scrolling) | Accepts `width="reading"` or `"wide"` |
| `<ScreenScroll>` | Scrolling variant; wraps children at a max-width on web medium/expanded | Same width control; handles tab bar clearance |
| `<TwoColumn primary secondary>` | Side-by-side on expanded (3:2 flex ratio); stacked on compact/medium | Uses `columnCount(bp)` to decide layout |

Example responsive screen:

```tsx
<Screen width="wide" tabBarInset>
  <TwoColumn
    primary={<PrimaryPanel />}
    secondary={<SecondaryPanel />}
  />
</Screen>
```

### Primitives catalogue

| Component | Purpose | Accessibility |
|---|---|---|
| `Button` | Maroon fill (primary, ONE per screen), outlined (secondary), text-only (ghost), danger tint. Sizes sm/md/lg all ≥ 44pt. | `accessibilityRole="button"`, `accessibilityLabel`, `aria-disabled` |
| `PillButton` | Inline, rounded, compact action (wraps `Button` with `shape="pill"`). | Same as Button |
| `Card` | Bordered surface with optional elevation. Optionally pressable. | `accessibilityRole="button"` if `onPress`, optional `accessibilityLabel` |
| `Badge` | Small pill tag for status/tone. Tone names theme keys: `accent`, `neutral`, `success`, `warning`, `danger`. Label required. | Decorative or status label |
| `Chip` | Static tag (non-interactive); `FilterChip` is an interactive toggle with radio/checkbox semantics. | `FilterChip` uses `aria-checked` / `aria-selected` (not `accessibilityState`) |
| `Avatar` | Initials in maroon circle (6.19:1 light, 8.81:1 dark). Pressable version ≥ 44pt. Fallback to user icon. | Decorative circle via `decorative` helper; optional pressable label |
| `ProgressBar` | Linear progress (0–1). | `accessibilityRole="progressbar"`, `accessibilityValue` |
| `ProgressRing` | Circular progress (score rings, countdown circles). | Same as ProgressBar |
| `ListRow` | Compact list item with optional leading icon, two text lines, optional trailing. | Pressable with `accessibilityRole="button"` if interactive |
| `ListCard` | Broader list card, tappable. Used in lists and grids. | `accessibilityRole="button"`, `accessibilityLabel` |
| `SectionHeader` | Section title with optional trailing action. | `role="heading"` via `<Text accessibilityRole="header">` |
| `Sheet` | Modal panel with backdrop. Swipeable on native; focus-trapped on web. | `role="dialog"`, `aria-modal="true"`, `aria-label` |
| `EmptyState` / `ErrorState` / `LoadingState` | Feedback states when lists are empty, errors occur, or data is loading. | Clear messaging; `LoadingState` avoids announcing a loading spinner repeatedly |
| `InfoBanner` | Top-of-screen alert/notification. | `role="alert"` if notifying of an error or state change |

### Navigation

Four top-level destinations (redesign M2, direction C, 2026-09):
- **Today** — daily plan, entrance exam focus, next step
- **Practice** — mocks, drills, due cards, estimator
- **Explore** — schools, exams, scholarships, courses, news & dates
- **Progress** — readiness analytics, trends, per-subject accuracy

Each lives at a route: `/`, `/practice`, `/explore`, `/progress`.

**Bottom tab bar** (phones/compact tablets): four tabs with icons and labels, always visible. Current tab's icon fills with maroon.

**Sidebar** (expanded web ≥ 1024): persistent left sidebar with four destination links (aria-current="page" on the active one), Profile at the bottom (avatar + name, pressable to open profile detail), Settings link.

**Profile access**: avatar in every tab header opens profile detail view. On web sidebar, Profile is a destination link at the bottom.

**Legacy route redirects** (deep links, notifications): `listings` → Explore, `updates` → Explore, `analytics` → Progress.

### Accessibility rules — mobile-specific

The system enforces these at every layer:

**Touch targets**: 44pt minimum (`minHeight: 44` on pressables, or `hitSlop` for icons). Buttons and all controls meet this.

**Font scaling**: `maxFontSizeMultiplier={2}` on user-facing text (body copy, labels, badge text), capping at 2x for accessibility users who set large fonts. Navigation and dense UI may use 1.4x.

**Keyboard focus** (web only): react-native-web's `Pressable` reports `focused` in the style function. The `focusRing(color, focused)` helper from `a11y.ts` returns a 2pt outline only when focused **and** the last input was a keyboard (tracked via `keyboardModality` state) — not on mouse clicks (the `:focus-visible` heuristic).

**aria-* attributes instead of accessibilityState**: react-native-web 0.21 ignores the `accessibilityState` prop, so use:
- `aria-checked` for checkboxes (e.g., `<Pressable aria-checked={selected} />`)
- `aria-selected` for radios and grid cells
- `aria-expanded` for collapsibles
- `aria-disabled` for locked/disabled controls

**Decorative content**: use the `decorative` helper (spreads `importantForAccessibility: 'no-hide-descendants'`, `accessibilityElementsHidden: true`, `aria-hidden: true`) on purely visual wrappers (initials circles, icons, dividers, backdrops).

**Reduced motion**: `useReducedMotion()` returns true when the OS asks for it. Components swap animations for static states or instant cuts (e.g., a pulse becomes a static ring; a slide fades instantly).

**Accessibility state labels**: never rely on colour alone. Selections and toggles carry `aria-checked` / `aria-selected`; status badges include a text label.

### One Next Step — UX principle

Every screen shows **one primary maroon action** per screen (the "next step"). This is the student's most important action right now.

Secondary actions use `secondary` or `ghost` variants. If multiple destructive actions exist, use the `danger` variant for the most likely one.

Status scores (progress, accuracy, rankings) use **neutral colours** (`surface` / `textSecondary`) — never status colours (green/red). Scores are facts, not judgments. Verdict colours (success/danger/warning) are reserved for actionable feedback (e.g., "Question flagged", "Retry available").

### Guard tests

One guard per redesigned area:
- `apps/mobile/app/(tabs)/__tests__/m2DesignTokens.test.ts` — Today, Progress, Profile
- `apps/mobile/components/explore/__tests__/designLint.test.ts` — Explore, listings, schools, career
- `apps/mobile/components/practice/__tests__/practiceAreaTokens.test.ts` — Practice, exam runner, results, notes, estimator

Each enforces the same rules on the files it scans:
- No raw hex colours (`#rrggbb`) or `rgba()` literals — all colours from `useTheme()` tokens
- No hand-set `fontSize` — all type from `textStyle(role)` roles
- No uppercase via `.toUpperCase()` or CSS `text-transform: uppercase` (sentence case only)
- No emoji or Unicode icon glyphs (›, ‹, ▲, ▼, ✕, ✓, ＋, ↪, ⚠) — use Lineicons only

A new screen joins the guard for its area (or gets its own) when it is redesigned.

---

## Accessibility floor

Non-negotiable on both surfaces. Mobile-specific rules are in the Mobile Design System section above (touch targets, keyboard focus, aria-* attributes, decorative helper, reduced motion).

**Web (admin console)**
- Every form control has an accessible name: a `<label htmlFor>` paired with a
  matching `id`, or an `aria-label` that repeats the visible label text verbatim
  (WCAG 2.5.3 — the accessible name must contain the visible one).
- A placeholder is **not** a name.
- Required fields carry the `required` attribute; the visual `*` is
  `aria-hidden="true"` so a screen reader does not read "asterisk".
- Errors use `role="alert"` and are wired with `aria-describedby` + `aria-invalid`.
- Overlays that hide content use `inert` while closed. `opacity-0` and
  `pointer-events-none` leave everything inside in the tab order.
- Modal panels: `role="dialog"`, `aria-modal="true"`, a name, focus moved in on
  open, focus restored on close, Escape to dismiss, and Tab trapped inside.
- Decorative illustrations are `aria-hidden="true"`. The landing hero's phone
  mockup is the reference case — ~40 text fragments that are a picture of the app,
  not content.

**Mobile (apps/mobile)**
See the Mobile Design System section for touch targets (44pt minimum), keyboard focus rings (web only, tracked via input modality), aria-* attributes (checked/selected/expanded/disabled, not accessibilityState), the `decorative` helper, and `useReducedMotion()` support.

---

## Verifying a change

```bash
# Web: types, then confirm the classes you used actually compiled.
cd apps/admin && npx tsc --noEmit && npx next build
grep -o '\.text-ink-subtle{[^}]*}' .next/static/css/*.css

# Native
cd apps/mobile && npx tsc --noEmit && npx jest

# Mechanical UI anti-pattern scan (web only; native has no equivalent).
# Impeccable >= 4.3 ships a compiled binary and no longer has scripts/detect.mjs.
# Findings print to stderr; stdout carries --json.
~/.agents/skills/impeccable/scripts/impeccable detect apps/admin/app apps/admin/components
```

A Tailwind class that does not resolve to a token **fails silently** — Tailwind
emits nothing and the element simply has no colour. Grepping the built CSS is the
only way to be sure a new token class landed.

The detector checks anti-patterns (dated easing, overused fonts, and similar). It
does **not** check contrast — it read `#aeaeb2` on white without complaint. A clean
detector run says nothing about whether a colour is legible; compute the ratio.

`npx next build` fails at prerender without Supabase credentials in
`apps/admin/.env.local`. `✓ Compiled successfully` plus a clean type check is the
meaningful signal locally.
