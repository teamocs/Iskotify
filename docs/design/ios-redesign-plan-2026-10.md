# Iskotify iOS-language redesign: implementation plan (2026-10)

The design source is the canvas at https://claude.ai/artifact/KgbdzhzMm4fSchSeyUMB28. Every colour token hex is retained, and the product stays light-only.
Approved by the owner on 2026-10-12. iOS uses NativeTabs. **Android and web use the custom floating capsule bar.**

## 0. Repo facts that shape the plan

| Package | Installed | Note |
|---|---|---|
| expo | 54.0.35 | SDK 54, RN 0.81.5, React 19.1 |
| expo-router | 6.0.24 | NativeTabs is at `expo-router/unstable-native-tabs`. It supports `minimizeBehavior`, `role:'search'` and has a web fallback. |
| expo-blur | 15.0.8 | **No `BlurTargetView` and no `blurMethod: 'dimezisBlurViewSdk31Plus'`.** It only has `experimentalBlurMethod: 'none' \| 'dimezisBlurView'`. |
| react-native-reanimated / worklets | 4.1.7 / 0.5.1 | Installed. There is no jest mock yet. |
| react-native-screens | 4.16.0 | Supports `formSheet` and `sheetAllowedDetents`. The root Stack is already native. |
| expo-glass-effect, expo-haptics, expo-symbols, expo-linear-gradient | not installed | |
| @expo-google-fonts/outfit, /lexend | installed | Removed in P1b. |

`eas.json` pins no iOS image. Liquid Glass needs an Xcode 26 build image.

**Open decision: P0, upgrade to SDK 55.**
- The approved Android glass tier needs it.
- The NativeTabs child API also changes between router 6 and 55.
- The upgrade forces a store build.
- If it is deferred, P1 ships Android blur with `experimentalBlurMethod="dimezisBlurView"` behind the same `<Glass>` API, and P0 later only touches `Glass.android.tsx`.

**Defaults (not blocking):**
- iOS below 26 also uses NativeTabs (classic bar).
- Desktop web at 1024px and up keeps `SidebarNav` and adds a Search row. The capsule appears on compact and medium web only.
- A new `app/(tabs)/search.tsx` provides federated search over schools, scholarships and listings using the existing hooks.

## 1. Effort inventory (`apps/mobile`, tests excluded)

| Item | Count |
|---|---|
| `fonts.*` | 43 in 20 files |
| Literal `Outfit_`/`Lexend_` names | 93 in 15 files |
| `textStyle(` calls | 467 in 110 files (bodySm 133, body 82, titleSm 75, label 62, caption 48, headline 23, title 22, numeric 7, display 2, button 1) |
| Direct `typography.`/`typo.` | 115 in ~24 files |
| Numeric `fontSize` | 8 files |
| `fontWeight` | 17 files |
| `maxFontSizeMultiplier` | 483 |
| `radius.*` | 224 in 90 files (sm 25, md 42, lg 45, xl 36, xxl 13, pill 63) |
| Numeric `height:` (Dynamic Type risk) | 80 |
| `TabBar` | 5 files |
| `TabHeader` | 3 tab screens + Screen.tsx |
| Sheet / `<Modal>` | 8 / 14 files |
| ListRow / Card / Button / Chip | 19 / 26 / 50 / 9 files |
| Routes / components | 58 / 116 |
| Admin `font-heading` / `font-body` | 59 uses in 34 files / 86 uses in 23 files |
| Admin `rounded-sm` | 76 |

The radius keys already match the new scale (md 14, lg 18, xl 22, xxl 28, pill). Only `radius.sm` splits into chip 8 and field 12. Role aliases mean the 467 `textStyle` calls switch with no edits. The real hand edits are `fonts.*` (43), literal font names (93) and `typo.*` (115).

## P0: SDK 55 upgrade (standalone, recommended)

- **Steps:** `npx expo install expo@^55 --fix`, then `expo-doctor`. Pin an Xcode 26 image in `eas.json`.
- **Files:** `package.json`, the lockfile, `eas.json`, `app.json`.
- **Tests:** `tsc` and `jest` green; `easConfig`/`expoConfig` tests plus an iOS image assertion.
- **Risks:** native modules (purchases, keyboard-controller, posthog, sqlite); Reanimated changes; the OTA runtime requires a store build.
- **Acceptance:** boots unchanged on iOS 18, iOS 26, Android 10, Android 14 and web.

## P1: Foundations

