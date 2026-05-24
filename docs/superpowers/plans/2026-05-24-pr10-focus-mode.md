# PR 10: Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Focus Mode toggle on practice-session start screens that, when ON (default), blocks screenshots, hides nav bar + status bar, intercepts the back button with a confirm-to-exit alert, and pauses the timer + shows a full-screen "Session Paused" overlay when the app backgrounds. Bundle the polish backlog (useMemo pan, sanitizeForOr braces, 3 rgba color swaps) since we're already doing a native rebuild.

**Architecture:** Two new native modules (`expo-screen-capture`, `expo-navigation-bar`) install via Expo autolink. A `useFocusModePref` hook reads/writes the persisted toggle. A `useFocusMode` hook owns session lifecycle (capture/nav-bar/back/AppState wiring). Two new UI components (`FocusModeToggle`, `SessionPausedOverlay`) render the toggle row + the pause modal. All 3 practice screens add the toggle on ready + the overlay on quiz. Schema migration via the existing `MIGRATIONS` array in `db/client.ts`.

**Tech Stack:** React Native 0.81, Expo SDK 54, expo-router 6, Drizzle ORM + expo-sqlite, jest-expo, `expo-screen-capture` (new), `expo-navigation-bar` (new).

**Spec:** `docs/superpowers/specs/2026-05-24-pr10-focus-mode-design.md`

---

## File Structure

**New files (4):**
- `apps/mobile/hooks/useFocusModePref.ts` — Read/write persisted toggle.
- `apps/mobile/hooks/useFocusMode.ts` — Session lifecycle hook.
- `apps/mobile/components/FocusModeToggle.tsx` — Ready-screen toggle row.
- `apps/mobile/components/SessionPausedOverlay.tsx` — Full-screen pause modal.

**Modified source files (~10):**
- `apps/mobile/package.json` + lockfile — 2 new packages.
- `apps/mobile/app.json` — version 1.1.0→1.2.0, versionCode 10→11.
- `apps/mobile/db/schema.ts` — `focusModeEnabled` column.
- `apps/mobile/db/client.ts` — append migration to MIGRATIONS array.
- `apps/mobile/jest.setup.ts` — global mocks for the 2 new native modules.
- `apps/mobile/app/practice/[topicId].tsx` — wire toggle + overlay + pause/resume timer.
- `apps/mobile/app/practice/deck/[deckId].tsx` — same.
- `apps/mobile/app/practice/listing/[slug].tsx` — same.
- `apps/mobile/components/EdgeSwipeNavigator.tsx` — useMemo pan (polish).
- `apps/mobile/hooks/useSchoolSearch.ts` — sanitizeForOr regex `{}` (polish).
- `apps/mobile/components/SchoolPicker.tsx` — 2 rgba swaps (polish).
- `apps/mobile/components/AiModelBanner.tsx` — 1 rgba swap (polish).

**New test files (3):**
- `apps/mobile/hooks/__tests__/useFocusModePref.test.ts`
- `apps/mobile/hooks/__tests__/useFocusMode.test.ts`
- `apps/mobile/components/__tests__/FocusModeToggle.test.tsx` (light render test)

---

## Task 1: Install native modules + bump version

**Why first:** Per the project's `runtimeVersion: { policy: "appVersion" }`, adding native modules REQUIRES bumping `version` in `apps/mobile/app.json` or existing OTA bundles will crash the new APK.

**Files:**
- Modify: `apps/mobile/package.json` (+ workspace `pnpm-lock.yaml`)
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Install both packages via `expo install`**

From `apps/mobile/`:
```bash
npx expo install expo-screen-capture expo-navigation-bar
```

Expected: pnpm adds both to `dependencies` pinned to SDK 54 compatible versions. Both auto-link via Expo config — no `plugins` entry needed.

- [ ] **Step 2: Bump `version` in `apps/mobile/app.json`**

Change line 6:
```json
"version": "1.1.0",
```
to:
```json
"version": "1.2.0",
```

- [ ] **Step 3: Bump `android.versionCode` in `apps/mobile/app.json`**

Change line 33 (current value is `10`):
```json
"versionCode": 10
```
to:
```json
"versionCode": 11
```

- [ ] **Step 4: Verify install**

From `apps/mobile/`:
```bash
node -e "const p=require('./package.json'); console.log('screen-capture:', p.dependencies['expo-screen-capture']); console.log('navigation-bar:', p.dependencies['expo-navigation-bar']);"
```
Expected: both lines print a version string (not `undefined`).

- [ ] **Step 5: Verify app.json**

From `apps/mobile/`:
```bash
node -e "const a=require('./app.json'); console.log('version:', a.expo.version, '| versionCode:', a.expo.android.versionCode);"
```
Expected: `version: 1.2.0 | versionCode: 11`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json pnpm-lock.yaml
git commit -m "feat(mobile): install expo-screen-capture + expo-navigation-bar, bump to 1.2.0"
```

---

## Task 2: Add global jest mocks for the new libraries

**Why:** Subsequent tests (Tasks 4, 5, 8-10) import hooks/screens that pull in `expo-screen-capture` and `expo-navigation-bar`. Those need module-level mocks under jest-expo or tests crash at import time.

**Files:**
- Modify: `apps/mobile/jest.setup.ts`

- [ ] **Step 1: Read current jest.setup.ts**

```bash
cat apps/mobile/jest.setup.ts
```
Expected: existing env-var lines + the keyboard-controller + gesture-handler mocks from earlier PRs.

- [ ] **Step 2: Append the two new mocks**

Add at the bottom of `apps/mobile/jest.setup.ts`:
```ts
// expo-screen-capture: stub the async prevent/allow APIs
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
}))

// expo-navigation-bar: stub setVisibilityAsync + setBehaviorAsync
jest.mock('expo-navigation-bar', () => ({
  setVisibilityAsync: jest.fn().mockResolvedValue(undefined),
  setBehaviorAsync: jest.fn().mockResolvedValue(undefined),
  getVisibilityAsync: jest.fn().mockResolvedValue('visible'),
}))
```

- [ ] **Step 3: Run full test suite to confirm no regressions**

From `apps/mobile/`:
```bash
pnpm test
```
Expected: same baseline (1 pre-existing failure in `services/__tests__/supabase.test.ts`). All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/jest.setup.ts
git commit -m "test(mobile): shim expo-screen-capture + expo-navigation-bar in jest setup"
```

---

## Task 3: Schema migration for `focus_mode_enabled` column

**Files:**
- Modify: `apps/mobile/db/schema.ts`
- Modify: `apps/mobile/db/client.ts`

