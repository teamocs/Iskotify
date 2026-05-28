# Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete local-notification system to the Iskotify mobile app — daily practice reminders, exam/deadline countdowns for focused listings, and a weekly weak-areas nudge — with a bell toggle button in the home screen header.

**Architecture:** No remote push server. All notifications are scheduled locally via `expo-notifications`. Toggle state persists in `userSettings.notificationsEnabled` (SQLite). The `notifications` service is pure (no React). The `useNotifications` hook wires the service to the DB and exposes `{ enabled, toggle }`. The `HomeScreen` passes its `focusedListings` data to the hook so countdowns can be scheduled correctly on every focus-screen visit.

**Tech Stack:** Expo managed workflow, `expo-notifications`, Drizzle ORM / expo-sqlite, TypeScript

---

## File Map

| Action | Path |
|--------|------|
| Modify | `apps/mobile/db/schema.ts` |
| Modify | `apps/mobile/db/client.ts` |
| Create | `apps/mobile/services/notifications.ts` |
| Create | `apps/mobile/hooks/useNotifications.ts` |
| Modify | `apps/mobile/app/(tabs)/index.tsx` |
| Modify | `apps/mobile/app/_layout.tsx` |
| Modify | `apps/mobile/app.json` |

---

## Task 1: Install `expo-notifications` + DB schema

**Files:**
- Modify: `apps/mobile/db/schema.ts`
- Modify: `apps/mobile/db/client.ts`

### Context

`expo-notifications` ships as an Expo SDK package — install via `npx expo install`. The `userSettings` table needs a `notificationsEnabled` boolean column (INTEGER 0/1 in SQLite). The migration system in `client.ts` uses a flat `MIGRATIONS` array where each entry is an SQL string; failed statements are silently caught (idempotent).

- [ ] **Step 1: Install expo-notifications**

```bash
cd apps/mobile && npx expo install expo-notifications
```

Expected: package added to `package.json`, no errors.

- [ ] **Step 2: Add `notificationsEnabled` to userSettings schema**

Open `apps/mobile/db/schema.ts`. Find:
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
})
```

Replace with:
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
})
```

- [ ] **Step 3: Add migration to client.ts**

Open `apps/mobile/db/client.ts`. Find the MIGRATIONS array. Add this as the last entry (before the closing `]`):
```ts
  `ALTER TABLE user_settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1`,
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `schema.ts` or `client.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat(mobile): install expo-notifications, add notificationsEnabled to userSettings"
```

---

## Task 2: Create `services/notifications.ts`

**Files:**
- Create: `apps/mobile/services/notifications.ts`

### Context

This is a pure service file — no React hooks, no DB access. It owns three responsibilities:
1. Request OS notification permissions
2. Schedule all Iskotify local notifications (given data from outside)
3. Cancel all Iskotify-owned notifications

**Notification schedule:**
- `'daily-practice'` — Daily at 9 AM: "Time to Study! 📚" / "Keep your streak going!"
- `'weekly-weak-areas'` — Weekly Sunday at 10 AM: "Review Weak Areas 🎯" / "Focus on your weak topics this week!"
- `'exam-7d-<slug>'` — One-shot 7 days before exam/deadline: "7 Days Left! 🎯"
- `'exam-3d-<slug>'` — One-shot 3 days before: "3 Days Left! 💪"
- `'exam-1d-<slug>'` — One-shot 1 day before: "TOMORROW! 🙌"

`setNotificationHandler` must be called once at module load. Identifier prefixes used to cancel our own notifications without touching any others.

- [ ] **Step 1: Create the file**

Create `apps/mobile/services/notifications.ts` with this content:

```ts
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export interface NotificationListing {
  slug: string
  title: string
  examDate: number | null
  deadline: number | null
}

const OUR_PREFIXES = ['exam-7d-', 'exam-3d-', 'exam-1d-']
const OUR_IDS     = ['daily-practice', 'weekly-weak-areas']

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === 'granted') return true
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function cancelAllIskotifyNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    scheduled
      .filter(n =>
        OUR_IDS.includes(n.identifier) ||
        OUR_PREFIXES.some(p => n.identifier.startsWith(p))
      )
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
  )
}