### P1a: Tokens and capability layer (additive)

**New dependencies** (via `npx expo install`): `expo-glass-effect`, `expo-haptics`, `expo-symbols`, `expo-linear-gradient`.

**`theme/tokens.ts` additions:**
- iOS text roles, each with `fontWeight` and `fontFamily: systemFont` (undefined on native, the system stack on web):
  - largeTitle 34/41 700
  - title1 28/34 700
  - title2 22/28 700
  - title3 20/25 600
  - headline 17/22 600
  - body 17/22
  - callout 16/21
  - subheadline 15/20
  - footnote 13/18
  - caption 12/16
  - numeric and numericLg, with tabular-nums
- Typography scale: {12, 13, 15, 16, 17, 20, 22, 28, 34}.
- Radius: chip 8, field 12, button 14, group 18, card 22, sheet 28, capsule 999. Old keys stay as aliases.
- Motion:
  - spring.snappy {damping 30, stiffness 400}
  - spring.smooth {26, 260}
  - spring.bouncy {14, 220}
  - web curves `cubic-bezier(.2,.9,.25,1)` 280 and `cubic-bezier(.32,.72,0,1)` 480
  - fade 200, reduced 160, pressScale 0.97
- Glass: the web recipe plus the opaque fallback `#fdf4f4`.
- Layout: tabCapsule {62, inset 16, bottom 26}, searchCircle 62, headerButton {40 visual, 44 hit}, row min 44, iconTile 30, tabBarClearance 104 plus safe area.

**`ThemeContext`:** exposes `motion` and `glass`.

**New files:**
- `hooks/usePlatformCapabilities.ts` returns `{ liquidGlass, blurTier: 'liquid'|'blur'|'android-blur'|'opaque'|'css', reduceTransparency, reduceMotion }`, cached at module level.
- `components/ui/Glass.tsx`, with `.ios`, `.android` and `.web` implementations:
  - iOS: GlassView if `isLiquidGlassAvailable() && isGlassEffectAPIAvailable()`, otherwise BlurView `systemChromeMaterialLight`.
  - Android: blur on API 31+ only, otherwise opaque.
  - Web: CSS recipe with an `@supports` fallback.
  - Reduce Transparency forces opaque everywhere.
  - Never used inside list cells; on Android, render after dynamic content.
- `components/ui/Text.tsx`: `<Text role>` with `dynamicTypeRamp` on iOS and a default `maxFontSizeMultiplier` (2 for content, 1.4 for chrome).
- `components/ui/Pressable.tsx`: `PressableScale`, 0.97 with `spring.snappy`, opacity only under Reduce Motion.
- `lib/haptics.ts`: `selection()`, a no-op on web, never throws.
- `jest.setup.ts`: Reanimated and worklets mocks, plus `__mocks__` for glass-effect, blur, haptics and linear-gradient.

**Tests:**
- `tokens.test.ts`:
  - iOS roles plus aliases; the 12 floor, line-height and tracking checks stay.
  - Replace the font-family test: `undefined` on native, system stack on web.
  - Exact radius and motion values.
  - Glass-label contrast: the 0.42 white fill composited over bg, surface and accent must give ≥4.5:1 for textPrimary and accentText.
- `Glass.test.tsx`: tier matrix (iOS 26, iOS 18, Android 31, Android 30, Reduce Transparency, web).
- `usePlatformCapabilities.test.ts`.
- `lightOnly.test.ts`: forbid dark tints and materials.

**Acceptance:** no visual change. `tsc` and `jest` green. A `__DEV__` route `app/__dev/glass.tsx` shows every tier.

### P1b: System font cut-over

**Alias the old roles** in `tokens.ts`:

| Old | New |
|---|---|
| display | largeTitle |
| title | title1 |
| headline | title3 |
| titleSm | headline |
| body | body |
| bodySm | footnote |
| label | footnote 600 |
| button | headline |
| caption | caption |
| numeric | title2, tabular |
| numericLg | largeTitle, tabular |

**Changes:**
- Delete `fonts`. A temporary `weight()` helper replaces the 43 `fonts.*` sites.
- `app/_layout.tsx`: drop `useFonts`; the `fontsReady` gate becomes `true`.
- Remove the `@expo-google-fonts` packages.
- `+html.tsx`: system font stack.
- Hand-fix the 93 literal font names.

**Tests:**
- New `__tests__/noBrandFonts.test.ts`: no Outfit, Lexend, `@expo-google-fonts`, `fonts.` or `useFonts`.
- Update the tests that assert font names.

