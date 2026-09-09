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

# Mechanical UI anti-pattern scan (web only)
node <impeccable>/scripts/detect.mjs --json apps/admin/app apps/admin/components
```

A Tailwind class that does not resolve to a token **fails silently** — Tailwind
emits nothing and the element simply has no colour. Grepping the built CSS is the
only way to be sure a new token class landed.

`npx next build` fails at prerender without Supabase credentials in
`apps/admin/.env.local`. `✓ Compiled successfully` plus a clean type check is the
meaningful signal locally.
