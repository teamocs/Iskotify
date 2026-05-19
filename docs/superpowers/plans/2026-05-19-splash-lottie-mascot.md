# Splash Squircle + Lottie Mascot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the splash screen logo a squircle shape (remove the spinner), and replace the static SVG Kuya Baw mascot on the home screen AI coach card with a Lottie animation.

**Architecture:** Three independent changes: install `lottie-react-native` + copy the asset, update `_layout.tsx` for the splash, update `index.tsx` for the mascot. No new files beyond the copied asset. No new routes, hooks, or services.

**Tech Stack:** React Native `View` + `overflow: 'hidden'` for squircle, `lottie-react-native` for the animation, Expo managed workflow (SDK 54).

---

## File Map

| File | Change |
|------|--------|
| `apps/mobile/app/_layout.tsx` | Squircle wrapper around LogoSvg, remove ActivityIndicator import + JSX |
| `apps/mobile/app/(tabs)/index.tsx` | Swap `KuyaBawMascot` SVG import for `LottieView`, update JSX |
| `apps/mobile/assets/kuya-baw-transparent.json` | Copy from repo root `assets/` |
| `apps/mobile/package.json` | New dep added by `expo install lottie-react-native` |

---

### Task 1: Install lottie-react-native and copy the animation asset

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`)
- Create: `apps/mobile/assets/kuya-baw-transparent.json`

- [ ] **Step 1: Install lottie-react-native via expo**

Run from the repo root:
```bash
cd apps/mobile && npx expo install lottie-react-native
```
Expected: package added to `apps/mobile/package.json` dependencies, `node_modules/lottie-react-native` present.

- [ ] **Step 2: Verify the install**

```bash
node -e "require('lottie-react-native'); console.log('ok')"
```
Expected output: `ok`

- [ ] **Step 3: Copy the Lottie animation file into the mobile app assets**

Run from the repo root (PowerShell):
```powershell
Copy-Item "assets\kuya-baw-transparent.json" "apps\mobile\assets\kuya-baw-transparent.json"
```
Or bash:
```bash
cp assets/kuya-baw-transparent.json apps/mobile/assets/kuya-baw-transparent.json
```

- [ ] **Step 4: Verify the file was copied**

```bash
ls apps/mobile/assets/kuya-baw-transparent.json
```
Expected: file present (it will be large — that's expected, the JSON embeds image assets).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/package.json apps/mobile/assets/kuya-baw-transparent.json
git commit -m "feat: install lottie-react-native, add kuya-baw animation asset"
```

---

### Task 2: Squircle splash screen logo — remove spinner

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

The current loading overlay (lines ~59–67) is:
```tsx
{(!appReady || !fontsReady) && (
  <View style={{
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', gap: 20,
  }}>
    <LogoSvg width={80} height={80} viewBox="0 0 2048 2048" />
    <ActivityIndicator color="rgba(252,165,165,0.8)" size="small" />
  </View>
)}
```

- [ ] **Step 1: Remove ActivityIndicator from the import**

Change line 2 from:
```tsx
import { Platform, View, Text, ActivityIndicator } from 'react-native'
```
to:
```tsx
import { Platform, View, Text } from 'react-native'
```

- [ ] **Step 2: Replace the loading overlay JSX**

Replace the entire overlay block with:
```tsx
{(!appReady || !fontsReady) && (
  <View style={{
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center',
  }}>
    <View style={{ width: 80, height: 80, borderRadius: 20, overflow: 'hidden' }}>
      <LogoSvg width={80} height={80} viewBox="0 0 2048 2048" />
    </View>
  </View>
)}
```

The `borderRadius: 20` on an 80×80 square is exactly 25% — the standard iOS squircle ratio. `overflow: 'hidden'` clips the SVG corners.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Visual check**

Start the dev server (`npx expo start --clear --port 8082`) and open the app. On first load you should see:
- The Iskotify logo in a rounded-square (squircle) shape
- NO loading spinner below it

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat: squircle splash logo, remove loading spinner"
```

---

### Task 3: Lottie Kuya Baw mascot on home screen

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

The current mascot import is near line 10:
```tsx
import KuyaBawMascot from '../../assets/images/kuya-baw-mascot.svg'
```

The current mascot JSX is inside the `kuyaCard` (around line 222):
```tsx
<View style={s.kuyaAvatarLg}>
  <KuyaBawMascot width={80} height={80} viewBox="0 0 600 600" />
</View>
```

- [ ] **Step 1: Swap the import**

Remove:
```tsx
import KuyaBawMascot from '../../assets/images/kuya-baw-mascot.svg'
```
Add in its place:
```tsx
import LottieView from 'lottie-react-native'
```

- [ ] **Step 2: Replace the mascot JSX**

Replace:
```tsx
<View style={s.kuyaAvatarLg}>
  <KuyaBawMascot width={80} height={80} viewBox="0 0 600 600" />
</View>
```
with:
```tsx
<View style={s.kuyaAvatarLg}>
  <LottieView
    source={require('../../assets/kuya-baw-transparent.json')}
    autoPlay
    loop
    style={{ width: 80, height: 80 }}
  />
</View>
```

The existing `kuyaAvatarLg` style (`width: 80, height: 80, borderRadius: 16, overflow: 'hidden'`) clips the animation to the rounded square — no style changes needed.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Visual check**

With the dev server running, navigate to the Home tab. The AI coach card should show:
- Kuya Baw animating (looping) inside the rounded avatar container
- Animation fills the 80×80 container without overflow
- The rest of the card (name, badge, message) is unchanged

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/index.tsx
git commit -m "feat: replace kuya-baw svg with lottie animation on home screen"
```