**Risks:**
- Body moves from 16/24 to 17/22, which shifts layouts. Audit the 80 fixed `height:` sites.
- On Android below API 28, weight 600 renders as bold.

**Acceptance:**
- No Outfit or Lexend outside tests.
- Faster cold start.
- No clipping at iOS AX3 or Android font scale 2.0 on the 4 tabs.

### P1c: Radius and press

- Split `radius.sm` (25 sites) into chip and field.
- Add a test that `components/ui` radii use `borderCurve: 'continuous'`.

## P2: Navigation shell

### P2a: Route hygiene and search

- Move `(tabs)/profile` to `app/profile/index.tsx`, presented as a formSheet on native and a push on web.
- Move `listings`, `updates` and `analytics` to root-level redirects with the same URLs.
- Add `app/(tabs)/search.tsx` and `SEARCH_DESTINATION`. `TAB_DESTINATIONS` stays 4.
- **Tests:** redirects, vercelRoutes, profile, and a new search test covering empty, no-match and offline states.
- **Risk:** deep links and notification payloads that point to `/(tabs)/profile`.

### P2b: iOS NativeTabs

`app/(tabs)/_layout.ios.tsx`:
- `NativeTabs` with `minimizeBehavior="onScrollDown"` and `tintColor` set to accent.
- Triggers in order: Today (`house`), Practice (`pencil.and.list.clipboard`), Explore (`safari`), Progress (`chart.line.uptrend.xyaxis`), then Search with `role="search"` last.
- Shared logic moves to `components/navigation/useTabShell.ts`.
- `EdgeSwipeNavigator` is dropped on iOS.

**Tests:** split `layout.test` into an iOS file and an android-web file.

**Risks:**
- The API is unstable: pin the version and keep all usage in this one file.
- Minimize needs `ScreenScroll` as each tab's root.

**Acceptance:** Liquid Glass bar on iOS 26, classic bar on iOS 18, and VoiceOver announces "tab, 1 of 5".

### P2c: Floating capsule (Android, compact/medium web), large title, glass buttons

**`components/navigation/FloatingTabBar.tsx`** (`TabBar` stays as a re-export for one release):
- A `Glass variant="bar"` capsule: height 62, left and right 16, bottom 26 + safe area.
- A Reanimated selection lens on `spring.bouncy`, measured from `onLayout`.
- `TabBarScrollContext`: scrolling down past 24 minimizes it to a pill showing the active icon; scrolling up or tapping expands it.
- A 62pt search circle that morphs into a bottom field (keyboard-controller).
- Haptics on tab change.
- Reduce Motion: the lens jumps and the other moves become a 160ms crossfade.
- Keeps tablist/tab roles, `aria-selected`, focus rings, label `maxFontSizeMultiplier` 1.3 and `minHeight`.

**Other files:**
- `ScreenScroll`/`Screen`: `useAnimatedScrollHandler` feeding the context, plus the new clearance.
- `LargeTitleHeader.tsx`: a 34/41 title that scrolls, an inline 17pt title in a glass band once collapsed, and a 24pt soft edge using `expo-linear-gradient` (the system edge on iOS 26).
- `GlassIconButton.tsx`: 40 visual, 44 hit, label required.
- `TabHeader` and `TodayHeader` wrap `LargeTitleHeader`.
- `SidebarNav` gains a Search row.

**Tests:**
- `FloatingTabBar.test`: roles, `tabPress` with `defaultPrevented`, haptics, the minimized "Expand tab bar" button, and Reduce Motion.
- `LargeTitleHeader.test` and `GlassIconButton.test`.
- `ScreenScroll` clearance.
- Add the new files to the `m3AppScreensDesign` guard.

**Risks:**
- Low-end Android blur. Mitigations: blur only the bar and header, use `blurReductionFactor`, never animate intensity, and stay opaque on API 30 and below. The gate is 60fps on a 200-row list.
- RNW `backdrop-filter`.
- Clearance in Explore's FlatList and `AnalyticsDashboard`.
- Conflict with `EdgeSwipe`: keep swipe edges at 20pt.
- On web, cap the capsule at 560px.

## P3: Core primitives (`components/ui`)

**New:**
- `InsetGroup`/`InsetRow`: radius 18, continuous corners, `minHeight` 44, a 30pt icon tile, a hairline separator inset to the text, plus a header and footer.
- `SegmentedControl`: `spring.snappy` thumb, haptics, tablist roles, 44pt minimum.
- `SearchField` promoted from `components/explore`.

