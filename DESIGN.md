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
| `DataTable` | The console's one table. Search (`q`), sort (`sort=-col`), filters, page and hidden columns (`hide=a,b`) live in the **URL**, so a view survives a refresh and can be shared; `paramPrefix` namespaces two tables on one page. Headers are human labels, the header is sticky, and sortable headers are buttons with `aria-sort`. "No data" and "no matches" are different states. `loading` shows skeleton rows. `selection` (controlled ids, `rowLabel`, `actions`) adds labelled row checkboxes, a select-all for the current page, and a bulk bar that appears only while something is selected. `columnChooser` adds a Columns disclosure; one column always stays visible. Rows are plain `<tr>`: the primary action is a real button or link in the first data cell. |
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

## Native tokens (`apps/mobile/theme/tokens.ts`)

Reach them through `useTheme()`; never import `darkTheme` / `lightTheme` directly
in a component.

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  label: { color: t.textSecondary, fontSize: typo.sm },
}), [t, typo])
```

Both theme objects **must** keep identical keys — `Theme = typeof darkTheme`, so a
key missing from `lightTheme` is a type error, and a key missing from `darkTheme`
silently disappears from the type.

Contrast, measured (dark on `#1a1a2e`; light is worst-of `#fdf4f4` / `#ffffff`):

| Token | Dark | Light |
|---|---|---|
| `textPrimary` | 17.06 | 16.75 |
| `textSecondary` | 9.30 | 8.72 |
| `textTertiary` | 5.47 | 5.09 |
| `accentText` | 8.99 | 7.54 |
| `success` | 9.79 | 4.64 |
| `danger` | 6.17 | 5.98 |
| `warning` | 10.22 | 4.64 |

Also: type scale bottoms out at **12** (`typo.xs`) — nothing below that is a
readable body or label size. Spacing is a 4/8 rhythm. Radii pair with
`borderCurve: 'continuous'` except pills.

### Component patterns that resolve tokens correctly

`Badge` and `MatchPill` name **theme keys**, not literals, so they re-theme:

```tsx
const TONES: Record<Tone, { bg: keyof Theme; fg: keyof Theme; border: keyof Theme }> = {
  success: { bg: 'successSurface', fg: 'success', border: 'successSurface' },
}
const c = TONES[tone]
<View style={{ backgroundColor: t[c.bg], borderColor: t[c.border] }}>
```

A module-level constant cannot read the theme. Either take `t` as a parameter
(`confidenceBadgeStyle(level, t)`) or call `useTheme()` inside the component.

---

## Accessibility floor

Non-negotiable on both surfaces.

**Web**
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

**Native**
- Every `Pressable` / `TouchableOpacity` has `accessibilityRole` and, when it has
  no text child, `accessibilityLabel`.
- Toggles use `accessibilityState`: `checkbox` + `checked` for multi-select,
  `radio` + `selected` for single-select. Colour alone never conveys selection.
- Disabled controls announce `accessibilityState={{ disabled }}`.
- Touch targets ≥ 44pt — via `minHeight` on the control, or `hitSlop`.
- Text-entry screens handle the keyboard. `ScreenScroll` sets
  `keyboardShouldPersistTaps="handled"`; without it the first tap on a button is
  consumed dismissing the keyboard and the user has to tap twice.

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
