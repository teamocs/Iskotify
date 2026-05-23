# Pull-to-Refresh Design

## Overview

Add native pull-to-refresh to all 5 bottom-tab screens (Home, Practice, Listings, Analytics, Profile). Each data-loading hook exposes a new `refresh()` async callback; each tab screen wraps its existing scrollable container in a `RefreshControl` that drives that callback. Pure JS, no new native modules — ships as an OTA update.

---

## 1. Per-hook contract

Every data-loading hook used by a tab screen gains a `refresh: () => Promise<void>` field in its return object. The function re-runs the same load logic that `useFocusEffect` already executes on focus, with two guarantees:

- **Awaitable**: returns after the SQLite query (and any sync call) settles, so the screen can flip `refreshing` back to `false`.
- **Reentrant-safe**: if `refresh()` is already in flight, a subsequent call short-circuits (`if (loadingRef.current) return`) to avoid concurrent queries.

The existing `useFocusEffect` is left in place — auto-refresh on focus still works, pull-to-refresh is an additional manual path.

**Hooks affected:**

| Hook | New return field | Behavior |
|---|---|---|
| `useHomeStats` | `refresh` | Re-runs the existing 6-query `Promise.all` (settings, listing, progress, fc, topics, focused listings) |
| `usePracticeData` | `refresh` | Re-runs the existing topics + decks SQLite query for the focused listing |
| `useFocusListings` | `refresh` | Re-runs local query AND calls `syncOnLaunch(db)` from `services/sync.ts` first (so the user gets "I pulled — listings reflect server"). `syncOnLaunch` already handles offline gracefully via its outer try/catch — failed network calls don't throw out of `refresh()` |
| `useAnalytics` | `refresh` | Re-runs the existing analytics aggregation query |

**Profile tab** does not use a dedicated hook today — the settings-load logic is inline in `apps/mobile/app/(tabs)/profile.tsx`. We extract it to a small `loadProfile()` function in the same file and expose it through a local `useCallback` so the screen can wire it to `RefreshControl`. No new hook file.

---

## 2. Per-screen wiring

Each tab adds three pieces:

1. **`refreshing` state:** `const [refreshing, setRefreshing] = useState(false)`
2. **`onRefresh` handler:** wraps the hook's `refresh()` in a try/finally that flips `refreshing` back to false:
   ```ts
   const onRefresh = useCallback(async () => {
     setRefreshing(true)
     try { await refresh() } finally { setRefreshing(false) }
   }, [refresh])
   ```
3. **`RefreshControl` on the existing scrollable container:**
   ```tsx
   <ScrollView
     refreshControl={
       <RefreshControl
         refreshing={refreshing}
         onRefresh={onRefresh}
         tintColor={t.accent}
         colors={[t.accent]}
         progressBackgroundColor={t.surface}
       />
     }
   >
   ```

`RefreshControl` is part of React Native core — no new dependency. iOS uses the system pull-down spinner; Android uses the Material circular indicator. Both honor reduced-motion accessibility settings.

---

## 3. Listings tab — sync semantics

The Listings tab is the only screen where "pull to refresh" should also pull from Supabase, not just re-read local SQLite. Without that, the user pulls down on Listings, the spinner spins for 50 ms, no new listings appear, and the gesture feels broken.

Updated `useFocusListings.refresh()` flow:

1. Call `syncOnLaunch(db)` from `apps/mobile/services/sync.ts` (existing helper that already wraps its Supabase calls in try/catch and silently no-ops when offline).
2. Re-query SQLite to get the freshly-synced rows.

If the sync fails (network blip, Supabase rate limit), step 2 still runs against the previous local data — the screen never goes blank.

Other tabs read local-only data; their `refresh()` does NOT call `syncOnLaunch()`.

---

## 4. File map

| File | Change |
|---|---|
| `apps/mobile/hooks/useHomeStats.ts` | Extract loader into a reusable `load()` function; expose `refresh` |
| `apps/mobile/hooks/usePracticeData.ts` | Same pattern |
| `apps/mobile/hooks/useFocusListings.ts` | Same pattern + optional `syncListings()` call when online |
| `apps/mobile/hooks/useAnalytics.ts` | Same pattern |
| `apps/mobile/app/(tabs)/index.tsx` | Add `refreshing` state + `RefreshControl` on Home ScrollView |
| `apps/mobile/app/(tabs)/practice.tsx` | Add `RefreshControl` |
| `apps/mobile/app/(tabs)/listings.tsx` | Add `RefreshControl` on FlatList |
| `apps/mobile/app/(tabs)/analytics.tsx` | Add `RefreshControl` |
| `apps/mobile/app/(tabs)/profile.tsx` | Extract `loadProfile()`, add `refreshing` + `RefreshControl` |

9 modified files, 0 new files, 0 native deps.

---

## 5. Testing approach

**Unit tests (hook-level):**

- For each modified hook, add a test asserting `refresh` is included in the returned shape AND that calling it re-runs the underlying load logic.
- Example for `useHomeStats`: render the hook, mock the DB to return new data on the second call, invoke `result.current.refresh()`, assert state contains the new data.

**Manual on-device validation** (not gated):

- Pull-down on each of the 5 tabs → spinner appears → settles within ~1 s → data reflects current state.
- Listings tab specifically: practice on a card, switch to Listings, pull-down → focused-listing accuracy updates if Supabase has refreshed (or just confirms local read works offline).
- Concurrent gesture: start pulling, release before threshold → no refresh triggered, spinner retracts cleanly.
- During an active refresh: try to pull again → second pull is a no-op via the reentrant guard in the hook.

---

## 6. Rollout

Single OTA bundle via `eas update --branch preview --message "feat(mobile): pull-to-refresh on all 5 tabs"`. No version bump (no native modules added).

---

## 7. Out of scope

- Long-press-to-refresh keyboard shortcut (not a thing on mobile)
- Server-push real-time updates (Supabase subscriptions — future work)
- Animations beyond what RefreshControl provides natively
- Custom spinner artwork (matching brand colors via `tintColor` / `colors` is enough)
