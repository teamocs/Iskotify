# Multi-Focus Listings, Session Recording & Analytics — Design Spec

**Date:** 2026-05-18
**Status:** Approved — ready for implementation planning

---

## Overview

Iskotify users currently prepare for a single exam or scholarship. This feature upgrades the app to support multiple simultaneous focus listings (exams + scholarships), each with its own practice folder, session recording, and analytics. Priority order is set at onboarding and managed in Settings.

---

## Decision Log (from design session)

| Question | Decision |
|---|---|
| Practice folder structure | Focus cards at top of Practice tab; tapping switches Quick Start + Recommended context |
| Onboarding multi-select UX | Numbered priority badges on cards + live drag-to-reorder tray at bottom |
| Analytics placement | New 5th Analytics tab + mini entry card on Home tab |
| Post-onboarding focus management | Settings → My Focus List section with drag-to-reorder and ✕ remove |
| Architecture | Approach 2: new `focusListings` + `practiceSessions` tables |

---

## 1. Data Model

### 1.1 New table: `focusListings`

```ts
export const focusListings = sqliteTable('focus_listings', {
  listingSlug: text('listing_slug').primaryKey(),
  priority:    integer('priority').notNull(),  // 1 = highest priority
  addedAt:     integer('added_at').notNull(),  // Unix ms timestamp
})
```

- One row per listing the user is actively focusing on.
- Priority 1 listing always mirrors `userSettings.selectedListingSlug` (kept in sync by `syncPrimaryListing()`).
- Reorder: `UPDATE focus_listings SET priority = ? WHERE listing_slug = ?` for each row in a transaction.
- Remove: `DELETE FROM focus_listings WHERE listing_slug = ?` + re-number remaining priorities + call `syncPrimaryListing()`.
- No foreign key to `listings` table — listing data may not be synced yet when a focus entry is created during onboarding.

### 1.2 New table: `practiceSessions`

```ts
export const practiceSessions = sqliteTable('practice_sessions', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  listingSlug:  text('listing_slug').notNull().default(''),   // focus context at launch; '' = no focus context
  topicId:      text('topic_id').notNull().default(''),        // set for topic-based sessions
  deckId:       text('deck_id').notNull().default(''),         // set for deck-based sessions
  score:        integer('score').notNull().default(0),         // correct answer count
  total:        integer('total').notNull().default(0),         // questions attempted
  durationSecs: integer('duration_secs').notNull().default(0), // wall-clock seconds
  completedAt:  integer('completed_at').notNull(),             // Unix ms timestamp
})
```

- One row per **completed** quiz. Abandoned sessions (back button mid-quiz) are not recorded.
- `listingSlug` is the focus card active at quiz launch time — captured as a prop/param so switching focus mid-session does not corrupt attribution.
- Exactly one of `topicId` or `deckId` is non-empty per row.

### 1.3 Schema migrations (append to `MIGRATIONS[]` in `client.ts`)

```ts
`CREATE TABLE IF NOT EXISTS focus_listings (
  listing_slug TEXT PRIMARY KEY,
  priority INTEGER NOT NULL,
  added_at INTEGER NOT NULL
)`,

`CREATE TABLE IF NOT EXISTS practice_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_slug TEXT NOT NULL DEFAULT '',
  topic_id TEXT NOT NULL DEFAULT '',
  deck_id TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  duration_secs INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER NOT NULL
)`,

// Seed focus_listings from existing single-listing selection so no existing user loses their setup
`INSERT OR IGNORE INTO focus_listings (listing_slug, priority, added_at)
 SELECT selected_listing_slug, 1, ${Date.now()}
 FROM user_settings WHERE id = 1 AND selected_listing_slug != ''`,
```

### 1.4 `userSettings` — no new columns

`selectedListingSlug` is kept in sync with the #1 priority `focusListings` row at all times via `syncPrimaryListing()`. All existing consumers (`useHomeStats`, `usePracticeData`, `sync.ts`) continue reading from `userSettings` without modification.

---

## 2. Sync Architecture

### 2.1 Multi-slug sync in `services/sync.ts`

```ts
// Read all focus slugs ordered by priority
const focusRows = await db.select().from(focusListings).orderBy(asc(focusListings.priority))
const slugs = focusRows.map(r => r.listingSlug).filter(Boolean)

// Run one sync pass per slug in parallel (safe, avoids Supabase contains() edge cases)
await Promise.all(slugs.map(slug => syncSlug(db, slug)))
```

`syncSlug(db, slug)` is the existing single-slug sync logic extracted into a helper. Each call fetches flashcards where `listing_slugs contains [slug]` from Supabase and upserts locally.

### 2.2 `syncPrimaryListing(db)` helper

Called after every `focusListings` mutation (add, remove, reorder):