The project's migration pattern (`apps/mobile/db/client.ts`) is a single `MIGRATIONS` array of raw SQL strings wrapped in `try/catch`. New migrations are appended at the end.

- [ ] **Step 1: Add `focusModeEnabled` to the Drizzle schema**

Open `apps/mobile/db/schema.ts`. Find the `userSettings` table definition (around line 59). The existing block ends with:
```ts
export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey(),
  selectedListingSlug: text('selected_listing_slug').notNull().default(''),
  lastSyncedAt: integer('last_synced_at').notNull().default(0),
  fullName: text('full_name').notNull().default(''),
  school: text('school').notNull().default(''),
  gradeLevel: integer('grade_level'),
  googleId: text('google_id'),
  email: text('email'),
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
  theme: text('theme').notNull().default('system'),
})
```

Replace it with (add `focusModeEnabled` as the last field, before the closing `})`):
```ts
export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey(),
  selectedListingSlug: text('selected_listing_slug').notNull().default(''),
  lastSyncedAt: integer('last_synced_at').notNull().default(0),
  fullName: text('full_name').notNull().default(''),
  school: text('school').notNull().default(''),
  gradeLevel: integer('grade_level'),
  googleId: text('google_id'),
  email: text('email'),
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
  theme: text('theme').notNull().default('system'),
  focusModeEnabled: integer('focus_mode_enabled', { mode: 'boolean' }).notNull().default(true),
})
```

- [ ] **Step 2: Append the migration to `db/client.ts`**

Open `apps/mobile/db/client.ts`. Find the `MIGRATIONS` array (around line 66). The current last entry is:
```ts
  `CREATE TABLE IF NOT EXISTS user_requirements (
    listing_slug TEXT NOT NULL,
    requirement_index INTEGER NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (listing_slug, requirement_index)
  )`,
]
```

Append one new entry between the closing `)` and `]`:
```ts
  `CREATE TABLE IF NOT EXISTS user_requirements (
    listing_slug TEXT NOT NULL,
    requirement_index INTEGER NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (listing_slug, requirement_index)
  )`,
  `ALTER TABLE user_settings ADD COLUMN focus_mode_enabled INTEGER NOT NULL DEFAULT 1`,
]
```

The existing migration runner wraps each entry in `try { rawDb.execSync(sql) } catch { /* column already exists */ }`. Re-running on an already-migrated DB is safe — the ALTER fails silently if the column exists.

- [ ] **Step 3: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors. The new `focusModeEnabled` field on the Drizzle schema is referenced by Task 4 but doesn't break anything until then.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts
git commit -m "feat(mobile): add focus_mode_enabled column to user_settings"
```

---

## Task 4: `useFocusModePref` hook + tests

**Files:**
- Create: `apps/mobile/hooks/useFocusModePref.ts`
- Create: `apps/mobile/hooks/__tests__/useFocusModePref.test.ts`

TDD: write failing tests first, verify they fail, then implement.

- [ ] **Step 1: Write the failing test file**

Create `apps/mobile/hooks/__tests__/useFocusModePref.test.ts`:
```ts
import { renderHook, act, waitFor } from '@testing-library/react-native'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'

function makeDb(initialFocusEnabled = 1): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY NOT NULL,
      selected_listing_slug TEXT NOT NULL DEFAULT '',
      last_synced_at INTEGER NOT NULL DEFAULT 0,
      full_name TEXT NOT NULL DEFAULT '',
      school TEXT NOT NULL DEFAULT '',
      grade_level INTEGER,
      google_id TEXT,
      email TEXT,
      notifications_enabled INTEGER DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'system',
      focus_mode_enabled INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO user_settings (id, focus_mode_enabled) VALUES (1, ${initialFocusEnabled});
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

const mockDb = jest.fn<DrizzleClient, []>()

jest.mock('../useDb', () => ({
  useDb: () => mockDb(),
}))

import { useFocusModePref } from '../useFocusModePref'

describe('useFocusModePref', () => {
  it('defaults to enabled=true while loading', () => {
    mockDb.mockReturnValue(makeDb(1))
    const { result } = renderHook(() => useFocusModePref())
    // Initial synchronous render before SELECT resolves
    expect(result.current.enabled).toBe(true)
    expect(result.current.loading).toBe(true)
  })

  it('reads the persisted value on mount (true case)', async () => {
    mockDb.mockReturnValue(makeDb(1))
    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(true)
  })

  it('reads the persisted value on mount (false case)', async () => {
    mockDb.mockReturnValue(makeDb(0))
    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(false)
  })

  it('setEnabled(false) updates state immediately and persists to DB', async () => {
    const db = makeDb(1)
    mockDb.mockReturnValue(db)
    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.setEnabled(false)
      await new Promise(r => setTimeout(r, 50))
    })
    expect(result.current.enabled).toBe(false)

    // Re-mount the hook with the same DB — should read the persisted false
    const { result: result2 } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result2.current.loading).toBe(false))
    expect(result2.current.enabled).toBe(false)
  })

  it('setEnabled(true) flips back from false', async () => {
    mockDb.mockReturnValue(makeDb(0))
    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(false)

    await act(async () => {
      result.current.setEnabled(true)
      await new Promise(r => setTimeout(r, 50))
    })
    expect(result.current.enabled).toBe(true)
  })

  it('returns enabled=true when user_settings row does NOT exist (fresh install)', async () => {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE user_settings (
        id INTEGER PRIMARY KEY NOT NULL,
        focus_mode_enabled INTEGER NOT NULL DEFAULT 1
      );
    `)
    // Note: NO INSERT — the row doesn't exist yet
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient
    mockDb.mockReturnValue(db)

    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(true)  // default
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=useFocusModePref
```
Expected: FAIL with `Cannot find module '../useFocusModePref'`.

- [ ] **Step 3: Create the hook**

Create `apps/mobile/hooks/useFocusModePref.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings } from '../db/schema'

export interface UseFocusModePref {
  enabled: boolean
  setEnabled: (v: boolean) => void
  loading: boolean
}

/**
 * Read + write the persisted Focus Mode preference (`user_settings.focus_mode_enabled`).
 * Default-on: returns `enabled=true` until the DB read resolves, AND if the
 * row doesn't exist yet (fresh install before onboarding).
 */
export function useFocusModePref(): UseFocusModePref {
  const db = useDb()
  const [enabled, setEnabledState] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void db
      .select({ focusModeEnabled: userSettings.focusModeEnabled })
      .from(userSettings)
      .where(eq(userSettings.id, 1))
      .limit(1)
      .then(rows => {
        if (cancelled) return
        const row = rows[0]
        // If row exists, use its value. Otherwise default-on.
        setEnabledState(row?.focusModeEnabled ?? true)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.warn('[useFocusModePref] load failed:', err)
        // Keep default true; still mark loading done so UI unblocks.
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [db])

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v)  // optimistic
    void db
      .insert(userSettings)
      .values({ id: 1, focusModeEnabled: v })
      .onConflictDoUpdate({ target: userSettings.id, set: { focusModeEnabled: v } })
      .catch(err => console.warn('[useFocusModePref] persist failed:', err))
  }, [db])

  return { enabled, setEnabled, loading }
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=useFocusModePref
```
Expected: all 6 tests PASS.

- [ ] **Step 5: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors. (The `focusModeEnabled` schema field from Task 3 now has a consumer.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/hooks/useFocusModePref.ts apps/mobile/hooks/__tests__/useFocusModePref.test.ts
git commit -m "feat(mobile): useFocusModePref hook for persisted toggle"
```

---

## Task 5: `useFocusMode` hook + tests

**Files:**
- Create: `apps/mobile/hooks/useFocusMode.ts`
- Create: `apps/mobile/hooks/__tests__/useFocusMode.test.ts`

TDD: tests first, then implementation.

- [ ] **Step 1: Write the failing test file**

Create `apps/mobile/hooks/__tests__/useFocusMode.test.ts`:
```ts
import { renderHook, act } from '@testing-library/react-native'

let mockAppStateHandler: ((state: string) => void) | null = null
const mockBackHandlerCb = jest.fn<boolean, []>()
let mockBackHandlerRegistered = false

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    addEventListener: jest.fn((event: string, cb: (s: string) => void) => {
      if (event === 'change') mockAppStateHandler = cb
      return { remove: jest.fn(() => { mockAppStateHandler = null }) }
    }),
    currentState: 'active',
  },
  BackHandler: {
    addEventListener: jest.fn((event: string, cb: () => boolean) => {
      mockBackHandlerRegistered = true
      mockBackHandlerCb.mockImplementation(cb)
      return { remove: jest.fn(() => { mockBackHandlerRegistered = false }) }
    }),
  },
  Alert: {
    alert: jest.fn((_title: string, _msg: string | undefined, buttons?: Array<{ text: string; onPress?: () => void; style?: string }>) => {
      // Simulate user tapping the destructive button if present
      const destructive = buttons?.find(b => b.style === 'destructive')
      if (destructive?.onPress) destructive.onPress()
    }),
  },
}))

