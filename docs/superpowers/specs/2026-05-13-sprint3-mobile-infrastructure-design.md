# Sprint 3 — Mobile Infrastructure Design

**Date:** 2026-05-13
**Sprint:** 3 of 5
**Scope:** React Native mobile app shell — WatermelonDB schema, Supabase delta sync, minimal onboarding, 4-tab navigation

---

## Goals

Deliver a working mobile app shell that:
- Presents a 4-tab glassmorphism floating navbar (Home, Practice, Listings, Profile)
- Stores flashcard and listing data locally in WatermelonDB for offline access
- Syncs from Supabase automatically on every app launch (delta sync)
- Runs a minimal onboarding flow (exam selection) on first launch
- Allows users to export their preferences as JSON from the Profile tab

Tab screens are stubs in this sprint. Content fills in Sprint 4 (Practice engine) and Sprint 5 (Listings, Progress).

---

## Stack

- **React Native + Expo 52**
- **Expo Router v4** — file-based routing, `(tabs)` group for tab shell
- **NativeWind v4** — Tailwind CSS for React Native
- **WatermelonDB** — local SQLite-backed offline database
- **Supabase JS v2** — anon key, browser/React Native client (no SSR)
- **Lineicons v5** — `@lineiconshq/react-native-lineicons` + `@lineiconshq/free-icons` + `react-native-svg`
- **Reanimated 2** — spring press animation on nav items (bundled with Expo 52)

---

## Architecture

Sprint 3 is a read-only mobile client. The admin (Next.js, Sprint 2B) writes flashcards and listings to Supabase. The mobile app pulls them down into WatermelonDB for offline access. There is no user account — all preferences live on-device.

On every app launch, the root layout triggers a delta sync. It reads `last_synced_at` from a local `user_settings` row, fetches all Supabase rows updated after that timestamp, writes them to WatermelonDB in a single batch, then updates `last_synced_at`. First launch = full pull; subsequent launches = fast incremental pull.

If the network is unavailable, sync silently skips and the app shows whatever is already in WatermelonDB. Offline is a valid state — no error screen.

---

## File Structure

```
apps/mobile/
  app/
    _layout.tsx              # Root layout — mounts DB, triggers sync, guards onboarding
    onboarding.tsx           # Exam selection screen (first launch only)
    (tabs)/
      _layout.tsx            # Custom tab bar with Lineicons glassmorphism nav
      index.tsx              # Home tab (stub)
      practice.tsx           # Practice tab (stub)
      listings.tsx           # Listings tab (stub)
      profile.tsx            # Profile tab — includes Change Exam + Export Data
  db/
    schema.ts                # WatermelonDB schema definition
    models/
      Subject.ts
      Topic.ts
      Flashcard.ts
      Listing.ts
      UserSettings.ts
    index.ts                 # DB singleton (single Database instance)
  services/
    supabase.ts              # Anon-key Supabase client
    sync.ts                  # Delta sync logic
    export.ts                # JSON export via expo-sharing
  hooks/
    useDatabase.ts           # DatabaseContext + useDatabase hook
  components/
    TabBar.tsx               # Custom floating glassmorphism tab bar
```

---

## WatermelonDB Schema

Five tables. Four mirror Supabase; one (`user_settings`) is local-only and never synced.

**ID strategy:** Supabase UUIDs are used directly as WatermelonDB record IDs (set via `record._raw.id = supabaseRow.id` during sync). This means FK columns (`subject_id`, `topic_id`) hold Supabase UUIDs and resolve to WatermelonDB records without any ID mapping step.

### `subjects`
| Column | Type | Notes |
|---|---|---|
| `id` | string (PK) | Supabase UUID |
| `name` | string | |
| `slug` | string | |

### `topics`
| Column | Type | Notes |
|---|---|---|
| `id` | string (PK) | Supabase UUID |
| `subject_id` | string | FK → `subjects.id` |
| `name` | string | |
| `slug` | string | |

### `flashcards`
| Column | Type | Notes |
|---|---|---|
| `id` | string (PK) | Supabase UUID |
| `topic_id` | string | FK → `topics.id` |
| `question` | string | |
| `answer` | string | |
| `difficulty` | string | `'easy'` \| `'medium'` \| `'hard'` |
| `tags` | string | JSON-stringified string array — parse at read time |
| `remote_updated_at` | number | Unix ms — used to drive delta sync |

### `listings`
| Column | Type | Notes |
|---|---|---|
| `id` | string (PK) | Supabase UUID |
| `slug` | string | |
| `title` | string | |
| `exam_type` | string | |
| `exam_date` | number | Unix ms |
| `status` | string | `'active'` \| `'upcoming'` |

### `user_settings`
| Column | Type | Notes |
|---|---|---|
| `id` | string (PK) | Fixed value `'local'` — single row |
| `selected_listing_slug` | string | Set during onboarding |
| `last_synced_at` | number | Unix ms — 0 on first launch |