```ts
async function syncPrimaryListing(db: DrizzleDB) {
  const top = await db.select().from(focusListings)
    .orderBy(asc(focusListings.priority)).limit(1)
  await db.update(userSettings)
    .set({ selectedListingSlug: top[0]?.listingSlug ?? '' })
    .where(eq(userSettings.id, 1))
}
```

If the focus list is emptied, `selectedListingSlug` is set to `''`, matching current empty-state behaviour.

### 2.3 Adding a new listing mid-session

When `addListing(slug)` is called (from Listings detail or Settings):
1. Insert into `focusListings` with `priority = currentMax + 1`.
2. Call `syncPrimaryListing()`.
3. Kick off `syncSlug(db, slug)` in the background — does not block UI.
4. UI shows the new focus card immediately; card count updates once sync completes.

---

## 3. New & Updated Hooks

### 3.1 `useFocusListings.ts` (new)

```ts
interface FocusListing {
  listingSlug: string
  priority: number
  addedAt: number
  listing: ListingRow | null  // joined from local listings table; null if not yet synced
}

export function useFocusListings() {
  return {
    focusListings: FocusListing[]       // ordered by priority asc
    addListing(slug: string): Promise<void>
    removeListing(slug: string): Promise<void>
    reorder(orderedSlugs: string[]): Promise<void>  // full re-priority in one transaction
    isInFocus(slug: string): boolean
  }
}
```

`reorder()` accepts the full ordered slug array and runs a single transaction updating all `priority` values, then calls `syncPrimaryListing()`.

### 3.2 `usePracticeData.ts` (update)

`recommendedTopics` continues using `selectedListingSlug` (primary listing). No other changes to this hook.

The Practice tab uses **both** `useFocusListings` (for the focus cards row and active-card switching) and `usePracticeData` (for recommended topics, topic list, and deck list). These are separate hook calls — no cross-dependency needed.

### 3.3 `useRecordSession.ts` (new)

```ts
export function useRecordSession() {
  const db = useDb()
  return async (opts: {
    listingSlug: string
    topicId?: string
    deckId?: string
    score: number
    total: number
    durationSecs: number
  }) => {
    await db.insert(practiceSessions).values({
      ...opts,
      topicId: opts.topicId ?? '',
      deckId: opts.deckId ?? '',
      completedAt: Date.now(),
    })
  }
}
```

Called at quiz completion in `[topicId].tsx` and `deck/[deckId].tsx` — in the same `db.transaction()` block that already writes `userProgress`.

### 3.4 `useAnalytics.ts` (new)

```ts
export function useAnalytics(listingSlug: string | 'overall') {
  return {
    sessionCount: number
    avgAccuracy: number           // 0–100
    streakDays: number
    totalCardsAnswered: number
    weeklyAccuracy: number[]      // 7 values, index 0 = 7 days ago, index 6 = today
    topicMastery: Array<{ topicId, name, accuracy, cardCount }>  // sorted worst first
    recentSessions: Array<{ id, title, score, total, durationSecs, completedAt, pass }>
    deltaSessionCount: number     // vs prior 7 days
    deltaAvgAccuracy: number      // vs prior 7 days
  }
}
```

All values derived from `practiceSessions` (for session-based metrics) and `userProgress` (for topic mastery). `listingSlug = 'overall'` aggregates across all rows.

---

## 4. Onboarding Changes (`app/onboarding.tsx`)

### Step structure: 4 steps (was 3)

| Step | Content | Change |
|---|---|---|
| 1 | Profile (name, school, grade) | No change |
| 2 | Focus listing multi-select | **Rewritten** — multi-select with priority tray |
| 3 | Pre-assessment quiz | No change — uses #1 priority listing |
| 4 | Results + focus summary | **New** — shows score + confirmed focus list before entering app |

### Step 2 UX (multi-select + priority tray)

- Listing cards are shown fetched from Supabase (same query as before).
- Tapping an unselected card: appends to selection, shows numbered badge (1, 2, 3…).
- Tapping a selected card: removes it from selection, re-numbers remaining badges.
- A live priority tray at the bottom shows the current selection order with drag handles (using `react-native-draggable-flatlist`). Dragging in the tray reorders the badge numbers on the cards.
- CTA button: "Continue with N →" (disabled until ≥1 selected).
- On Continue:
  1. Write all selected slugs to `focusListings` in priority order.
  2. Call `syncPrimaryListing()`.
  3. Call `syncOnLaunch(db)` (now multi-slug aware).
  4. Progress to Step 3.

### Step 4 (new — results + confirmation)

- Shows pre-assessment score card.
- Shows the user's confirmed focus list (priority 1, 2, …) with card counts.
- "Start Studying →" navigates to `/(tabs)`.