import { preventScreenCaptureAsync, allowScreenCaptureAsync } from 'expo-screen-capture'
import { setVisibilityAsync, setBehaviorAsync } from 'expo-navigation-bar'
import { Alert, BackHandler } from 'react-native'

const mockPrevent = preventScreenCaptureAsync as jest.MockedFunction<typeof preventScreenCaptureAsync>
const mockAllow = allowScreenCaptureAsync as jest.MockedFunction<typeof allowScreenCaptureAsync>
const mockSetVisibility = setVisibilityAsync as jest.MockedFunction<typeof setVisibilityAsync>
const mockSetBehavior = setBehaviorAsync as jest.MockedFunction<typeof setBehaviorAsync>
const mockAlert = Alert.alert as jest.MockedFunction<typeof Alert.alert>
const mockBackHandlerAdd = BackHandler.addEventListener as jest.MockedFunction<typeof BackHandler.addEventListener>

import { useFocusMode } from '../useFocusMode'

beforeEach(() => {
  jest.clearAllMocks()
  mockAppStateHandler = null
  mockBackHandlerRegistered = false
})

describe('useFocusMode', () => {
  const baseArgs = {
    enabled: true,
    active: true,
    onTimerPause: jest.fn(),
    onTimerResume: jest.fn(),
    onExitConfirmed: jest.fn(),
  }

  it('does NOT activate when enabled=false', () => {
    renderHook(() => useFocusMode({ ...baseArgs, enabled: false }))
    expect(mockPrevent).not.toHaveBeenCalled()
    expect(mockSetVisibility).not.toHaveBeenCalled()
    expect(mockBackHandlerAdd).not.toHaveBeenCalled()
  })

  it('does NOT activate when active=false (ready/results phase)', () => {
    renderHook(() => useFocusMode({ ...baseArgs, active: false }))
    expect(mockPrevent).not.toHaveBeenCalled()
    expect(mockSetVisibility).not.toHaveBeenCalled()
  })

  it('calls preventScreenCaptureAsync on activation', async () => {
    renderHook(() => useFocusMode(baseArgs))
    await act(async () => {})
    expect(mockPrevent).toHaveBeenCalledTimes(1)
  })

  it('hides navigation bar on activation (Android)', async () => {
    renderHook(() => useFocusMode(baseArgs))
    await act(async () => {})
    expect(mockSetVisibility).toHaveBeenCalledWith('hidden')
    expect(mockSetBehavior).toHaveBeenCalledWith('inset-swipe')
  })

  it('registers a BackHandler listener on activation', async () => {
    renderHook(() => useFocusMode(baseArgs))
    await act(async () => {})
    expect(mockBackHandlerAdd).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function))
  })

  it('calls allowScreenCaptureAsync + restores nav bar on unmount', async () => {
    const { unmount } = renderHook(() => useFocusMode(baseArgs))
    await act(async () => {})
    mockAllow.mockClear()
    mockSetVisibility.mockClear()
    unmount()
    await act(async () => {})
    expect(mockAllow).toHaveBeenCalledTimes(1)
    expect(mockSetVisibility).toHaveBeenCalledWith('visible')
  })

  it('isPaused=true and onTimerPause called when AppState goes to background', async () => {
    const onTimerPause = jest.fn()
    const { result } = renderHook(() => useFocusMode({ ...baseArgs, onTimerPause }))
    await act(async () => {})
    expect(result.current.isPaused).toBe(false)

    act(() => { mockAppStateHandler?.('background') })
    expect(result.current.isPaused).toBe(true)
    expect(onTimerPause).toHaveBeenCalledTimes(1)
  })

  it('isPaused stays true when AppState returns to active (user must tap Resume)', async () => {
    const onTimerResume = jest.fn()
    const { result } = renderHook(() => useFocusMode({ ...baseArgs, onTimerResume }))
    await act(async () => {})

    act(() => { mockAppStateHandler?.('background') })
    expect(result.current.isPaused).toBe(true)

    act(() => { mockAppStateHandler?.('active') })
    expect(result.current.isPaused).toBe(true)  // STILL paused — overlay should be visible
    expect(onTimerResume).not.toHaveBeenCalled()
  })

  it('resumeSession() flips isPaused back and calls onTimerResume', async () => {
    const onTimerResume = jest.fn()
    const { result } = renderHook(() => useFocusMode({ ...baseArgs, onTimerResume }))
    await act(async () => {})

    act(() => { mockAppStateHandler?.('background') })
    expect(result.current.isPaused).toBe(true)

    act(() => { result.current.resumeSession() })
    expect(result.current.isPaused).toBe(false)
    expect(onTimerResume).toHaveBeenCalledTimes(1)
  })

  it('hardware back press shows Alert and calls onExitConfirmed when user confirms', async () => {
    const onExitConfirmed = jest.fn()
    renderHook(() => useFocusMode({ ...baseArgs, onExitConfirmed }))
    await act(async () => {})

    // Trigger the back handler that was registered
    const handler = mockBackHandlerAdd.mock.calls[0]?.[1] as (() => boolean)
    const consumed = handler?.()
    expect(consumed).toBe(true)  // back press consumed
    expect(mockAlert).toHaveBeenCalledWith(
      'Exit session?',
      expect.stringContaining('progress'),
      expect.any(Array),
    )
    // Our mock Alert auto-taps the destructive button → onExitConfirmed fires
    expect(onExitConfirmed).toHaveBeenCalledTimes(1)
  })

  it('endSession() calls onTimerPause (the caller handles navigation)', async () => {
    const onTimerPause = jest.fn()
    const { result } = renderHook(() => useFocusMode({ ...baseArgs, onTimerPause }))
    await act(async () => {})
    onTimerPause.mockClear()  // ignore the initial mount call (if any)

    act(() => { result.current.endSession() })
    expect(onTimerPause).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=useFocusMode
```
Expected: FAIL with `Cannot find module '../useFocusMode'`.

- [ ] **Step 3: Create the hook**

Create `apps/mobile/hooks/useFocusMode.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, BackHandler, Platform } from 'react-native'
import { preventScreenCaptureAsync, allowScreenCaptureAsync } from 'expo-screen-capture'
import { setVisibilityAsync, setBehaviorAsync } from 'expo-navigation-bar'

export interface FocusModeState {
  isPaused: boolean
  resumeSession: () => void
  endSession: () => void
}

interface UseFocusModeArgs {
  enabled: boolean
  active: boolean
  onTimerPause: () => void
  onTimerResume: () => void
  onExitConfirmed: () => void
}

/**
 * Session lifecycle hook. Active only when `enabled && active`. While active:
 *   - Blocks screenshots / screen recording
 *   - Hides Android navigation bar (immersive)
 *   - Intercepts hardware back press with an Alert
 *   - Detects AppState backgrounding, pauses timer, requires user to tap Resume
 *
 * Caller renders the SessionPausedOverlay using {isPaused, resumeSession, endSession}.
 * The exit Alert is rendered internally via react-native Alert API.
 */
export function useFocusMode({
  enabled,
  active,
  onTimerPause,
  onTimerResume,
  onExitConfirmed,
}: UseFocusModeArgs): FocusModeState {
  const [isPaused, setIsPaused] = useState(false)
  const onExitConfirmedRef = useRef(onExitConfirmed)
  const onTimerPauseRef = useRef(onTimerPause)
  const onTimerResumeRef = useRef(onTimerResume)

  // Keep refs current so the back / appstate handlers always see latest callbacks
  useEffect(() => { onExitConfirmedRef.current = onExitConfirmed }, [onExitConfirmed])
  useEffect(() => { onTimerPauseRef.current = onTimerPause }, [onTimerPause])
  useEffect(() => { onTimerResumeRef.current = onTimerResume }, [onTimerResume])

  // Activation effect — runs only when enabled+active flip true.
  useEffect(() => {
    if (!enabled || !active) return

    void preventScreenCaptureAsync().catch(err => console.warn('[useFocusMode] prevent:', err))
    if (Platform.OS === 'android') {
      void setVisibilityAsync('hidden').catch(err => console.warn('[useFocusMode] nav hide:', err))
      void setBehaviorAsync('inset-swipe').catch(err => console.warn('[useFocusMode] nav behavior:', err))
    }

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        'Exit session?',
        'Your progress is saved. You can resume later.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Exit Session',
            style: 'destructive',
            onPress: () => onExitConfirmedRef.current(),
          },
        ],
      )
      return true  // consume the back press
    })

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        setIsPaused(true)
        onTimerPauseRef.current()
      }
      // Returning to 'active' does NOT auto-resume — user must tap Resume on the overlay
    })

    return () => {
      void allowScreenCaptureAsync().catch(err => console.warn('[useFocusMode] allow:', err))
      if (Platform.OS === 'android') {
        void setVisibilityAsync('visible').catch(err => console.warn('[useFocusMode] nav restore:', err))
      }
      backSub.remove()
      appStateSub.remove()
      setIsPaused(false)
    }
  }, [enabled, active])

  const resumeSession = useCallback(() => {
    setIsPaused(false)
    onTimerResumeRef.current()
  }, [])

  const endSession = useCallback(() => {
    onTimerPauseRef.current()
    // Caller handles navigation to results screen
  }, [])

  return { isPaused, resumeSession, endSession }
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=useFocusMode
```
Expected: all 11 tests PASS.

- [ ] **Step 5: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/hooks/useFocusMode.ts apps/mobile/hooks/__tests__/useFocusMode.test.ts
git commit -m "feat(mobile): useFocusMode hook — capture/nav-bar/back/AppState lifecycle"
```

