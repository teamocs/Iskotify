# PR 10: Focus Mode for Practice Sessions

## Overview

Add a "Focus Mode" toggle to the start screen of every practice session that, when ON (default), enables aggressive in-session distraction blocking:

- **Anti-screenshot / anti-screen-recording** via `expo-screen-capture`
- **Hidden Android navigation bar** (immersive sticky) via `expo-navigation-bar`
- **Hidden status bar** via existing `expo-status-bar`
- **Back-button interception** with confirm-to-exit modal
- **AppState backgrounding detection** with timer pause + full-screen "Session Paused" overlay on return

Plus a polish-backlog bundle (useMemo pan gesture, sanitizeForOr `{}` chars, 3 rgba light-mode swaps) since we're already doing a native rebuild.

Ships as APK v1.2.0 (new native modules → not OTA-shippable). Same keystore as v1.1.0 so it installs over the existing app.

**Out of scope:** true Android Lock Task Mode / Screen Pinning (would require a custom Expo native module — deferred to a future build).

---

## 1. Native module installs (APK build required)

Two packages, both well-maintained and Expo-managed:

| Package | Purpose | Version target |
|---|---|---|
| `expo-screen-capture` | `preventScreenCaptureAsync()` blocks screenshots + screen recording for the session duration. Screenshots/recordings show black content + a system toast "Screenshots are disabled by the app". | SDK 54 compatible (~14.x) |
| `expo-navigation-bar` | Android-only — hides the bottom nav bar (back/home/recents). Swiping from the bottom edge still summons it transiently. | SDK 54 compatible (~5.x) |

Install via:
```
npx expo install expo-screen-capture expo-navigation-bar
```

Both auto-link via Expo config — no `app.json` plugin entries needed.

**Version bump:** `apps/mobile/app.json` `version` `1.1.0 → 1.2.0`, `android.versionCode` `10 → 11`.

---

## 2. Schema migration — persist the Focus Mode preference

Add a column to the existing `user_settings` table:

```sql
ALTER TABLE user_settings
  ADD COLUMN focus_mode_enabled INTEGER NOT NULL DEFAULT 1;
```

Drizzle schema update in `apps/mobile/db/schema.ts`:

```ts
export const userSettings = sqliteTable('user_settings', {
  // ... existing fields ...
  focusModeEnabled: integer('focus_mode_enabled', { mode: 'boolean' }).notNull().default(true),
})
```

**Migration strategy:** the app's current SQLite setup runs migrations on launch via `expo-sqlite`'s `enableChangeListener` + the `DrizzleProvider`. I'll inspect the current migration runner during planning and wire the new `ALTER TABLE` into it. If the project uses Drizzle's generated migrations folder, I generate a new migration. If it uses inline raw SQL (e.g., `db.execute(...)` on launch), I add the ALTER there.

Default value `1` (true) ensures existing users get Focus Mode ON without any explicit action.

---

## 3. New hook: `useFocusModePref`

`apps/mobile/hooks/useFocusModePref.ts` — reads + writes the persisted preference. API:

```ts
interface UseFocusModePref {
  enabled: boolean       // current preference (true on first load)
  setEnabled: (v: boolean) => void   // updates state + persists to SQLite
  loading: boolean       // true until first read completes
}

export function useFocusModePref(): UseFocusModePref
```

