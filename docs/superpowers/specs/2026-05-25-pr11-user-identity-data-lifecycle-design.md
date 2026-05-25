# PR 11: User Identity & Data Lifecycle Fixes Design

## Overview

Four bundled bug fixes + UX additions to the mobile app, all centered on the user-identity / data-lifecycle area:

1. **Pre-assessment results reach analytics** — the 20-question onboarding assessment currently writes to `user_progress` with synthetic IDs that never JOIN to any flashcard, so all results are silently dropped. Switch to `practice_sessions` inserts (one per subject), which are picked up by both `useAnalytics` and `useHomeStats.computeWeakTopics`.

2. **Google sign-in restores prior progress** — current `pullUserData` only restores focus listings, saved listings, saved decks, and a partial settings row. It does NOT restore `user_progress` or `practice_sessions` (which `pushUserData` uploads). Result: signing back in to a previous account zeros out all progress. Fix `pullUserData` to restore everything `pushUserData` saves.

3. **Auth callback routes based on prior data** — currently always navigates to `/onboarding` after sign-in. Returning users with existing focus listings + profile should go straight to `/(tabs)`.

4. **Profile page Sign Out + Reset App Data** — add two new destructive actions to the profile screen. Sign Out is non-destructive (leaves local data, clears Supabase session, returns to landing). Reset App Data is nuclear (drops all SQLite rows, signs out, returns to landing).

Plus a fifth corollary: push to Supabase after every practice session / pre-assessment / focus list change, not just on launch.

JS-only OTA. No schema migration. Targets the v1.2.0 APK already installed.

---

## 1. Pre-assessment → per-subject `practice_sessions`

### Current state

`apps/mobile/app/onboarding.tsx` `handleAssessAnswer` (around lines 137–156): when the last question is answered, the code does:

```ts
for (const r of newAnswers) {
  await tx.insert(userProgress).values({
    flashcardId: r.q.id,    // e.g., 'pre-math-1' — synthetic ID
    correct: r.correct,
    answeredAt: now,
  })
}
```

The `flashcardId` values (`'pre-math-1'`, `'pre-science-2'`, etc.) don't exist in the `flashcards` table. `computeWeakTopics` in `useHomeStats.ts` builds a `fcMap` from real flashcards and drops rows whose ID isn't in the map. `useAnalytics` reads from `practice_sessions` directly and never sees `user_progress` at all. So the pre-assessment is invisible to both screens.

### Changes

**`apps/mobile/app/onboarding.tsx`:**

Replace the `userProgress` loop in `handleAssessAnswer` with per-subject `practice_sessions` inserts. The 5 subjects come from the `PreAssessQuestion.subject` field already defined in `apps/mobile/data/preAssessment.ts`:

```ts
const PRE_ASSESS_SUBJECTS = ['Mathematics', 'Science', 'English', 'Abstract Reasoning', 'Filipino'] as const

if (assessIdx === PRE_ASSESS_QUESTIONS.length - 1) {
  const now = Date.now()
  // Group by subject and count correct vs total per subject
  const grouped = new Map<string, { correct: number; total: number }>()
  for (const r of newAnswers) {
    const s = grouped.get(r.q.subject) ?? { correct: 0, total: 0 }
    s.total++
    if (r.correct) s.correct++
    grouped.set(r.q.subject, s)
  }
  void db.transaction(async tx => {
    for (const subject of PRE_ASSESS_SUBJECTS) {
      const s = grouped.get(subject)
      if (!s || s.total === 0) continue
      await tx.insert(practiceSessions).values({
        listingSlug: '',
        topicId: `pre-assess-${subject}`,
        deckId: '',
        score: s.correct,
        total: s.total,
        durationSecs: 0,
        completedAt: now,
      })
    }
  }).catch(e => console.warn('[onboarding] save assess error:', e))
  setAssessAnswers(newAnswers)
  setAssessDone(true)
}
```

Remove the existing `userProgress` import from this file (no longer used here).

### Display tweak

`practice_sessions.topicId` is a text field with no foreign key, so storing `'pre-assess-Mathematics'` is legal but won't match anything in `topics`. Both display callers (`useHomeStats.computeWeakTopics` and `useAnalytics`) currently do `topicMap.get(p.topicId) ?? p.topicId` — for synthetic IDs the fallback returns the literal ID.