---

## Task 6: `FocusModeToggle` component

**Files:**
- Create: `apps/mobile/components/FocusModeToggle.tsx`
- Create: `apps/mobile/components/__tests__/FocusModeToggle.test.tsx`

- [ ] **Step 1: Write failing render test**

Create `apps/mobile/components/__tests__/FocusModeToggle.test.tsx`:
```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FocusModeToggle } from '../FocusModeToggle'

describe('FocusModeToggle', () => {
  it('renders label "Focus Mode" + a description', () => {
    const { getByText } = render(<FocusModeToggle enabled={true} onToggle={() => {}} />)
    expect(getByText('Focus Mode')).toBeTruthy()
    expect(getByText(/Hides nav bar/i)).toBeTruthy()
  })

  it('calls onToggle(false) when switch is tapped while ON', () => {
    const onToggle = jest.fn()
    const { getByRole } = render(<FocusModeToggle enabled={true} onToggle={onToggle} />)
    fireEvent(getByRole('switch'), 'valueChange', false)
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('calls onToggle(true) when switch is tapped while OFF', () => {
    const onToggle = jest.fn()
    const { getByRole } = render(<FocusModeToggle enabled={false} onToggle={onToggle} />)
    fireEvent(getByRole('switch'), 'valueChange', true)
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('reflects enabled prop in switch state', () => {
    const { getByRole, rerender } = render(<FocusModeToggle enabled={true} onToggle={() => {}} />)
    expect(getByRole('switch').props.value).toBe(true)
    rerender(<FocusModeToggle enabled={false} onToggle={() => {}} />)
    expect(getByRole('switch').props.value).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=FocusModeToggle
```
Expected: FAIL with `Cannot find module '../FocusModeToggle'`.