**Updated:**
- `Button`: radius 14, headline label, `PressableScale`, pressed state `accentPressed`.
- `Card`: radius 22. `Chip`: radius 8. `TextField`: radius 12.
- `ListRow`: rebuilt on `InsetRow`; 19 consumers.
- `Sheet`:
  - Routed sheets use native formSheet with detents [0.5, 1], corner radius 28 and a grabber.
  - The in-place Sheet keeps its accessibility contract and gains radius 28, a glass header and `spring.smooth`.
  - Web stays a focus-trapped Modal and becomes a dialog from medium widths up.

**Tests:** update the `ui/__tests__` suites; new `InsetGroup` and `SegmentedControl` tests; formSheet options; add the primitives to the `m3` guard.

**Risk:** Android formSheet has keyboard issues, so forms with inputs keep the in-place Sheet.

## P4: Screens, one PR per tab

Order: **Today** → **Practice** → **Explore + Search** → **Progress + Profile/Settings** → the remaining routes.

**Every PR:**
- Uses `LargeTitleHeader`, `InsetGroup`, the new controls and `<Text role>`.
- Converts `typo.*` and hand-set font sizes.
- Moves to Reanimated springs, with `spring.bouncy` for correct-answer and streak moments.
- Extends the area guard: no legacy role names, and no fixed `height` on text containers.
- Captures screenshots on iOS 26 and 18, Pixel API 34, API 30, and web at 390, 800 and 1280. Verifies AX3 and font scale 2, Reduce Motion and Reduce Transparency, and keeps one primary action per screen.

**Final P4 PR:** remove the legacy role and radius aliases.

## P5: Admin and landing

### P5a: Web tokens

- `packages/ui/tailwind-preset.js`:
  - `heading` and `body` fonts both become the system stack (class names unchanged), plus `sans`.
  - iOS `fontSize` roles; admin keeps `text-ui` 13/20.
  - Radii chip through capsule.
  - Easing and duration tokens.
  - A `glass` utility with an `@supports` fallback.
- `admin/app/layout.tsx`: remove `next/font/google`.
- `globals.css`: system stack, and `prefers-reduced-transparency` disables blur.
- DESIGN.md: rewrite the Type, Radii, Motion, Glass and Nav sections.
- **Tests:** `noRawColours` stays green; a new `fonts.test`; `next build` plus CSS greps.

### P5b: macOS-style desk

- Sidebar `#fafafa`.
- A translucent sticky toolbar using the `glass` class, holding the single `h1`.
- `SegmentedFilter` for filters with 5 or fewer options.
- An inspector pane at `xl` and above that reuses the Drawer content (modal Drawer below `xl`).
- All DESIGN.md DataTable and Dialog contracts unchanged. Existing tests are the contract; add a `SegmentedFilter` test.
- Landing: 17 files move to iOS roles and card/capsule radii, with a glass nav.

## P6: Brand asset swap — CANCELLED (owner, 2026-10-12)

The owner rejected the new carabao mark concepts and decided to **keep the current app logo** (pixel-art carabao with graduation cap on #831626, `apps/mobile/assets/images/icon.png` / `logo.svg`). No logo or app-icon assets change in this redesign. The notes below are kept only for reference.

- **Replace:**
  - `assets/logo.svg` and `apps/mobile/assets/images/logo.svg`
  - Regenerate `icon.png`, `adaptive-icon.png` and `splash.png` with `scripts/generate-icons.js`
  - Admin `public/logo.svg`, `icon.png`, `app/icon.png`, `apple-icon.png` and OG images
- **iOS 26 icons:** an Icon Composer `.icon` with light, tinted and clear variants.
- **Confirm:** the adaptive background and notification colour `#831626`.
- **Splash:** the background stays `#fdf4f4`.
- **Tests:** `expoConfig` icon paths and image dimensions.
- **Note:** this requires a store build.

## Sequencing

```
P0 SDK55 → P1a → P1b → P1c → P2a → P2b ┐ (parallel)
                                  P2c ┘
         → P3 → P4 (Today → Practice → Explore → Progress → rest)
P5 can run in parallel from P1a; P6 whenever the logo lands.
```

**Every PR:**
- Mobile: `tsc` and `jest`.
- Admin: `tsc`, `vitest` and `next build`.
- Hex values never change.
- The light-only guard is only ever extended.
- New UI goes into its area's design guard.
