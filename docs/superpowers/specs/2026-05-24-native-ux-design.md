# Native UX (PR 2 + PR 4 Combined) Design

## Overview

Bundle two related improvements that both require native modules into a single APK build:

- **App-wide keyboard handling** — replace all `KeyboardAvoidingView` (RN core) usages with the better-behaved `react-native-keyboard-controller` equivalent. Fixes Android keyboard hiding inputs in Modal, jankiness on iOS, and provides `KeyboardAwareScrollView` for forms.
- **Swipe-between-tabs** — add edge-pan gesture to navigate between bottom tabs (Home ↔ Practice ↔ Listings ↔ Analytics ↔ Profile) with a horizontal slide animation. Edge-only so it never conflicts with horizontal children (Analytics filter chips, etc.).

Both ship together in one APK because both add native modules. Version bumps from `1.0.0` → `1.1.0` per the `appVersion` runtime policy. Future JS-only changes OTA back into this APK normally.

---

## 1. New native module installs

Two packages, both Expo-managed:

| Package | Purpose | Version target |
|---|---|---|
| `react-native-keyboard-controller` | Drop-in `KeyboardAvoidingView` + `KeyboardAwareScrollView` that work correctly inside `Modal` on Android, smoother animations | ~1.16 (Expo SDK 54 compatible) |
| `react-native-gesture-handler` | Edge-pan `Gesture.Pan()` API for the swipe-between-tabs feature | ^2.x (Expo-managed) |

Install via:
```
npx expo install react-native-keyboard-controller react-native-gesture-handler
```

`npx expo install` selects the version pinned to SDK 54 automatically.

Both auto-configure via autolinking — no `app.json` plugin entries needed.

---

## 2. Keyboard (PR 2) — app-wide replacement

**Root setup** (`apps/mobile/app/_layout.tsx`):
Wrap the existing tree with `<KeyboardProvider>` from `react-native-keyboard-controller`. This installs the JS-side keyboard observers globally.

**Per-file replacements** (5 files):

| File | Change |
|---|---|
| `apps/mobile/components/AskKuyaModal.tsx` | Swap RN `KeyboardAvoidingView` import for the one from `react-native-keyboard-controller`. Simplify `behavior` to `'padding'` only (the library handles platform differences internally). Drop the conditional `keyboardVerticalOffset`. |
| `apps/mobile/components/SchoolPicker.tsx` | Same import swap + behavior simplification. |
| `apps/mobile/app/onboarding.tsx` | Same import swap. Additionally: swap the outer `<ScrollView>` for `<KeyboardAwareScrollView>` from the same library so the school picker (near the bottom of a multi-field form) scrolls into view when focused. |
| `apps/mobile/app/(tabs)/practice.tsx` | Same import swap. |
| `apps/mobile/app/(tabs)/listings.tsx` | Same import swap. |

The import lines change from `from 'react-native'` to `from 'react-native-keyboard-controller'`. The component API is intentionally identical — same `behavior`, same children, same style props — so no JSX restructure is needed.

`KeyboardAwareScrollView` shares the API of `ScrollView` plus auto-scrolls focused inputs into view. Used only in `onboarding.tsx`; the other 4 files don't have long forms with bottom-positioned inputs.

---

## 3. Swipe-between-tabs (PR 4) — edge-pan navigator

**Root setup** (`apps/mobile/app/_layout.tsx`):
Wrap the existing tree (alongside `KeyboardProvider`) with `<GestureHandlerRootView style={{ flex: 1 }}>` from `react-native-gesture-handler`. Required for any gesture handler anywhere in the tree.

**Tab navigator config** (`apps/mobile/app/(tabs)/_layout.tsx`):
Add `animation: 'shift'` to `Tabs.screenOptions`. This is a React Navigation 7 `@react-navigation/bottom-tabs` option that gives horizontal-slide transitions to tab switches, regardless of whether the switch is triggered by tab tap or swipe gesture.

```tsx
<Tabs
  tabBar={(props) => <TabBar {...props} />}
  screenOptions={{ headerShown: false, animation: 'shift' }}
>
  {/* existing screens unchanged */}
</Tabs>
```

**`<EdgeSwipeNavigator>` component** (new file, `apps/mobile/components/EdgeSwipeNavigator.tsx`):

A wrapper that renders its children and listens for edge-pan gestures via `Gesture.Pan()` from `react-native-gesture-handler`. On a successful edge-swipe, calls `router.navigate()` to switch tabs.

Configuration:
- `activeOffsetX: [-15, 15]` — gesture activates only after 15 px horizontal movement.
- `failOffsetY: [-15, 15]` — vertical scrolls win; pager defers to FlatLists/ScrollViews.
- **Edge detection** via Reanimated shared value: `onBegin` stores the start X; `onEnd` checks if `startX.value < EDGE_WIDTH` (left edge) or `startX.value > screenWidth - EDGE_WIDTH` (right edge). `EDGE_WIDTH = 30 px`.
- **Trigger thresholds:** `Math.abs(translationX) > 50` AND `Math.abs(velocityX) > 500`.
- **Direction → tab:** swipe left → next tab in order; swipe right → previous tab.
- **Tab order:** `Home → Practice → Listings → Analytics → Profile`.
- **Boundary behavior:** at Home, right-edge swipe is a no-op (no previous tab). At Profile, left-edge swipe is a no-op (no next tab). No bounce, no error toast.
- **`runOnJS(onSwipeComplete)`** at the end of the worklet — `router.navigate()` is a JS-side call and can't run on the UI thread.