Add a small helper in `apps/mobile/utils/topicLabel.ts` (NEW FILE):

```ts
const PRE_ASSESS_PREFIX = 'pre-assess-'

/**
 * Given a topic identifier (real DB topic id OR a synthetic pre-assess id),
 * return a human-readable display label.
 *
 *   resolveTopicLabel('t1', topicMap)        → 'Algebra'  (from topicMap)
 *   resolveTopicLabel('pre-assess-Math', _)  → 'Pre-Assessment: Math'
 *   resolveTopicLabel('unknown-id', topicMap) → 'unknown-id'  (fallback)
 */
export function resolveTopicLabel(
  topicId: string,
  topicMap: Map<string, string>,
): string {
  const mapped = topicMap.get(topicId)
  if (mapped) return mapped
  if (topicId.startsWith(PRE_ASSESS_PREFIX)) {
    return `Pre-Assessment: ${topicId.slice(PRE_ASSESS_PREFIX.length)}`
  }
  return topicId
}
```

Update both consumers:
- `apps/mobile/hooks/useHomeStats.ts` line 75: `topicMap.get(tid) ?? tid` → `resolveTopicLabel(tid, topicMap)`
- `apps/mobile/hooks/useAnalytics.ts` wherever it renders the topic label

The threshold for "weak topic" is `accuracy < 60` (existing rule). Pre-assessment subjects that score below 60% appear automatically as weak areas.

### Why this works

- No schema migration — just changes what gets written.
- Pre-assessment immediately visible in:
  - **Home screen weak topics** (via `computeWeakTopics` → `useHomeStats`)
  - **Analytics topic mastery** (via `useAnalytics.computeTopicMastery`)
  - **Analytics recent sessions** (latest 5 sessions list)
- Pushes to Supabase automatically on next launch via existing `pushUserData` flow.

---

## 2. Fix `pullUserData` to restore full state

### Current state

`apps/mobile/services/sync.ts` lines 48–116. The function pulls 4 data types: focus listings, saved listings, saved decks, settings. Settings only restores 5 fields (`googleId`, `email`, `fullName`, `school`, `gradeLevel`). It DOES NOT touch `user_progress`, `practice_sessions`, or the rest of `user_settings` (`selectedListingSlug`, `notificationsEnabled`, `theme`, `focusModeEnabled`).

Meanwhile `pushUserData` (lines 22–45) uploads ALL 6 data types including `user_progress` and `practice_sessions`. Asymmetric: push-everything, pull-some.

### Changes

Inside the `db.transaction((tx) => { ... })` block in `pullUserData`, ADD these blocks after the existing focus / saved listings / saved decks restores, BEFORE the settings block:

```ts
// Restore practice sessions — Supabase is source of truth at sign-in time
const remoteSessions: typeof practiceSessions.$inferInsert[] = data.practice_sessions ?? []
if (remoteSessions.length > 0) {
  tx.delete(practiceSessions).run()
  for (const row of remoteSessions) {
    tx.insert(practiceSessions).values(row).run()
  }
}

// Restore user progress (same approach)
const remoteProgress: typeof userProgress.$inferInsert[] = data.user_progress ?? []
if (remoteProgress.length > 0) {
  tx.delete(userProgress).run()
  for (const row of remoteProgress) {
    tx.insert(userProgress).values(row).run()
  }
}
```

REPLACE the existing settings block (currently lines 90–114) with a full-row restore that includes all writeable settings fields:

```ts
const remoteSettings = data.settings as Partial<typeof userSettings.$inferInsert> | null
if (remoteSettings) {
  const settingsValues = {
    id: 1,
    googleId: remoteSettings.googleId ?? '',
    email: remoteSettings.email ?? '',
    fullName: remoteSettings.fullName ?? '',
    school: remoteSettings.school ?? '',
    gradeLevel: remoteSettings.gradeLevel ?? null,
    selectedListingSlug: remoteSettings.selectedListingSlug ?? '',
    lastSyncedAt: 0,  // force catalog re-sync on next launch
    notificationsEnabled: remoteSettings.notificationsEnabled ?? true,
    theme: remoteSettings.theme ?? 'system',
    focusModeEnabled: remoteSettings.focusModeEnabled ?? true,
  }
  tx.insert(userSettings).values(settingsValues)
    .onConflictDoUpdate({ target: userSettings.id, set: settingsValues })
    .run()
}
```