- [ ] **Step 3: Create the component**

Create `apps/mobile/components/FocusModeToggle.tsx`:
```tsx
import { useMemo } from 'react'
import { StyleSheet, View, Text, Switch } from 'react-native'
import { useTheme } from '../theme/ThemeContext'

interface Props {
  enabled: boolean
  onToggle: (v: boolean) => void
}

export function FocusModeToggle({ enabled, onToggle }: Props) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 18,
      padding: 14,
      width: '100%',
      gap: 12,
      marginBottom: 14,
    },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: t.accentSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconTxt: { fontSize: 18 },
    body: { flex: 1 },
    label: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.md,
      color: t.textPrimary,
      marginBottom: 2,
    },
    desc: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: t.textTertiary,
      lineHeight: 15,
    },
  }), [t, typo])

  return (
    <View style={s.row}>
      <View style={s.iconBox}>
        <Text style={s.iconTxt}>🔒</Text>
      </View>
      <View style={s.body}>
        <Text style={s.label}>Focus Mode</Text>
        <Text style={s.desc}>Hides nav bar, blocks screenshots, warns before exit</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        thumbColor={enabled ? t.accentText : t.textTertiary}
        trackColor={{ false: t.surface2, true: t.accentSurface }}
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        accessibilityLabel="Focus Mode toggle"
      />
    </View>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=FocusModeToggle
```
Expected: 4 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/FocusModeToggle.tsx apps/mobile/components/__tests__/FocusModeToggle.test.tsx
git commit -m "feat(mobile): FocusModeToggle component for ready screen"
```

---

## Task 7: `SessionPausedOverlay` component

**Files:**
- Create: `apps/mobile/components/SessionPausedOverlay.tsx`

No new tests — purely visual, validated on-device.

- [ ] **Step 1: Create the component**

Create `apps/mobile/components/SessionPausedOverlay.tsx`:
```tsx
import { useMemo } from 'react'
import { StyleSheet, View, Text, Modal, Pressable } from 'react-native'
import { useTheme } from '../theme/ThemeContext'

interface Props {
  visible: boolean
  timeRemainingSecs: number
  onResume: () => void
  onEnd: () => void
}

function formatMinutes(secs: number): string {
  const minutes = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (minutes <= 0) return `${remSecs} sec`
  return `${minutes} min ${remSecs > 0 ? `${remSecs} sec` : ''}`.trim()
}

export function SessionPausedOverlay({ visible, timeRemainingSecs, onResume, onEnd }: Props) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: t.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    icon: { fontSize: 64, marginBottom: 20 },
    title: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.h2,
      color: t.textPrimary,
      marginBottom: 8,
    },
    sub: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.md,
      color: t.textSecondary,
      marginBottom: 36,
      textAlign: 'center',
    },
    resumeBtn: {
      backgroundColor: 'rgba(128,0,0,0.85)',
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 40,
      width: '100%',
      alignItems: 'center',
      marginBottom: 12,
    },
    resumeBtnTxt: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.md,
      color: '#fff',
    },
    endBtn: {
      paddingVertical: 12,
      width: '100%',
      alignItems: 'center',
    },
    endBtnTxt: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textSecondary,
    },
  }), [t, typo])

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => { /* swallow back */ }}>
      <View style={s.backdrop}>
        <Text style={s.icon}>⏸</Text>
        <Text style={s.title}>Session Paused</Text>
        <Text style={s.sub}>Time remaining: {formatMinutes(timeRemainingSecs)}</Text>
        <Pressable
          style={s.resumeBtn}
          onPress={onResume}
          accessibilityRole="button"
          accessibilityLabel="Resume session"
        >
          <Text style={s.resumeBtnTxt}>Resume Session</Text>
        </Pressable>
        <Pressable
          style={s.endBtn}
          onPress={onEnd}
          accessibilityRole="button"
          accessibilityLabel="End session"
        >
          <Text style={s.endBtnTxt}>End Session</Text>
        </Pressable>
      </View>
    </Modal>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/SessionPausedOverlay.tsx
git commit -m "feat(mobile): SessionPausedOverlay component for backgrounding overlay"
```

---

## Task 8: Wire Focus Mode into `[topicId].tsx`

**Files:**
- Modify: `apps/mobile/app/practice/[topicId].tsx`

The most complex of the 3 practice screens. It has the timer pattern that Tasks 9 & 10 mirror.

- [ ] **Step 1: Add imports**

Open `apps/mobile/app/practice/[topicId].tsx`. After the existing imports (around line 11), add:
```ts
import { StatusBar } from 'expo-status-bar'
import { useFocusModePref } from '../../hooks/useFocusModePref'
import { useFocusMode } from '../../hooks/useFocusMode'
import { FocusModeToggle } from '../../components/FocusModeToggle'
import { SessionPausedOverlay } from '../../components/SessionPausedOverlay'
```

- [ ] **Step 2: Use the focus pref hook + define pause/resume timer functions**

Inside the component body, near the existing hook calls (around line 47, after `const { recordSession } = useRecordSession()`), add:
```ts
const { enabled: focusEnabled, setEnabled: setFocusEnabled } = useFocusModePref()
```

Then find the `stopTimer` and `startTimer` function definitions (around line 240). The current `startTimer` always reads `timerSecsRef.current` (the full duration) — for pause/resume we need to also be able to resume from a partial value.

Add these two new functions immediately after the existing `stopTimer` definition (around line 244):
```ts
function pauseTimer() {
  // Halts the interval + animation but keeps timeLeftRef.current as-is
  // so resumeTimer can pick up from where we left off.
  stopTimer()
}