**Wiring** (`apps/mobile/app/(tabs)/_layout.tsx`):
Wrap the existing `<Tabs>` element with `<EdgeSwipeNavigator>`.

```tsx
<EdgeSwipeNavigator>
  <Tabs ...>
    {/* screens */}
  </Tabs>
</EdgeSwipeNavigator>
```

**Modal interaction:** When `AskKuyaModal` (or any other React Native `Modal`) is open, the modal renders in a separate native window above the tabs. The gesture handler in the tab layout can't receive the modal's touches — no swipe-to-close conflict.

---

## 4. File map

**New files (1):**

| File | Responsibility |
|---|---|
| `apps/mobile/components/EdgeSwipeNavigator.tsx` | Edge-pan gesture wrapper that calls `router.navigate()` |

**Modified files (9):**

| File | Change |
|---|---|
| `apps/mobile/package.json` + `pnpm-lock.yaml` | Add `react-native-keyboard-controller` and `react-native-gesture-handler` |
| `apps/mobile/app.json` | Bump `version` `1.0.0` → `1.1.0` (per the `appVersion` runtime policy — required when adding native modules) |
| `apps/mobile/app/_layout.tsx` | Wrap root with `<GestureHandlerRootView>` + `<KeyboardProvider>` |
| `apps/mobile/app/(tabs)/_layout.tsx` | Wrap `<Tabs>` with `<EdgeSwipeNavigator>`; add `animation: 'shift'` |
| `apps/mobile/components/AskKuyaModal.tsx` | Swap `KeyboardAvoidingView` import + simplify `behavior` |
| `apps/mobile/components/SchoolPicker.tsx` | Same |
| `apps/mobile/app/onboarding.tsx` | Same + swap outer `ScrollView` → `KeyboardAwareScrollView` |
| `apps/mobile/app/(tabs)/practice.tsx` | Same |
| `apps/mobile/app/(tabs)/listings.tsx` | Same |

---

## 5. Testing approach

**Unit tests (Jest):**

- `EdgeSwipeNavigator.test.tsx` (new) — smoke test that renders children + gesture handler is wired. Mock `react-native-gesture-handler` and `expo-router`. ~3 tests.
- Existing tests for the 5 keyboard-touched files (`practice.test.tsx`, `onboarding.test.tsx`, etc.) need a `jest.mock('react-native-keyboard-controller', ...)` shim that re-exports `KeyboardAvoidingView` and `KeyboardAwareScrollView` as passthrough components. Add the mock at the top of each existing test that breaks.
- Other affected tests (home.test.tsx, etc.) should still pass — they don't render keyboard-affected components directly.

**Manual on-device validation** (most critical — gestures and animations cannot be unit-tested meaningfully):

1. Tap to open chat → tap input → keyboard slides up, input row stays smoothly above it. No janky jump.
2. Onboarding → tap school picker → focused picker scrolls into view above the keyboard.
3. From Home → swipe left from the right edge → animated slide transition to Practice.
4. From Practice → swipe right from the left edge → slide back to Home.
5. From Analytics → swipe from center of screen → no navigation (gesture rejected; only edge starts trigger).
6. From Analytics → vertical scroll → no tab navigation (vertical gesture wins).
7. At Home → swipe right from left edge → no-op (no previous tab), no visual jiggle.
8. At Profile → swipe left from right edge → no-op (no next tab).
9. Open `AskKuyaModal` → try edge-swipe → no tab switch happens (modal captures gesture).

---

## 6. Rollout

This PR is **NOT** OTA-shippable. Both new packages add native code that the existing APK doesn't have.

Sequence:
1. Implement and commit all changes (per the implementation plan), including the `version` bump `1.0.0` → `1.1.0` in `apps/mobile/app.json`.
2. Push to master.
3. `eas build --platform android --profile preview --non-interactive --no-wait`.
4. APK ready ~5-10 min (paid plan priority queue).
5. Install on device — same keystore, so installs over the existing APK without uninstall.
6. After verifying on-device, future JS-only changes OTA-ship into this APK normally.

---

## 7. Out of scope

- iOS-specific keyboard tuning (the library works the same on both platforms by design).
- Page indicator dots above the tab bar (the existing custom `TabBar` already shows the active tab).
- True finger-following drag animation between tabs (Section 1 chose React Navigation's `animation: 'shift'` instead).
- Swipe-to-go-back from non-tab screens (e.g., listing detail → swipe right back to Listings) — separate feature, not in this PR.
- Refactoring the existing `TabBar` component — stays as-is.
- Edge-swipe gesture visual hint (no on-screen prompt or hint label).
- Swipe + multi-tap interactions (e.g., swipe-then-tap during the animation).