Key change: the new INSERT covers ALL settings fields, and the `onConflictDoUpdate.set` is the SAME object — so both insert path (fresh local DB) and update path (existing local row) produce identical results.

### Why the `tx.delete` then `tx.insert` pattern

For `practice_sessions` and `user_progress`, the local rows might already exist if the user signed out and back in without uninstalling. Supabase has the canonical state. Wipe local, restore from remote. This is safe inside a single transaction — if the insert fails, the delete rolls back too.

For `focus_listings` and `saved_*` — the existing `onConflictDoUpdate` pattern is fine because those tables have predictable primary keys (slug / id) that map 1:1 between local and remote.

---

## 3. `auth/callback.tsx` routes based on prior data

### Current state

`apps/mobile/app/auth/callback.tsx` lines 60–62: after `pullUserData(db)`, ALWAYS does `router.replace('/onboarding')`. Even for a returning user with full progress, settings, focus listings, the app dumps them into onboarding's "tell us about yourself" screen.

### Changes

After the `pullUserData(db)` call, query the local DB to determine whether the user is returning (has profile + focus listings) or new (empty state):

```ts
await pullUserData(db)

// Decide where to land based on whether the user has prior data restored
const [settingsRows, focusRows] = await Promise.all([
  db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
  db.select().from(focusListings).limit(1),
])
const hasProfile = !!(settingsRows[0]?.fullName?.trim())
const hasFocus = focusRows.length > 0

if (hasProfile && hasFocus) {
  router.replace('/(tabs)')  // returning user with restored data
} else {
  router.replace('/onboarding')  // new account or incomplete onboarding
}
```

Imports to add: `eq` from `drizzle-orm`, `focusListings` from `'../../db/schema'`.

### Simplify the pre-pull insert

The current local-side `userSettings` insert (callback.tsx lines 42–58) tries to seed `googleId`/`email`/`fullName` from Google's `user_metadata` BEFORE pulling — but `pullUserData`'s settings restore now writes those fields too, so the pre-pull insert is redundant for returning users. For NEW users it ensures the row exists for `pullUserData` to merge against.

Keep the pre-pull insert AS-IS for new users — but remove the `selectedListingSlug: ''` and `lastSyncedAt: 0` initialization (since `pullUserData` now writes them properly). The new shape:

```ts
await db.insert(userSettings)
  .values({
    id: 1,
    googleId: user.id,
    email: user.email ?? '',
    fullName: user.user_metadata?.full_name ?? '',
  })
  .onConflictDoUpdate({
    target: userSettings.id,
    set: {
      googleId: user.id,
      email: user.email ?? '',
      fullName: user.user_metadata?.full_name ?? '',
    },
  })
```

Drizzle accepts a partial value object as long as remaining columns have defaults — verify against the schema. `selectedListingSlug` defaults to `''`, `lastSyncedAt` defaults to `0`, `notificationsEnabled` defaults to `true`, `theme` defaults to `'system'`, `focusModeEnabled` defaults to `true`. All good.

---

## 4. Profile page — Sign Out + Reset App Data buttons

### Current state

`apps/mobile/app/(tabs)/profile.tsx` has Export + Import buttons (PR 6) but no sign-out or factory-reset action.

### Changes

Add two new SettingsRow entries to the existing Data section in the profile page. Order: Export Data, Import Data, Sign Out, **separator**, Reset App Data.

**Sign Out handler:**

```ts
async function handleSignOut() {
  Alert.alert(
    'Sign Out?',
    'Your local progress stays on this device. Your cloud backup is safe.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut()
          } catch (err) {
            console.warn('[profile] signOut failed:', err)
          }
          router.replace('/landing')
        },
      },
    ],
  )
}
```

**Reset App Data handler:**