function resumeTimer() {
  const secs = timeLeftRef.current
  if (secs <= 0) return
  stopTimer()
  // Reset progress bar to the proportion currently remaining
  timerProgress.setValue(secs / timerSecsRef.current)
  timerAnimRef.current = Animated.timing(timerProgress, {
    toValue: 0,
    duration: secs * 1000,
    useNativeDriver: false,
  })
  timerAnimRef.current.start()
  timerRef.current = setInterval(() => {
    timeLeftRef.current -= 1
    setTimeLeft(timeLeftRef.current)
    if (timeLeftRef.current <= 0) {
      stopTimer()
      advanceRef.current(null)
    }
  }, 1000)
}
```

- [ ] **Step 3: Call useFocusMode**

In the component body, after the focus pref hook, add:
```ts
const focusMode = useFocusMode({
  enabled: focusEnabled,
  active: phase === 'quiz',
  onTimerPause: pauseTimer,
  onTimerResume: resumeTimer,
  onExitConfirmed: () => router.back(),
})
```

- [ ] **Step 4: Render the FocusModeToggle on the ready screen**

Find the ready-screen JSX (around line 395-401, the block with `<Text style={s.readySub}>...`). The current code has:
```tsx
        <TouchableOpacity style={s.startBtn} onPress={() => startQuiz()}>
          <Text style={s.startBtnTxt}>Start Quiz →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
```

Insert the FocusModeToggle right before the `<TouchableOpacity style={s.startBtn}>` line:
```tsx
        <FocusModeToggle enabled={focusEnabled} onToggle={setFocusEnabled} />
        <TouchableOpacity style={s.startBtn} onPress={() => startQuiz()}>
          <Text style={s.startBtnTxt}>Start Quiz →</Text>
        </TouchableOpacity>
```

- [ ] **Step 5: Render the SessionPausedOverlay + StatusBar at the end**

Find the OUTERMOST closing tags of the component's return JSX. Add the StatusBar (hidden when focused) and overlay just before the outermost `</SafeAreaView>` (or wherever the JSX closes):

```tsx
        <SessionPausedOverlay
          visible={focusMode.isPaused}
          timeRemainingSecs={timeLeft}
          onResume={focusMode.resumeSession}
          onEnd={() => {
            focusMode.endSession()
            setPhase('results')
          }}
        />
        {focusEnabled && phase === 'quiz' && <StatusBar hidden />}
```

Concretely: at the very bottom of the function body's `return (...)`, just before the closing `)`, find the closing `</SafeAreaView>`. Add the two JSX fragments above as siblings (inside the SafeAreaView) OR as siblings of the SafeAreaView (a fragment-wrapped return). The simplest pattern that matches the existing code: put them inside the SafeAreaView as the last children.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 7: Run practice tests**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern="practice"
```
Expected: PASS. The existing practice tests render the screen with mocks; the new hooks fall back to default-on (true) and the toggle renders harmlessly.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app/practice/[topicId].tsx
git commit -m "feat(mobile): wire Focus Mode into [topicId] practice screen"
```

---

## Task 9: Wire Focus Mode into `deck/[deckId].tsx`

**Files:**
- Modify: `apps/mobile/app/practice/deck/[deckId].tsx`

Same pattern as Task 8. The file's structure mirrors `[topicId].tsx` — has the same `phase` machine + timer ref + ready/quiz/results JSX.

- [ ] **Step 1: Add the same imports**

Open `apps/mobile/app/practice/deck/[deckId].tsx`. After the existing imports, add:
```ts
import { StatusBar } from 'expo-status-bar'
import { useFocusModePref } from '../../../hooks/useFocusModePref'
import { useFocusMode } from '../../../hooks/useFocusMode'
import { FocusModeToggle } from '../../../components/FocusModeToggle'
import { SessionPausedOverlay } from '../../../components/SessionPausedOverlay'
```

(Note: three `../` because this file is one directory deeper.)

- [ ] **Step 2: Add focus-mode hooks + pause/resume timer fns**

Inside the component body, near the other hook calls, add:
```ts
const { enabled: focusEnabled, setEnabled: setFocusEnabled } = useFocusModePref()
```

Find the `stopTimer` / `startTimer` definitions. Right after `stopTimer`, insert:
```ts
function pauseTimer() {
  stopTimer()
}

function resumeTimer() {
  const secs = timeLeftRef.current
  if (secs <= 0) return
  stopTimer()
  timerProgress.setValue(secs / timerSecsRef.current)
  timerAnimRef.current = Animated.timing(timerProgress, {
    toValue: 0,
    duration: secs * 1000,
    useNativeDriver: false,
  })
  timerAnimRef.current.start()
  timerRef.current = setInterval(() => {
    timeLeftRef.current -= 1
    setTimeLeft(timeLeftRef.current)
    if (timeLeftRef.current <= 0) {
      stopTimer()
      advanceRef.current(null)
    }
  }, 1000)
}
```

(Same code as Task 8 — verify by reading the file that `timeLeftRef`, `timerSecsRef`, `timerProgress`, `timerAnimRef`, `timerRef`, `setTimeLeft`, `advanceRef` all exist with these exact names. If any differ, adapt to the local names but keep the same logic.)

- [ ] **Step 3: Call useFocusMode**

After the focus pref hook, add:
```ts
const focusMode = useFocusMode({
  enabled: focusEnabled,
  active: phase === 'quiz',
  onTimerPause: pauseTimer,
  onTimerResume: resumeTimer,
  onExitConfirmed: () => router.back(),
})
```

- [ ] **Step 4: Render FocusModeToggle on ready screen**

Find the ready-screen JSX block (look for the "Start Quiz" or similar primary button on `phase === 'ready'`). Insert the toggle directly above the primary button:
```tsx
<FocusModeToggle enabled={focusEnabled} onToggle={setFocusEnabled} />
```

- [ ] **Step 5: Render the SessionPausedOverlay + StatusBar**

At the bottom of the return JSX, just before the outermost closing tag (`</SafeAreaView>`), add:
```tsx
<SessionPausedOverlay
  visible={focusMode.isPaused}
  timeRemainingSecs={timeLeft}
  onResume={focusMode.resumeSession}
  onEnd={() => {
    focusMode.endSession()
    setPhase('results')
  }}
/>
{focusEnabled && phase === 'quiz' && <StatusBar hidden />}
```

- [ ] **Step 6: Type-check + tests**

```bash
npx tsc --noEmit
pnpm test -- --testPathPattern="practice"
```
Expected: TS clean, tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/practice/deck/[deckId].tsx
git commit -m "feat(mobile): wire Focus Mode into deck practice screen"
```

---