Implementation:
- On mount: SELECT `focus_mode_enabled` from `user_settings WHERE id=1`. Initial state is true (default-on) while loading; switches to the DB value once the SELECT resolves.
- `setEnabled(v)`: optimistic local update + UPDATE row in DB. If the DB write fails, log warning but keep local state (the user's intent is honored for the current session even if persistence drops).

---

## 4. New hook: `useFocusMode`

`apps/mobile/hooks/useFocusMode.ts` — the session lifecycle hook. Drives all in-session focus behaviors.

API:

```ts
interface FocusModeState {
  isPaused: boolean              // true while AppState !== 'active' OR user explicitly paused
  resumeSession: () => void      // user tapped Resume on paused overlay
  endSession: () => void         // user tapped End on paused overlay — caller navigates to results
}

export function useFocusMode(args: {
  enabled: boolean              // from useFocusModePref
  active: boolean               // true only during quiz phase (not ready/results)
  onTimerPause: () => void      // caller pauses its own timer
  onTimerResume: () => void     // caller resumes its own timer
  onExitConfirmed: () => void   // user tapped "Exit Session" on the back-press alert
}): FocusModeState
```

Lifecycle (only when `enabled && active`):

| Phase | Effect |
|---|---|
| Mount / activation | `ScreenCapture.preventScreenCaptureAsync()`, `NavigationBar.setVisibilityAsync('hidden')` (Android only), `NavigationBar.setBehaviorAsync('inset-swipe')` (Android only), `BackHandler.addEventListener('hardwareBackPress', → Alert.alert(...))`, `AppState.addEventListener('change', ...)` |
| AppState → background/inactive | `setIsPaused(true)`, call `onTimerPause()` |
| AppState → active (returning) | If was paused: keep `isPaused: true` until user taps Resume on the overlay. Don't auto-resume — that's the whole point. |
| User taps Resume | `setIsPaused(false)`, call `onTimerResume()`, dismiss overlay |
| User taps End | call `onTimerPause()` + `endSession()` callback — caller navigates to results |
| Hardware back | call `Alert.alert('Exit session?', '...', [{Cancel}, {Exit Session → onExitConfirmed()}])`. Listener returns `true` to consume the back-press event. |
| Unmount / deactivation | All the above reversed: `allowScreenCaptureAsync()`, `setVisibilityAsync('visible')`, `BackHandler.removeEventListener(...)`, `AppState` subscription removed |

The hook does not own routing or rendering. It calls `Alert.alert` directly for the back-press confirm (no JSX needed), and exposes `isPaused` + Resume/End callbacks so the caller renders the SessionPausedOverlay.

---

## 5. New component: `FocusModeToggle`

`apps/mobile/components/FocusModeToggle.tsx` — the row UI on the ready screen.

```tsx
interface Props {
  enabled: boolean
  onToggle: (v: boolean) => void
}
```

Layout (placed directly above the "Start Quiz →" button):

```
┌────────────────────────────────────────┐
│  🔒  Focus Mode               [ON ▮▯] │
│      Hides nav bar, blocks screenshots,│
│      warns before exit                  │
└────────────────────────────────────────┘
```

- Container: `t.surface` background, `t.border` border, 18px radius, padding 14px, gap 10px.
- Icon: 🔒 emoji or a Lineicons lock icon (32×32, `t.accentSurface` background).
- Label: "Focus Mode" — `Outfit_700Bold`, `typo.md`, `t.textPrimary`.
- Description: 2-line sublabel — `Lexend_400Regular`, `typo.xs`, `t.textTertiary`.
- Switch: React Native's `Switch` component with `t.accent` thumb when on.
- `accessibilityRole="switch"`, `accessibilityState={{ checked: enabled }}`.

---

## 6. New component: `SessionPausedOverlay`

`apps/mobile/components/SessionPausedOverlay.tsx` — the full-screen overlay shown when the user returns from backgrounding during a focused session.

```tsx
interface Props {
  visible: boolean
  timeRemainingSecs: number          // for displaying "X minutes remaining"
  onResume: () => void
  onEnd: () => void
}
```

Layout:

```
┌──────────────────────────────────┐
│                                  │
│             ⏸                    │
│                                  │
│       Session Paused             │
│                                  │
│   Time remaining: 12 min         │
│                                  │
│   ┌────────────────────┐         │
│   │  Resume Session    │         │
│   └────────────────────┘         │
│   ┌────────────────────┐         │
│   │   End Session      │         │
│   └────────────────────┘         │
│                                  │
└──────────────────────────────────┘
```

- Full-screen `<Modal>` with `transparent: false`, `animationType: 'fade'`.
- Tapping anywhere outside the buttons does NOT dismiss (force the user to choose).
- "Resume Session" — primary button (filled accent), calls `onResume`.
- "End Session" — secondary button (text-only, `t.textSecondary`), calls `onEnd`.

---

## 7. Exit-confirm modal (lightweight, inline in practice screens)

When the user taps the hardware back button mid-session AND focus mode is on, show a small confirmation:

```
┌──────────────────────────────┐
│      Exit session?           │
│                              │
│   Your progress is saved.    │
│   You can resume later.      │
│                              │
│   [Cancel]    [Exit Session] │
└──────────────────────────────┘
```

Implementation: reuse the existing `Alert.alert(...)` pattern (already used elsewhere in the app, e.g., profile export-failure alert). Two-button alert. `Alert.alert` is React Native built-in, no new component file needed.

If focus mode is OFF: back button behaves normally (router.back).

---

## 8. Wiring into the 3 practice files

Each of `apps/mobile/app/practice/[topicId].tsx`, `apps/mobile/app/practice/deck/[deckId].tsx`, `apps/mobile/app/practice/listing/[slug].tsx` gets:

**On the ready screen (phase === 'ready'):**
- Import `useFocusModePref` + `FocusModeToggle`
- Below the rules card / above the "Start Quiz →" button, render `<FocusModeToggle enabled={focusEnabled} onToggle={setFocusEnabled} />`

**On the quiz screen (phase === 'quiz'):**
- Import `useFocusMode` + `SessionPausedOverlay`
- Call `useFocusMode({ enabled: focusEnabled, active: phase === 'quiz', onTimerPause: pauseTimer, onTimerResume: resumeTimer, onExitConfirmed: () => router.back() })` at the top of the component.
- Each file already has a timer state (`timeLeft`) + a ticker (`startTimer` / interval ref). Add `pauseTimer()` and `resumeTimer()` functions that clear/restart the interval.
- Render `<SessionPausedOverlay visible={focusMode.isPaused} timeRemainingSecs={timeLeft} onResume={focusMode.resumeSession} onEnd={() => { focusMode.endSession(); setPhase('results') }} />` at the end of the JSX (so it overlays everything).
- The hook's internal `endSession()` callback resumes/pauses timer cleanup but does NOT navigate — the caller's `onEnd` handler triggers the phase change to 'results'.

---

## 9. Polish-backlog bundle (no separate OTA needed)

Since we're already shipping a native build, include these accumulated polish items:

1. **`useMemo` around the pan gesture** in `EdgeSwipeNavigator.tsx` — flagged by PR 2+4 final reviewer. Currently `Gesture.Pan()` is recreated every render. Wrap in `useMemo` with `[navigateTo]` dep.

2. **`sanitizeForOr` strips `{` and `}`** in `useSchoolSearch.ts` — flagged by PR 6 reviewer. Current regex `[,()'"]` could break Postgres array literals if input contains curly braces. One-char addition: `[,(){}'"]`.

3. **Three `rgba(252,165,165,0.8)` foreground text colors** — flagged by PR 6 reviewer. Same light-mode unreadability as `#fca5a5` but alpha variants slipped past:
   - `apps/mobile/components/SchoolPicker.tsx` — `errorText` style
   - `apps/mobile/components/SchoolPicker.tsx` — `fallbackLink` style
   - `apps/mobile/components/AiModelBanner.tsx` — `downloadingBytes` style

Swap all three to `t.accentText` (drops the 0.8 alpha — readable on both themes).

---

## 10. File map

**New files (4):**

| File | Responsibility |
|---|---|
| `apps/mobile/hooks/useFocusMode.ts` | Session lifecycle: capture/nav-bar/back/AppState wiring |
| `apps/mobile/hooks/useFocusModePref.ts` | Persisted toggle preference |
| `apps/mobile/components/FocusModeToggle.tsx` | Ready-screen toggle row |
| `apps/mobile/components/SessionPausedOverlay.tsx` | Full-screen pause overlay |

**Modified files (~10):**

| File | Change |
|---|---|
| `apps/mobile/package.json` + lockfile | Add `expo-screen-capture` + `expo-navigation-bar` |
| `apps/mobile/app.json` | Bump version 1.1.0 → 1.2.0, versionCode 10 → 11 |
| `apps/mobile/db/schema.ts` | Add `focusModeEnabled` column on userSettings |
| Migration runner file (TBD during plan — likely `apps/mobile/db/client.ts` or similar) | Add `ALTER TABLE user_settings ADD COLUMN focus_mode_enabled INTEGER NOT NULL DEFAULT 1` |
| `apps/mobile/app/practice/[topicId].tsx` | Wire FocusModeToggle + useFocusMode + SessionPausedOverlay |
| `apps/mobile/app/practice/deck/[deckId].tsx` | Same |
| `apps/mobile/app/practice/listing/[slug].tsx` | Same |
| `apps/mobile/components/EdgeSwipeNavigator.tsx` | useMemo around pan gesture |
| `apps/mobile/hooks/useSchoolSearch.ts` | sanitizeForOr regex adds `{}` |
| `apps/mobile/components/SchoolPicker.tsx` | 2 rgba color swaps |
| `apps/mobile/components/AiModelBanner.tsx` | 1 rgba color swap |

**Test files (~4):**

| File | Change |
|---|---|
| `apps/mobile/hooks/__tests__/useFocusMode.test.ts` (NEW) | Verifies prevent/allowScreenCapture called on enable/disable, BackHandler listener registered + confirm modal shown, AppState handler pauses on background, navigation bar visibility toggled (Android-only path mocked) |
| `apps/mobile/hooks/__tests__/useFocusModePref.test.ts` (NEW) | Initial state is true, SELECT loads value, setEnabled writes to DB |
| `apps/mobile/components/__tests__/EdgeSwipeNavigator.test.tsx` | Asserts `Gesture.Pan()` called only once across re-renders (useMemo working) |
| `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts` | New test: query with `{}` chars gets sanitized; doesn't break the .or() clause |

---

## 11. Testing approach

**Unit tests (Jest):**
- `useFocusMode` — mock `expo-screen-capture`, `expo-navigation-bar`, `BackHandler`, `AppState`. Assert lifecycle methods called in the right order on enable/disable.
- `useFocusModePref` — in-memory SQLite (existing pattern from chatContext tests). Assert default-on behavior + setEnabled persists.
- `FocusModeToggle` — render test + toggle interaction asserts `onToggle` callback fired.
- `EdgeSwipeNavigator` — useMemo regression test.

**Manual on-device validation (after APK installs):**
1. Open practice → see Focus Mode toggle row above Start button.
2. Toggle is ON by default. Tap to flip OFF → tap Start → verify status bar + nav bar are visible, screenshots work normally.
3. Back to ready, flip toggle ON → tap Start → verify status bar + nav bar hidden, try screenshot → blocked with system toast, try back button → confirm modal appears.
4. Mid-session, swipe down to switch apps (or press home) → return to Iskotify → see full-screen "Session Paused" overlay → tap Resume → quiz continues with timer paused at correct value.
5. Mid-session, press home → return → see paused overlay → tap End Session → goes to results with partial data.
6. Toggle preference persists across sessions: flip OFF, exit ready screen, re-enter → toggle still OFF.

**Polish-backlog validation:**
- EdgeSwipeNavigator: navigate tabs rapidly, verify no jank or extra gesture registration.
- School search: type "Mapúa{test}" — search returns results (sanitization works).
- Light theme: open School Picker error state (disconnect wifi + search) — error text + retry link readable on cream bg.

---

## 12. Rollout

NOT OTA-shippable — new native modules.

Sequence:
1. Implement + commit all changes
2. Push to master
3. `eas build --platform android --profile preview --non-interactive --no-wait` (paid plan priority ~5–10 min)
4. APK ready
5. Install over v1.1.0 APK (same keystore — no uninstall)
6. After v1.2.0 verified, future JS-only changes OTA-ship normally

The polish-backlog items are included in this same APK so we don't need a separate OTA push for them.

---

## 13. Out of scope

- **Android Lock Task Mode / Screen Pinning** — true home/recents button blocking. Requires a custom Expo native module (~150 lines of Kotlin + a config plugin). Defer to a follow-up build if user wants it after testing v1.2.0.
- **iOS Guided Access integration** — Apple's equivalent of Lock Task; requires the user to enable in iOS Settings ahead of time. Out of scope until iOS build is prioritized.
- **Suppressing other apps' heads-up notifications** — OS-controlled, no API exists to block.
- **Programmatic Do Not Disturb toggling** — would require Notification Policy Access permission + a separate UX prompt; not worth the friction.
- **Tracking how often users disable Focus Mode** — analytics is a separate concern.
- **Customizing the focus mode color/theming** — uses existing theme tokens, no customization knobs.
- **Per-topic Focus Mode override** — single global toggle, no per-session overrides beyond the ready-screen switch.
- **Resume after device reboot** — if the user reboots their phone mid-session, the session is lost (no recovery). Out of scope.