```ts
async function handleResetAppData() {
  Alert.alert(
    'Reset App Data?',
    'This will permanently delete ALL local data on this device (progress, focus listings, settings) and sign you out. Your cloud backup (if you signed in) is unaffected.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset Everything',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.transaction((tx) => {
              tx.delete(userProgress).run()
              tx.delete(practiceSessions).run()
              tx.delete(focusListings).run()
              tx.delete(savedListings).run()
              tx.delete(savedDecks).run()
              tx.delete(userSettings).run()
              tx.delete(userRequirements).run()
              tx.delete(coachPhrases).run()  // cached AI output, not catalog data
            })
            await supabase.auth.signOut()
          } catch (err) {
            console.warn('[profile] reset failed:', err)
          }
          router.replace('/landing')
        },
      },
    ],
  )
}
```

UI: two new SettingsRow entries. Use Lineicons:
- `LogOutOutlined` for Sign Out, normal text color
- `TrashOutlined` for Reset App Data, accent-text color (red) to signal destructive

The Reset row gets `iconBg` set to a transparent red tint to visually separate it from non-destructive rows.

Imports needed in profile.tsx:
- `Alert` from `react-native` (already imported)
- `supabase` from `'../../services/supabase'`
- All 8 table refs from `'../../db/schema'`: `userSettings, userProgress, practiceSessions, focusListings, savedListings, savedDecks, userRequirements, coachPhrases`

### Why no separate confirmation modal component

The standard pattern in this codebase is `Alert.alert(...)` with a destructive button — used in PR 6 (Export Failed) and PR 10 (Focus Mode exit confirm). Reusing keeps consistency.

---

## 5. Backup timing — push after every state change

### Current state

`pushUserData(db)` only runs at the end of `syncOnLaunch` (line 209 of sync.ts). If a user does a practice session then uninstalls before next launch, the session is lost from cloud.

### Changes

Add explicit calls to `pushUserData(db)` after these state-changing events:

**A. End of `recordSession()` in `apps/mobile/hooks/useRecordSession.ts`** — fire-and-forget, never blocks UI:

```ts
import { pushUserData } from '../services/sync'

// existing recordSession function — at the very end after the practice_sessions insert:
void pushUserData(db).catch(err => console.warn('[recordSession] push failed:', err))
```

**B. End of pre-assessment onboarding** in `apps/mobile/app/onboarding.tsx`. After the per-subject practice_sessions inserts (Section 1), add:

```ts
void pushUserData(db).catch(err => console.warn('[onboarding] push failed:', err))
```

(The existing `syncOnLaunch(db)` call in `handleConfirmListings` already pushes — pre-assessment happens AFTER `handleConfirmListings` so we need an explicit push here.)

**C. After `addListing` / `removeListing` in `apps/mobile/hooks/useFocusListings.ts`** — fire-and-forget:

```ts
void pushUserData(db).catch(() => { /* best-effort backup */ })
```

Three new call sites. Each is a single line. Total cost: 1 extra Supabase write per user action (session end / pre-assess end / focus list change). Network-cheap.

### Why not push on every settings change?

Theme switch, focus mode toggle, notification toggle — these change frequently and push isn't critical for them. They get picked up on next launch via `syncOnLaunch`. Adding push to every settings tap would be excessive.

---

## 6. File map

**Modified source files (~7):**

| File | Change |
|---|---|
| `apps/mobile/app/onboarding.tsx` | Replace user_progress inserts with per-subject practice_sessions inserts. Add pushUserData call. Drop userProgress import. |
| `apps/mobile/services/sync.ts` | `pullUserData` restores user_progress + practice_sessions + full settings. |
| `apps/mobile/app/auth/callback.tsx` | Route to `/(tabs)` or `/onboarding` based on hasProfile + hasFocus. Drop the redundant pre-pull settings fields. |
| `apps/mobile/app/(tabs)/profile.tsx` | Add Sign Out + Reset App Data rows with Alert handlers. |
| `apps/mobile/hooks/useRecordSession.ts` | Fire-and-forget pushUserData call after session insert. |
| `apps/mobile/hooks/useFocusListings.ts` | Fire-and-forget pushUserData after addListing / removeListing. |
| `apps/mobile/hooks/useHomeStats.ts` | `computeWeakTopics` uses `resolveTopicLabel`. |
| `apps/mobile/hooks/useAnalytics.ts` | Topic mastery list uses `resolveTopicLabel`. |

**New file (1):**

