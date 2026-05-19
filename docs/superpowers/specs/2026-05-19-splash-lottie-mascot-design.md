# Splash Squircle + Lottie Mascot Design

## Goal

Two focused UI polish changes: (1) give the splash screen logo a squircle shape and remove the loading spinner, and (2) replace the static SVG Kuya Baw mascot on the home screen AI coach card with the provided Lottie animation.

## Architecture

No new screens or routes. Both changes are isolated to existing files. One new dependency (`lottie-react-native`) and one new asset copied into the mobile app.

## Feature 1: Squircle Splash Logo

**File:** `apps/mobile/app/_layout.tsx`

Wrap the existing `<LogoSvg width={80} height={80} viewBox="0 0 2048 2048" />` in a `View` with:
```
width: 80, height: 80, borderRadius: 20, overflow: 'hidden'
```
`borderRadius: 20` on an 80×80 square is 25% — the standard iOS squircle ratio.

Remove the `<ActivityIndicator>` entirely. The loading state is already communicated by the logo itself being present; the spinner is unnecessary visual noise.

No new dependencies. No changes to the loading logic.

## Feature 2: Lottie Kuya Baw Mascot

**Asset:** Copy `assets/kuya-baw-transparent.json` (repo root) → `apps/mobile/assets/kuya-baw-transparent.json`

**Dependency:** `lottie-react-native` installed via `expo install` to get the SDK-54-compatible version automatically.

**File:** `apps/mobile/app/(tabs)/index.tsx`

- Remove `import KuyaBawMascot from '../../assets/images/kuya-baw-mascot.svg'`
- Add `import LottieView from 'lottie-react-native'`
- Replace:
  ```tsx
  <KuyaBawMascot width={80} height={80} viewBox="0 0 600 600" />
  ```
  with:
  ```tsx
  <LottieView
    source={require('../../assets/kuya-baw-transparent.json')}
    autoPlay
    loop
    style={{ width: 80, height: 80 }}
  />
  ```

The existing `kuyaAvatarLg` container style (`width: 80, height: 80, borderRadius: 16, overflow: 'hidden'`) stays unchanged — the Lottie view fits directly inside it.

## Files Changed

| File | Change |
|------|--------|
| `apps/mobile/app/_layout.tsx` | Squircle wrapper on logo, remove ActivityIndicator |
| `apps/mobile/app/(tabs)/index.tsx` | Swap KuyaBawMascot SVG for LottieView |
| `apps/mobile/assets/kuya-baw-transparent.json` | New — copied from repo root `assets/` |
| `apps/mobile/package.json` | New dep: `lottie-react-native` |