## Task 10: Wire Focus Mode into `listing/[slug].tsx`

**Files:**
- Modify: `apps/mobile/app/practice/listing/[slug].tsx`

Same pattern as Tasks 8 & 9. Three `../` to reach `hooks/`/`components/`.

- [ ] **Step 1: Add imports**

```ts
import { StatusBar } from 'expo-status-bar'
import { useFocusModePref } from '../../../hooks/useFocusModePref'
import { useFocusMode } from '../../../hooks/useFocusMode'
import { FocusModeToggle } from '../../../components/FocusModeToggle'
import { SessionPausedOverlay } from '../../../components/SessionPausedOverlay'
```

- [ ] **Step 2: Add focus pref hook**

In the component body:
```ts
const { enabled: focusEnabled, setEnabled: setFocusEnabled } = useFocusModePref()
```

- [ ] **Step 3: Add pause/resume timer functions** (same as Tasks 8 & 9 — adapt variable names if local names differ):

```ts
function pauseTimer() {
  stopTimer()
}

function resumeTimer() {
  const secs = timeLeftRef.current
  if (secs <= 0) return
  stopTimer()
  timerProgress.setValue(secs / timerSecsRef.current)
  timerAnimRef.current = Animated.timing(timerProgress, {
    toValue: 0,
    duration: secs * 1000,
    useNativeDriver: false,
  })
  timerAnimRef.current.start()
  timerRef.current = setInterval(() => {
    timeLeftRef.current -= 1
    setTimeLeft(timeLeftRef.current)
    if (timeLeftRef.current <= 0) {
      stopTimer()
      advanceRef.current(null)
    }
  }, 1000)
}
```

- [ ] **Step 4: Call useFocusMode**

```ts
const focusMode = useFocusMode({
  enabled: focusEnabled,
  active: phase === 'quiz',
  onTimerPause: pauseTimer,
  onTimerResume: resumeTimer,
  onExitConfirmed: () => router.back(),
})
```

- [ ] **Step 5: Render FocusModeToggle on ready screen**

Above the start-quiz button on the ready JSX:
```tsx
<FocusModeToggle enabled={focusEnabled} onToggle={setFocusEnabled} />
```

- [ ] **Step 6: Render SessionPausedOverlay + StatusBar**

At the bottom of return JSX:
```tsx
<SessionPausedOverlay
  visible={focusMode.isPaused}
  timeRemainingSecs={timeLeft}
  onResume={focusMode.resumeSession}
  onEnd={() => {
    focusMode.endSession()
    setPhase('results')
  }}
/>
{focusEnabled && phase === 'quiz' && <StatusBar hidden />}
```

- [ ] **Step 7: Type-check + tests**

```bash
npx tsc --noEmit
pnpm test -- --testPathPattern="practice"
```
Expected: TS clean, tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app/practice/listing/[slug].tsx
git commit -m "feat(mobile): wire Focus Mode into listing practice screen"
```

---

## Task 11: Polish bundle — useMemo pan + sanitizeForOr braces + 3 rgba swaps

**Files:**
- Modify: `apps/mobile/components/EdgeSwipeNavigator.tsx`
- Modify: `apps/mobile/hooks/useSchoolSearch.ts`
- Modify: `apps/mobile/components/SchoolPicker.tsx`
- Modify: `apps/mobile/components/AiModelBanner.tsx`

Four small follow-up fixes flagged by previous PR reviewers. Bundled together since we're already doing a native rebuild.

- [ ] **Step 1: Wrap pan gesture in useMemo (EdgeSwipeNavigator)**

Open `apps/mobile/components/EdgeSwipeNavigator.tsx`. Add `useMemo` to the existing react import (around line 1):
```ts
import { useCallback, useMemo } from 'react'
```

Find the `const pan = Gesture.Pan()...` block (around line 32). Wrap it in `useMemo`:
```ts
const pan = useMemo(() =>
  Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      'worklet'
      const swipeLeft = e.translationX < -SWIPE_DISTANCE && Math.abs(e.velocityX) > SWIPE_VELOCITY
      const swipeRight = e.translationX > SWIPE_DISTANCE && Math.abs(e.velocityX) > SWIPE_VELOCITY
      if (swipeLeft) runOnJS(navigateTo)('left')
      else if (swipeRight) runOnJS(navigateTo)('right')
    }),