---

## Sync Service (`services/sync.ts`)

Triggered once per app launch from `_layout.tsx`. Sequence:

1. Read `last_synced_at` from `user_settings` (0 = first launch, triggers full pull)
2. Read `selected_listing_slug` from `user_settings`
3. Query Supabase in parallel:
   - `listings` where `updated_at > last_synced_at`
   - `subjects` joined via `listing_subjects` pivot where `listing_slug = selected_listing_slug` AND `updated_at > last_synced_at`
   - `topics` for those subjects where `updated_at > last_synced_at`
   - `flashcards` for those topics where `updated_at > last_synced_at`
4. Write all results to WatermelonDB in a single `db.write()` batch — upsert by `remote_id` (update if row exists, create if not)
5. Update `last_synced_at = Date.now()` in `user_settings`

**Network failure handling:** Wrap the entire sync in a try/catch. On any error, log to console and return — the app proceeds with stale local data.

**Supabase prerequisite:** A `listing_subjects` join table must exist linking `listings.slug` to `subjects.id`. If it does not exist, a Supabase migration is part of this sprint's scope.

---

## Onboarding (`app/onboarding.tsx`)

Triggered on first launch when `user_settings.selected_listing_slug` is empty.

The root layout (`_layout.tsx`) checks for `selected_listing_slug` after mounting the DB. If absent, it redirects to `/onboarding` before rendering the tabs.

**Onboarding screen:**
- Fetches active/upcoming listings directly from Supabase (network required; this is the one screen that requires connectivity)
- Displays a scrollable list of listings with title and exam date
- User taps one listing to select it
- On tap: saves `selected_listing_slug` to `user_settings`, triggers initial full sync, navigates to `/(tabs)/`
- No back button — selection is permanent until changed from Profile

---

## Tab Navigation Shell

### Custom `TabBar` component (`components/TabBar.tsx`)

Floating pill, replaces the default Expo Router tab bar:

| Property | Value |
|---|---|
| Width | 284px (fixed) |
| Height | 68px |
| Position | Absolute, 24px from bottom, horizontally centered |
| Border radius | 36px |
| Background | `rgba(255,255,255,0.16)` |
| Backdrop blur | `blur(28px) saturate(200%)` via `expo-blur` |
| Border | `1px rgba(255,255,255,0.28)` |
| Box shadow | `0 8px 32px rgba(0,0,0,0.30)` + inner highlight |
| Active pill | `rgba(128,0,0,0.82)` + `0 4px 18px rgba(128,0,0,0.50)` glow |
| Press animation | Spring scale via Reanimated 2 `useAnimatedStyle` |

### Icons (Lineicons v5)

| Tab | Route | Icon import |
|---|---|---|
| Home | `/(tabs)/` | `Home2Outlined` |
| Practice | `/(tabs)/practice` | `Bolt2Outlined` |
| Listings | `/(tabs)/listings` | `GraduationCap1Outlined` |
| Profile | `/(tabs)/profile` | `User4Outlined` |

Import pattern: `import { Home2Outlined } from '@lineiconshq/free-icons'`
Render pattern: `<Lineicons icon={Home2Outlined} size={20} color={isActive ? '#fff' : 'rgba(255,255,255,0.62)'} />`

### Tab screens (stubs)

Each screen renders a centered placeholder with the tab name and "Coming soon" text. No logic — purely structural.

---

## Profile Tab (`app/(tabs)/profile.tsx`)

Two actions beyond the stub:

**Change exam:** Clears `user_settings.selected_listing_slug` and `last_synced_at`, then redirects to `/onboarding`. This re-runs the full onboarding + sync flow.

**Export data:** Calls `services/export.ts` which serializes `user_settings` to JSON and opens the native share sheet via `expo-sharing`. Export includes: `selected_listing_slug`, `last_synced_at`, `exported_at`.

---

## Dependencies to Add (apps/mobile)

```
@nozbe/watermelondb
@nozbe/with-observables
@lineiconshq/react-native-lineicons
@lineiconshq/free-icons
react-native-svg
expo-blur
expo-sharing
@supabase/supabase-js
```

---

## Supabase Migration Required

If `listing_subjects` does not already exist, add:

```sql
create table listing_subjects (
  listing_slug text references listings(slug) on delete cascade,
  subject_id uuid references subjects(id) on delete cascade,
  primary key (listing_slug, subject_id)
);
```

Check current schema before creating — sprint plan should verify first.

---

## Out of Scope (Sprint 3)

- Flashcard study engine (Sprint 4)
- Progress tracking / streaks (Sprint 5)
- Listings browse UI (Sprint 5)
- Push notifications
- Auth / user accounts
- Admin Lineicons CDN addition to `apps/admin/app/layout.tsx` — include as a task in this sprint since it was decided during Sprint 3 brainstorm