### Progress indicator

4 dots instead of 3. Current step dot expands to pill shape (existing pattern).

---

## 5. Practice Tab (`app/(tabs)/practice.tsx`)

### Layout (top to bottom)

1. **Header** — "Practice" title + "N listings in focus" subtitle + "+ Add" link (→ Listings tab)
2. **My Focus** section label
3. **Focus cards row** — horizontal scroll, one card per `focusListings` entry ordered by priority + a "+" add card at the end
4. **Quick Start** section (context-sensitive to active focus card):
   - *Full Review Deck* — virtual auto-deck: all topics tagged for active listing slug, launched directly into `[topicId].tsx` quiz with the listing's slug as session context
   - *Weak Topics Only* — virtual smart deck: topics with <60% accuracy AND tagged for active listing; hidden if none exist
5. **Recommended** section (existing, now filtered by active focus card's slug instead of singleton)
6. Divider
7. **All Topics** section (existing — subject chips + topic list, unchanged)
8. **My Decks** section (existing — user-created decks, unchanged)

### Focus card behaviour

- Active card: maroon border + pink underline bar
- Inactive cards: dim style
- Tapping an inactive card: sets it as active (local state only — does not change `focusListings` priority)
- Default active card on mount: priority 1 listing

### Virtual decks (no new DB rows)

- Full Review Deck navigates to a new route `app/practice/listing/[slug].tsx` which queries `WHERE listingSlugs contains slug` and launches the standard gamified quiz engine.
- Weak Topics Only uses the same route but pre-filters to `accuracy < 0.6` topics.
- Session is recorded with `listingSlug` = the active focus card's slug.

### Session recording integration

Both `app/practice/[topicId].tsx` and `app/practice/deck/[deckId].tsx` accept a `listingSlug` route param (optional, defaults to `''`). The quiz result screen calls `useRecordSession()` in the same transaction as `userProgress` writes.

---

## 6. Listings Tab (`app/(tabs)/listings.tsx`)

### List view changes

Each listing card gains a focus status element (right of the type badge, left of the bookmark):

- In focus at priority N → `#N Focus` badge (maroon tint, darker for lower priorities)
- Not in focus → `+ Focus` dashed badge (read-only on list — tap navigates to detail)

No other changes to the list view, filtering, search, or sort.

### Detail page changes (`app/listings/[slug].tsx`)

Below the hero card, a new focus action block replaces/supplements the existing "Start Practicing" CTA:

**Not in focus:**
```
[+ Add to My Focus]  ← full-width maroon button
```
On tap: `addListing(slug)` → background sync → shows confirmation toast "Added to focus!" → button state updates to "In Focus".

**In focus:**
```
[✓ In Your Focus — #N Priority]   ← green indicator row
[Remove from Focus]                ← subdued red text link below
```
Remove: calls `removeListing(slug)` → promotes remaining priorities → shows "Removed from focus" toast.

The existing "Start Practicing →" CTA remains below the focus block, unchanged.

---

## 7. Settings Screen (`app/(tabs)/settings.tsx` or equivalent)

### My Focus List section (new, inserted below Profile card)

```
[Section label: MY FOCUS LIST]
[Priority 1 row: ⠿ 🎓 UPCAT 2025 · 96 cards synced    ✕]
[Priority 2 row: ⠿ ✨ DOST SEI · 48 cards synced        ✕]
[+ Add from Listings]   ← dashed button, navigates to Listings tab
```

- Rows rendered by `DraggableFlatList` from `react-native-draggable-flatlist`.
- Drag handle (⠿) activates reorder; on drop calls `reorder(newSlugsArray)`.
- ✕ button calls `removeListing(slug)` with inline confirmation toast (no modal).
- "+ Add from Listings" calls `router.push('/(tabs)/listings')`.
- If focus list is empty: shows an empty-state message "No listings in focus yet. Add one from Listings."

### Existing sections — unchanged

Profile card (Edit), App (About / Help / Privacy), Data (Export), Appearance (Theme - coming soon) all stay in the same order below My Focus List.

---

## 8. Analytics Screen (new — `app/(tabs)/analytics.tsx`)

### Navigation

Added as the 4th item in the bottom tab navigator (between Listings and Settings):
`Home | Practice | Listings | Analytics | Settings`

The existing 4-tab layout becomes 5 tabs.

### Screen layout (top to bottom)

1. **Header** — "Analytics" title + "Your study performance" subtitle
2. **Listing filter tabs** — one pill per `focusListings` entry (ordered by priority) + "Overall" tab; default = priority 1 listing
3. **Stats grid** — 2×2 card grid:
   - Sessions (COUNT from `practiceSessions`)
   - Avg Accuracy (AVG of score/total × 100)
   - Day Streak (consecutive days with ≥1 session; streak resets at midnight PH time)
   - Cards Answered (SUM of total across sessions)
   - Each card shows a delta vs. prior 7 days where meaningful
4. **Accuracy — This Week** — 7-bar chart (last 7 days, height = avg daily accuracy; empty day = 5% stub)
5. **Topic Mastery** — progress bars for each topic tagged to active listing, sorted worst-first, sourced from `userProgress`
6. **Recent Sessions** — last 10 sessions for active filter; shows topic/deck name, date, score fraction, duration, pass/fail icon (≥60% = pass)

### `useAnalytics` queries

All queries run against local SQLite only — no network calls.

- Filter by listing: `WHERE listing_slug = ?` (or no filter for Overall)
- Streak: group `practiceSessions` by calendar day using local device time (same approach as existing `useHomeStats` streak), find longest tail of consecutive days ending today
- Weekly chart: group by day for last 7 days, compute AVG(score/total) per day
- Topic mastery: reuse `computeStrength` logic from `usePracticeData` but return raw accuracy % rather than strength label

### Home tab entry point

Below the existing streak/accuracy stat row on the Home tab:

1. **Mini bar chart** — 7-day accuracy bars (same data as Analytics, smaller render)
2. **"📊 Full Analytics" card** — maroon-tinted card with arrow, `onPress={() => router.push('/(tabs)/analytics')}`

Both are added after the existing stat cards and before the "Weak Topics" section. No changes to `useHomeStats`.

---

## 9. New Route: `app/practice/listing/[slug].tsx`

Handles "Full Review Deck" and "Weak Topics Only" virtual deck launches from the Practice tab.

- Accepts `slug` param + optional `mode` param (`'all'` or `'weak'`).
- Queries flashcards using SQLite JSON pattern: `WHERE listing_slugs LIKE '%"<slug>"%'` — consistent with how `usePracticeData` already parses `listingSlugs` via `JSON.parse`.
- For `mode=weak`: additionally filters to topics where accuracy (from `userProgress`) is < 0.6 — reuses `computeStrength` logic to identify qualifying topics, then fetches their flashcards.
- Runs the same gamified quiz engine (parseQuizQuestion, timer, MCQ, results review) as `[topicId].tsx`.
- Records session with `listingSlug = slug`, `topicId = ''`, `deckId = ''`.
- **Session title resolution** for `recentSessions` in Analytics: when both `topicId` and `deckId` are `''`, title is derived from `listingSlug` → `listings.title` joined from local DB, with suffix " · Full Review" or " · Weak Topics" based on which mode was used. To support this, store the mode in `practiceSessions` by using a sentinel `deckId` value: `deckId = '__full__'` for Full Review, `deckId = '__weak__'` for Weak Topics Only. The `useAnalytics` hook resolves the display title from these sentinel values.

---

## 10. File Change Summary

| File | Change type |
|---|---|
| `db/schema.ts` | Add `focusListings`, `practiceSessions` tables |
| `db/client.ts` | Add 3 migrations (create tables + seed) |
| `services/sync.ts` | Extract `syncSlug()`, loop over `focusListings`, add `syncPrimaryListing()` |
| `hooks/useFocusListings.ts` | New hook |
| `hooks/useRecordSession.ts` | New hook |
| `hooks/useAnalytics.ts` | New hook |
| `hooks/usePracticeData.ts` | Expose `allFocusSlugs[]` |
| `app/onboarding.tsx` | Step 2 multi-select + priority tray; add Step 4 confirmation |
| `app/(tabs)/practice.tsx` | Focus cards row, virtual Quick Start decks, session `listingSlug` param |
| `app/(tabs)/listings.tsx` | Focus status badge on list cards |
| `app/listings/[slug].tsx` | Add/Remove focus CTA block |
| `app/(tabs)/settings.tsx` | My Focus List section with DraggableFlatList |
| `app/(tabs)/analytics.tsx` | New screen |
| `app/(tabs)/_layout.tsx` | Add Analytics tab (5th tab) |
| `app/practice/listing/[slug].tsx` | New virtual deck quiz route |
| `app/practice/[topicId].tsx` | Accept + pass `listingSlug` param; call `useRecordSession` |
| `app/practice/deck/[deckId].tsx` | Accept + pass `listingSlug` param; call `useRecordSession` |

---

## 11. Out of Scope (explicit non-goals for this sprint)

- Push notifications or reminders per listing deadline
- Cloud sync of `focusListings` or `practiceSessions` to Supabase (local only)
- Per-listing goals or target scores
- Drill-down from a session row in Analytics to its individual question review
- More than 5 simultaneous focus listings (no hard cap enforced in v1, but UX is designed for 2–3)