[navigateTo])
```

- [ ] **Step 2: Update EdgeSwipeNavigator test (assertion that Pan() is called once per pathname)**

Open `apps/mobile/components/__tests__/EdgeSwipeNavigator.test.tsx`. Find the test `'configures Pan gesture with activation thresholds'` (around line 50). Add a new test below it asserting useMemo is working:
```ts
  it('does not recreate the Pan gesture on re-render when pathname is unchanged', () => {
    mockUsePathname.mockReturnValue('/practice')
    const { rerender } = render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    expect(Gesture.Pan).toHaveBeenCalledTimes(1)
    rerender(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    rerender(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    expect(Gesture.Pan).toHaveBeenCalledTimes(1)  // useMemo kept the same object
  })
```

- [ ] **Step 3: Update sanitizeForOr regex (useSchoolSearch)**

Open `apps/mobile/hooks/useSchoolSearch.ts`. Find the `sanitizeForOr` function (around line 28). The current regex is `/[,()'"]/g`. Replace with:
```ts
function sanitizeForOr(q: string): string {
  return q.replace(/[,(){}'"]/g, '').trim()
}
```

- [ ] **Step 4: Add a test for the `{}` strip**

Open `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts`. Add this test at the end of the `describe('useSchoolSearch', ...)` block (before its closing `})`):
```ts
  it('sanitizes curly braces from the .or() filter', async () => {
    const mocks = mockSupabase([
      { name: 'Test School', city: 'Manila', province: 'NCR' },
    ])
    const { result } = renderHook(() => useSchoolSearch())
    act(() => { result.current.setQuery('Mapua{test}university') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results.length).toBeGreaterThan(0))
    // The query passed to .or() should have `{` and `}` stripped
    expect(mocks.or).toHaveBeenCalledWith(expect.stringContaining('name.ilike.%Mapuatestuniversity%'))
    expect(mocks.or).not.toHaveBeenCalledWith(expect.stringContaining('{test}'))
  })
```

- [ ] **Step 5: Swap 3 rgba(252,165,165,...) literals to t.accentText**

Open `apps/mobile/components/SchoolPicker.tsx`. Find lines 63 (`errorText`) and 98 (`fallbackLink`). The current values are:
```ts
errorText: {
  fontFamily: 'Lexend_400Regular',
  fontSize: typo.sm,
  color: 'rgba(252,165,165,0.8)',
  // ...
},
// ...
fallbackLink: {
  fontFamily: 'Lexend_500Medium',
  fontSize: typo.md,
  color: 'rgba(252,165,165,0.8)',
  // ...
},
```

Replace BOTH `color: 'rgba(252,165,165,0.8)'` with `color: t.accentText`:
```ts
errorText: {
  fontFamily: 'Lexend_400Regular',
  fontSize: typo.sm,
  color: t.accentText,
  // ...
},
// ...
fallbackLink: {
  fontFamily: 'Lexend_500Medium',
  fontSize: typo.md,
  color: t.accentText,
  // ...
},
```

Open `apps/mobile/components/AiModelBanner.tsx`. Find the `downloadingBytes` style (around line 72). Replace:
```ts
color: 'rgba(252,165,165,0.8)',
```
with:
```ts
color: t.accentText,
```

- [ ] **Step 6: Verify no rgba(252,165,165) literals remain in source**

From `apps/mobile/`:
```bash
grep -rn "rgba(252,165,165" components/ app/ 2>/dev/null
```
Expected: zero matches.

- [ ] **Step 7: Run full test suite**

From `apps/mobile/`:
```bash
pnpm test
```
Expected: same baseline failures (1 pre-existing `services/__tests__/supabase.test.ts`). The new useMemo test + sanitizeForOr brace test should pass.

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/components/EdgeSwipeNavigator.tsx \
  apps/mobile/components/__tests__/EdgeSwipeNavigator.test.tsx \
  apps/mobile/hooks/useSchoolSearch.ts \
  apps/mobile/hooks/__tests__/useSchoolSearch.test.ts \
  apps/mobile/components/SchoolPicker.tsx \
  apps/mobile/components/AiModelBanner.tsx
git commit -m "fix(mobile): polish bundle — useMemo pan, sanitizeForOr braces, 3 rgba swaps"
```

---

## Task 12: Final verification + push + EAS APK build

**Files:**
- No file modifications.

- [ ] **Step 1: Run full test suite one final time**

From `apps/mobile/`:
```bash
pnpm test
```
Expected: same baseline (1 pre-existing `supabase.test.ts` failure). All Focus Mode tests + polish tests green. Total test count up by ~20 (6 useFocusModePref + 11 useFocusMode + 4 FocusModeToggle + 1 useMemo + 1 sanitizeForOr brace).

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: only the 3 pre-existing baseline errors in `hooks/__tests__/useHomeStats.test.ts`, `hooks/usePracticeData.ts`, `services/llm.ts`. No new errors.

- [ ] **Step 3: Push to origin/master**

```bash
git push origin master
```

- [ ] **Step 4: Trigger EAS APK build**

From `apps/mobile/`:
```bash
eas build --platform android --profile preview --non-interactive --no-wait
```
Expected: prints a build URL. Build queues on the paid plan priority queue (~5–10 min).

- [ ] **Step 5: Report build URL to user**

Print the EAS build URL so the user can monitor. Same keystore as v1.1.0 — installs over existing app without uninstall.

- [ ] **Step 6: Manual on-device validation checklist (post-install)**

After the user installs v1.2.0 APK:

1. Open practice (any of the 3 entry points) → see Focus Mode toggle row above Start button, ON by default.
2. Tap toggle OFF → tap Start Quiz → verify status bar visible, nav bar visible, screenshot works, back button exits normally.
3. Back to ready, toggle ON → tap Start Quiz → verify status bar hidden, nav bar hidden (Android), try to screenshot → blocked with system toast "Screenshots are disabled".
4. Mid-session, press back → see Alert "Exit session?" → tap Cancel → stays in quiz, timer continues.
5. Mid-session, press back → tap Exit Session → goes back to ready screen.
6. Mid-session, press home button → return to Iskotify → see full-screen "Session Paused" overlay → tap Resume → quiz continues with timer at correct paused value.
7. Mid-session, press home → return → see overlay → tap End Session → goes directly to results screen.
8. Toggle persistence: flip OFF, exit ready screen, re-enter → toggle is still OFF.
9. Polish: navigate tabs rapidly via swipe — no jank from gesture object recreation. Light theme: open School Picker, search for nothing/disconnect → error UI readable on cream bg.

---

## Self-Review

**Spec coverage (against `docs/superpowers/specs/2026-05-24-pr10-focus-mode-design.md`):**

- Section 1 (native module installs): ✓ Task 1
- Section 2 (schema migration): ✓ Task 3
- Section 3 (`useFocusModePref`): ✓ Task 4
- Section 4 (`useFocusMode`): ✓ Task 5
- Section 5 (`FocusModeToggle`): ✓ Task 6
- Section 6 (`SessionPausedOverlay`): ✓ Task 7
- Section 7 (exit-confirm via Alert.alert): ✓ inside Task 5 (`useFocusMode` uses Alert.alert directly)
- Section 8 (wiring 3 practice files): ✓ Tasks 8, 9, 10
- Section 9 (polish backlog): ✓ Task 11
- Section 12 (rollout EAS APK): ✓ Task 12

All sections covered.

**Task ordering:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. Sequential dependencies: Task 3 (schema) must precede Task 4 (uses field). Task 4 (hook) must precede Tasks 8-10 (consumers). Tasks 6 + 7 (components) must precede Tasks 8-10 (consumers). Task 5 (useFocusMode) must precede Tasks 8-10 (consumers). Task 2 (jest mocks) must precede Tasks 4-10 (tests).

**Type / signature consistency:**
- `UseFocusModePref` interface: `{ enabled: boolean, setEnabled: (v) => void, loading: boolean }` — used consistently in Tasks 4, 8, 9, 10.
- `FocusModeState` interface: `{ isPaused, resumeSession, endSession }` — Tasks 5, 8, 9, 10.
- `UseFocusModeArgs`: `{ enabled, active, onTimerPause, onTimerResume, onExitConfirmed }` — Tasks 5, 8, 9, 10.
- `FocusModeToggle` props: `{ enabled, onToggle }` — Tasks 6, 8, 9, 10.
- `SessionPausedOverlay` props: `{ visible, timeRemainingSecs, onResume, onEnd }` — Tasks 7, 8, 9, 10.

**Placeholder scan:** No TBDs / "implement later" / vague test steps. All code blocks complete.

Self-review passes.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-pr10-focus-mode.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review (spec + quality) between tasks. Fast iteration in this session.

**2. Inline Execution** — Batch tasks in this session with checkpoints.

Which approach?