export async function scheduleIskotifyNotifications(
  listings: NotificationListing[]
): Promise<void> {
  await cancelAllIskotifyNotifications()

  // 1. Daily practice reminder — every day at 9 AM
  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-practice',
    content: {
      title: 'Iskotify — Time to Study! 📚',
      body: 'Keep your streak going and tackle those weak areas today!',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 9,
      minute: 0,
    },
  })

  // 2. Weekly weak-areas nudge — every Sunday at 10 AM
  //    weekday: 1 = Sunday in expo-notifications (1–7 Sun–Sat)
  await Notifications.scheduleNotificationAsync({
    identifier: 'weekly-weak-areas',
    content: {
      title: 'Iskotify — Review Weak Areas 🎯',
      body: 'Focus on your weak topics this week to boost your exam score!',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: 10,
      minute: 0,
    },
  })

  // 3. Exam/deadline countdowns
  const now = Date.now()
  for (const listing of listings) {
    const targets: Array<{ ms: number; label: string }> = []
    if (listing.examDate != null) targets.push({ ms: listing.examDate, label: listing.title })
    if (listing.deadline != null) targets.push({ ms: listing.deadline, label: `${listing.title} deadline` })

    for (const { ms, label } of targets) {
      const at7d = ms - 7 * 86_400_000
      const at3d = ms - 3 * 86_400_000
      const at1d = ms - 1 * 86_400_000

      if (at7d > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `exam-7d-${listing.slug}`,
          content: {
            title: 'Iskotify — 7 Days Left! 🎯',
            body: `${label} is in 7 days! Start your final review!`,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(at7d),
          },
        })
      }
      if (at3d > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `exam-3d-${listing.slug}`,
          content: {
            title: 'Iskotify — 3 Days Left! 💪',
            body: `${label} is in 3 days! Final push — you can do this!`,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(at3d),
          },
        })
      }
      if (at1d > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `exam-1d-${listing.slug}`,
          content: {
            title: 'Iskotify — TOMORROW! 🙌',
            body: `${label} is TOMORROW! You've got this!`,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(at1d),
          },
        })
      }
    }
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `services/notifications.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/services/notifications.ts
git commit -m "feat(mobile): add notifications service with daily/weekly/exam-countdown scheduling"
```

---

## Task 3: Create `hooks/useNotifications.ts`

**Files:**
- Create: `apps/mobile/hooks/useNotifications.ts`

### Context

This hook:
- Loads `notificationsEnabled` from DB on mount
- Exposes `enabled: boolean`, `schedule(listings)`, and `toggle(listings)`
- `schedule` — idempotent: if enabled, request permission + schedule; if disabled or permission denied, no-op
- `toggle` — flips enabled; if enabling, requests permission (reverts if denied); if disabling, cancels all

The hook does NOT use `useFocusEffect` — the caller (`HomeScreen`) decides when to call `schedule`.

- [ ] **Step 1: Create the file**

Create `apps/mobile/hooks/useNotifications.ts` with this content:

```ts
import { useState, useEffect, useCallback } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings } from '../db/schema'
import {
  requestNotificationPermissions,
  scheduleIskotifyNotifications,
  cancelAllIskotifyNotifications,
  type NotificationListing,
} from '../services/notifications'

export function useNotifications() {
  const db = useDb()
  const [enabled, setEnabled] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    db.select({ notificationsEnabled: userSettings.notificationsEnabled })
      .from(userSettings)
      .where(eq(userSettings.id, 1))
      .limit(1)
      .then(rows => {
        setEnabled(rows[0]?.notificationsEnabled ?? true)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [db])

  const schedule = useCallback(async (listings: NotificationListing[]) => {
    if (!ready || !enabled) return
    const granted = await requestNotificationPermissions()
    if (granted) {
      await scheduleIskotifyNotifications(listings).catch(e =>
        console.warn('[useNotifications] schedule error:', e)
      )
    }
  }, [ready, enabled])

  const toggle = useCallback(async (listings: NotificationListing[]) => {
    const next = !enabled
    setEnabled(next) // optimistic

    try {
      await db.update(userSettings)
        .set({ notificationsEnabled: next })
        .where(eq(userSettings.id, 1))

      if (next) {
        const granted = await requestNotificationPermissions()
        if (granted) {
          await scheduleIskotifyNotifications(listings)
        } else {
          // Permission denied — revert
          setEnabled(false)
          await db.update(userSettings)
            .set({ notificationsEnabled: false })
            .where(eq(userSettings.id, 1))
        }
      } else {
        await cancelAllIskotifyNotifications()
      }
    } catch (e) {
      console.error('[useNotifications] toggle error:', e)
      setEnabled(!next) // revert optimistic
    }
  }, [enabled, db])

  return { enabled, ready, schedule, toggle }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `hooks/useNotifications.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/hooks/useNotifications.ts
git commit -m "feat(mobile): add useNotifications hook for toggle + scheduling"
```

---

## Task 4: Update home screen — bell toggle button + auto-schedule

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

### Context

Three changes to `HomeScreen`:
1. Import `Bell1Outlined`, `Bell1Solid` from `@lineiconshq/free-icons` and `useNotifications`
2. Add `useEffect` that calls `schedule(focusedListings)` when home data loads
3. Add a bell button left of the settings gear in `greetRow`; bell is filled (`Bell1Solid`) when enabled, outlined (`Bell1Outlined`) when disabled

Current greetRow JSX (for reference):
```tsx
<View style={s.greetRow}>
  <View>
    <Text style={s.greetTime}>{timeGreeting()}</Text>
    <Text style={s.greetName}>{fullName.split(' ')[0] || 'Student'}</Text>
  </View>
  <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/settings')}>
    <Lineicons icon={Gear1Outlined} size={20} color="rgba(255,255,255,0.62)" />
  </TouchableOpacity>