| File | Responsibility |
|---|---|
| `apps/mobile/utils/topicLabel.ts` | `resolveTopicLabel(topicId, topicMap)` helper for the `pre-assess-*` synthetic IDs. |

**Test files updated (~5):**

| File | Change |
|---|---|
| `apps/mobile/app/__tests__/onboarding.test.tsx` | Assertion that 5 practice_sessions inserts happen (per subject), 0 user_progress inserts. |
| `apps/mobile/services/__tests__/sync.test.ts` (NEW) | Tests for pullUserData restoring all 6 data types from a mock Supabase response. |
| `apps/mobile/app/(tabs)/__tests__/profile.test.tsx` | Sign Out + Reset App Data buttons render. Tapping each triggers Alert. Confirming Reset calls the 7 delete statements + signOut. |
| `apps/mobile/hooks/__tests__/useHomeStats.test.ts` | New test: pre-assess synthetic IDs render as "Pre-Assessment: <Subject>". |
| `apps/mobile/utils/__tests__/topicLabel.test.ts` (NEW) | Unit tests for `resolveTopicLabel` — 3 cases (real id, pre-assess prefix, unknown id). |

---

## 7. Testing approach

**Unit tests (Jest):**

- `topicLabel.test.ts` — 3 tests covering the resolver function paths.
- `sync.test.ts` — mock Supabase response with all 6 data arrays. Assert tx.delete + tx.insert called for practice_sessions and user_progress. Assert settings.set object has all 11 fields.
- `onboarding.test.tsx` — already mocks `db` — extend to assert 5 inserts into `practiceSessions` table when assessment completes, ZERO inserts into `userProgress`.
- `useHomeStats.test.ts` — feed mock progress with a `pre-assess-Mathematics` topic ID. Assert weakTopics output has `topicName: 'Pre-Assessment: Mathematics'`.
- `profile.test.tsx` — render the screen. Tap "Sign Out" → assert Alert.alert called with destructive button. Programmatically invoke the destructive button → assert `supabase.auth.signOut` called + `router.replace('/landing')`.

**Manual on-device validation (post-OTA):**

1. Fresh install (uninstall first if needed). Sign in to a brand-new Google account → goes to landing → enters onboarding flow.
2. Complete onboarding including pre-assessment. Open Analytics → see 5 "Pre-Assessment: <Subject>" entries in topic mastery + recent sessions. Open Home → if any subject scored < 60%, it appears in Weak Topics.
3. Practice a real session. Sign out (Profile → Sign Out → confirm). Returns to landing.
4. Sign back in to the SAME Google account → goes DIRECTLY to tabs (not onboarding). Analytics shows pre-assessment + the practice session you did before signing out. Home shows your focus listings restored.
5. Tap Reset App Data → confirm → returns to landing. Local DB is empty. Sign in again to same account → all data restored from Supabase.
6. Test on a SECOND device: install app, sign in to same Google account → all progress + focus list + settings + focus mode preference appear immediately.

---

## 8. Rollout

JS-only OTA, single push:

```bash
cd apps/mobile
eas update --branch preview --environment preview \
  --message "fix(mobile): pre-assess analytics + Google sign-in restore + profile sign-out/reset"
```

No version bump. No native module change. Targets v1.2.0 APK.

---

## 9. Out of scope

- **Multi-device conflict resolution** — if user is signed in on phone A and phone B simultaneously and both push, last-write-wins. No CRDT. Acceptable for current scale.
- **Selective restore** — user can't choose "restore my progress but keep my current focus list". All-or-nothing pull.
- **Pre-assessment retake** — once completed during onboarding, no UI to redo. Users can manually clear practice_sessions via Reset App Data + onboarding flow.
- **Migration of existing users' broken pre-assessment** `user_progress` rows — they're already orphan data. Leave them; they don't hurt anything.
- **Server-side data validation** — Supabase RLS still permits any signed-in user to push any payload to their own row. No additional schema validation.
- **Email change tracking** — if user changes Google email on Google's side, we don't track the linkage. They appear as a new account.
- **Cross-account merge** — sign in as A, do work, sign out, sign in as B, sign out, sign back in as A → no automatic merge of A's two devices.
- **Push notifications about data restore** — silent restore, no toast.
- **Profile editing** (changing name / school / grade post-onboarding) — separate UX project.