</View>
```

- [ ] **Step 1: Add imports**

At the top of `apps/mobile/app/(tabs)/index.tsx`, find:
```ts
import { Gear1Outlined, Bolt2Outlined } from '@lineiconshq/free-icons'
```
Replace with:
```ts
import { Gear1Outlined, Bolt2Outlined, Bell1Outlined, Bell1Solid } from '@lineiconshq/free-icons'
```

Add after the existing hook imports (after `import { useAnalytics } from '../../hooks/useAnalytics'`):
```ts
import { useNotifications } from '../../hooks/useNotifications'
import { useEffect } from 'react'
```

Wait — `useEffect` and `useState` are already imported (check file). Actually `useState` is imported on line 1. Add `useEffect` to the same import:

Find:
```ts
import { useState } from 'react'
```
Replace with:
```ts
import { useState, useEffect } from 'react'
```

- [ ] **Step 2: Wire up useNotifications in HomeScreen**

In `HomeScreen`, after the lines that create `importantDays` and `practiceDays`, add:

```ts
const { enabled: notifEnabled, schedule: scheduleNotifs, toggle: toggleNotifs } = useNotifications()

// Auto-schedule notifications when focusedListings data loads
useEffect(() => {
  if (focusedListings.length > 0) {
    void scheduleNotifs(focusedListings)
  }
}, [focusedListings, scheduleNotifs])
```

- [ ] **Step 3: Update greetRow JSX — add bell button**

Find:
```tsx
        {/* Greeting row — ENLARGED */}
        <View style={s.greetRow}>
          <View>
            <Text style={s.greetTime}>{timeGreeting()}</Text>
            <Text style={s.greetName}>{fullName.split(' ')[0] || 'Student'}</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/settings')}>
            <Lineicons icon={Gear1Outlined} size={20} color="rgba(255,255,255,0.62)" />
          </TouchableOpacity>
        </View>
```

Replace with:
```tsx
        {/* Greeting row — ENLARGED */}
        <View style={s.greetRow}>
          <View>
            <Text style={s.greetTime}>{timeGreeting()}</Text>
            <Text style={s.greetName}>{fullName.split(' ')[0] || 'Student'}</Text>
          </View>
          <View style={s.headerBtns}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => void toggleNotifs(focusedListings)}
            >
              <Lineicons
                icon={notifEnabled ? Bell1Solid : Bell1Outlined}
                size={20}
                color={notifEnabled ? '#fca5a5' : 'rgba(255,255,255,0.40)'}
              />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/settings')}>
              <Lineicons icon={Gear1Outlined} size={20} color="rgba(255,255,255,0.62)" />
            </TouchableOpacity>
          </View>
        </View>
```

- [ ] **Step 4: Add `headerBtns` style**

In `s = StyleSheet.create({...})`, after the `iconBtn` style entry, add:
```ts
headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
```

- [ ] **Step 5: TypeScript check**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `index.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/(tabs)/index.tsx"
git commit -m "feat(mobile): add notification bell toggle to home screen header"
```

---

## Task 5: Configure app.json + set notification handler in _layout.tsx

**Files:**
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/app/_layout.tsx`

### Context

`app.json` needs the `expo-notifications` config plugin so the Android notification channel and icon are configured at build time. We reference `./assets/images/icon.png` as the notification icon (the full-color logo — Android will monochrome-adapt it) with the brand color tint `#831626`.

`_layout.tsx` needs to call `setNotificationHandler` — this actually already happens when `services/notifications.ts` is imported (module-level side-effect). However, we still need to ensure that the `AppInit` function calls `requestNotificationPermissions()` (and silently schedules) on startup so that permissions are requested the first time the user opens the app (rather than only when they visit the home screen).

- [ ] **Step 1: Update app.json — add expo-notifications plugin**

Open `apps/mobile/app.json`. Find:
```json
    "plugins": [
      "expo-router",
      "expo-sqlite",
      "expo-web-browser"
    ],
```

Replace with:
```json
    "plugins": [
      "expo-router",
      "expo-sqlite",
      "expo-web-browser",
      [
        "expo-notifications",
        {
          "icon": "./assets/images/icon.png",
          "color": "#831626",
          "androidMode": "default",
          "androidCollapsedTitle": "Iskotify"
        }
      ]
    ],
```

- [ ] **Step 2: Update _layout.tsx — import notification service + request permissions on startup**

Open `apps/mobile/app/_layout.tsx`. Add this import after the `LogoSvg` import:
```ts
import { requestNotificationPermissions } from '../services/notifications'
```

In `AppInit`, inside the `initialize` function, AFTER `onReady()` (so it doesn't block navigation), add:

Find inside `initialize`:
```ts
    } finally {
      onReady()  // hide the loading overlay
    }

    // Background sync — fire and forget, never blocks navigation
    syncOnLaunch(db).catch(e => console.warn('[layout] bg sync:', e))
```

Replace with:
```ts
    } finally {
      onReady()  // hide the loading overlay
    }

    // Background sync — fire and forget, never blocks navigation
    syncOnLaunch(db).catch(e => console.warn('[layout] bg sync:', e))

    // Request notification permission on first launch (non-blocking)
    requestNotificationPermissions().catch(e => console.warn('[layout] notif permission:', e))
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app.json apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): configure expo-notifications plugin in app.json, request permission on startup"
```

---

## Final: Push

- [ ] **Push all commits**

```bash
git push
```
