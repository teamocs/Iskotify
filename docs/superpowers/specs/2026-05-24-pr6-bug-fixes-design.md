# PR 6: Bug Fixes Design

## Overview

Four bundled bug fixes to ship via OTA + one Supabase migration:

1. **School picker** — searches miss major PH universities (UP/PSHS/DLSU not in the DepEd dataset). Add an `aliases` column to the schools table, seed ~25 well-known universities, rewrite the search to query name + aliases, and surface specific error messages for Places API failures so the user can diagnose.
2. **Export data** — currently opens the share sheet; switch to Android's Storage Access Framework so it feels like a real download (user picks a destination folder, file saves there). iOS keeps share sheet (the iOS-native export paradigm).
3. **Color palette** — `#fca5a5` (pale red) is hardcoded in 30+ places. In light mode it's unreadable on the cream background. Add a theme-aware `accentText` token (pale red in dark, rich dark red in light) and mass-replace all literal uses.
4. **Listing detail button sizing** — focus add/remove buttons span full width (no horizontal margin) while practice/link buttons have 14px side margins; remove button also gets +4px height from a 2px border. Add margin, compensate padding.

Ships as one OTA bundle after the Supabase migration is applied.

---

## 1. School picker — seed missing schools + smarter search + Places diagnosis

### Current state

`apps/mobile/hooks/useSchoolSearch.ts` already does Supabase-first then Places fallback. The bug is that the Supabase `schools` table (1,499 rows) was seeded from the DepEd basic-education dataset — it doesn't include state universities (UP, PSHS) or top private universities (DLSU, ADMU, UST, FEU, Mapua, etc.). Searches for "UPLB", "UP", "Pisay" return zero rows from Supabase, so the code falls through to Places API. But the Places API isn't working on the production APK — likely because the Google Cloud Console Android-key restrictions don't include the production signing SHA-1, OR the `EXPO_PUBLIC_GOOGLE_PLACES_KEY` env var isn't being injected into the OTA bundle.

### Changes

#### A. Supabase migration

Add an `aliases` column for storing abbreviations + nicknames, indexed for fast array containment:

```sql
ALTER TABLE schools ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS schools_aliases_idx ON schools USING GIN (aliases);
```

Then seed ~25 well-known schools missing from the dataset. Aliases stored lowercased so the search can lowercase the user input once and use `cs` (array contains) operator without per-row case folding:

```sql
INSERT INTO schools (region, province, city, name, deped_id, aliases) VALUES
  ('NCR', 'Metro Manila', 'Quezon City', 'University of the Philippines Diliman', NULL, ARRAY['up', 'up diliman', 'upd']),
  ('CALABARZON', 'Laguna', 'Los Baños', 'University of the Philippines Los Baños', NULL, ARRAY['uplb', 'up los baños', 'up los banos']),
  ('NCR', 'Metro Manila', 'Manila', 'University of the Philippines Manila', NULL, ARRAY['upm', 'up manila']),
  ('Western Visayas', 'Iloilo', 'Miagao', 'University of the Philippines Visayas', NULL, ARRAY['upv', 'up visayas']),
  ('Central Visayas', 'Cebu', 'Cebu City', 'University of the Philippines Cebu', NULL, ARRAY['upceb', 'up cebu']),
  ('Davao Region', 'Davao del Sur', 'Davao City', 'University of the Philippines Mindanao', NULL, ARRAY['upmin', 'up mindanao']),
  ('NCR', 'Metro Manila', 'Diliman', 'Philippine Science High School - Main Campus', NULL, ARRAY['pshs', 'pisay', 'pshs main']),
  ('Central Luzon', 'Pampanga', 'Clark Freeport Zone', 'Philippine Science High School - Central Luzon Campus', NULL, ARRAY['pshs cl', 'pisay clark']),
  ('CALABARZON', 'Cavite', 'Dasmariñas', 'Philippine Science High School - CALABARZON Region Campus', NULL, ARRAY['pshs calabarzon', 'pisay cavite']),
  ('NCR', 'Metro Manila', 'Manila', 'De La Salle University', NULL, ARRAY['dlsu', 'la salle', 'dlsu manila']),
  ('NCR', 'Metro Manila', 'Quezon City', 'Ateneo de Manila University', NULL, ARRAY['admu', 'ateneo', 'ateneo manila']),
  ('NCR', 'Metro Manila', 'Manila', 'University of Santo Tomas', NULL, ARRAY['ust', 'santo tomas']),
  ('NCR', 'Metro Manila', 'Manila', 'Far Eastern University - Manila', NULL, ARRAY['feu', 'far eastern']),
  ('NCR', 'Metro Manila', 'Manila', 'Mapúa University', NULL, ARRAY['mapua', 'mapúa']),
  ('NCR', 'Metro Manila', 'Sampaloc', 'Polytechnic University of the Philippines - Manila', NULL, ARRAY['pup', 'pup manila']),
  ('NCR', 'Metro Manila', 'Manila', 'Pamantasan ng Lungsod ng Maynila', NULL, ARRAY['plm']),
  ('NCR', 'Metro Manila', 'Manila', 'Adamson University', NULL, ARRAY['adu', 'adamson']),
  ('NCR', 'Metro Manila', 'Manila', 'National University - Manila', NULL, ARRAY['nu', 'nu manila']),
  ('NCR', 'Metro Manila', 'Manila', 'University of the East - Manila', NULL, ARRAY['ue', 'ue manila']),
  ('NCR', 'Metro Manila', 'Caloocan', 'University of the East - Caloocan', NULL, ARRAY['ue caloocan']),
  ('NCR', 'Metro Manila', 'Manila', 'San Beda University - Manila', NULL, ARRAY['san beda', 'sbu']),
  ('NCR', 'Metro Manila', 'Manila', 'Centro Escolar University - Manila', NULL, ARRAY['ceu', 'centro escolar']),
  ('NCR', 'Metro Manila', 'Manila', 'Lyceum of the Philippines University - Manila', NULL, ARRAY['lpu', 'lyceum']),
  ('NCR', 'Metro Manila', 'Mandaluyong', 'De La Salle - College of Saint Benilde', NULL, ARRAY['benilde', 'csb', 'dls-csb']),
  ('NCR', 'Metro Manila', 'Manila', 'Saint Paul University Manila', NULL, ARRAY['spu', 'saint paul'])
ON CONFLICT DO NOTHING;
```

Run via `mcp__supabase__apply_migration` against the `Iskotify App` project (`dtugrsbarruizgzowgso`).

#### B. Rewrite `searchSupabase`

In `apps/mobile/hooks/useSchoolSearch.ts`:

```ts
async function searchSupabase(q: string): Promise<SchoolResult[]> {
  const qLower = q.toLowerCase()
  const { data, error } = await supabase
    .from('schools')
    .select('name, city, province, aliases')
    .or(`name.ilike.%${q}%,aliases.cs.{${qLower}}`)
    .limit(10)
  if (error || !data || data.length === 0) return []
  return data.map(s => ({
    name: s.name,
    subtitle: `${s.city}, ${s.province}`,
  }))
}
```

The `.or(...)` clause searches:
- `name.ilike.%q%` — partial case-insensitive match on the display name
- `aliases.cs.{qLower}` — Postgres array-contains, looks for the lowercased query as an exact array element

So "UPLB" → matches the UP Los Baños row via aliases. "Diliman" → matches via name ILIKE. "ust" → matches UST via aliases. "santo tomas" → matches UST via aliases. "Mindanao" → matches several rows including UP Mindanao via name ILIKE.

Edge case: the `.or(...)` syntax requires careful escaping of values containing commas or parentheses. The query string `q` comes from user input. Test the escape behavior — if the supabase-js library doesn't auto-escape, we sanitize `q` to strip commas + parentheses before building the OR clause.

#### C. Surface Places API errors

In the same file, replace silent `error: true` with specific error messages on the `SchoolPicker` UI:

```ts
async function searchPlaces(q: string): Promise<SchoolResult[]> {
  if (!PLACES_KEY) throw new Error('Places API key not configured')
  const res = await fetch(PLACES_URL, { /* unchanged */ })
  if (res.status === 403) throw new Error('Places API key denied (Android signature check failed)')
  if (res.status === 400) throw new Error('Places API bad request')
  if (!res.ok) throw new Error(`Places API HTTP ${res.status}`)
  // ... unchanged JSON parsing
}
```

The hook already catches the error and sets `error: true`. Extend the hook to also expose `errorMessage: string | null` so `SchoolPicker.tsx` can display it in the error UI (small grey text below the existing "Could not search schools" line).

#### D. EAS env var preflight + SHA-1 fingerprint

Two out-of-band items the user must verify:

1. **`EXPO_PUBLIC_GOOGLE_PLACES_KEY` in `eas.json` `preview` profile env block.** I'll read `apps/mobile/eas.json` during implementation and document whether it's there. If missing, add a placeholder line `"EXPO_PUBLIC_GOOGLE_PLACES_KEY": "$EXPO_PUBLIC_GOOGLE_PLACES_KEY"` and tell the user to set the secret via `eas env:create --variable-environment preview`.

2. **Google Cloud Console Android key restrictions** must include the production APK's SHA-1. During implementation, run `eas credentials -p android` (read-only) to fetch the SHA-1, then document it in the implementation plan as a one-line copy-paste for the user.

Neither (1) nor (2) is code that ships in the OTA bundle — both are documentation in the plan + a follow-up action for the user. The OTA bundle itself improves Supabase search + error messaging.

---

## 2. Export data — Storage Access Framework on Android

### Current state

`apps/mobile/services/export.ts` writes the JSON to `FileSystem.documentDirectory` (private app dir), then calls `Sharing.shareAsync` to open the system share sheet. Users see iOS-style "share to social media or share" UX even on Android — unintuitive.

### Changes

Rewrite `exportUserData(db)`:

```ts
import { Platform } from 'react-native'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
const { StorageAccessFramework } = FileSystem

export type ExportResult =
  | { status: 'saved'; filename: string }
  | { status: 'cancelled' }

export async function exportUserData(db: DrizzleClient): Promise<ExportResult> {
  // ... existing payload build ... (unchanged)
  const json = JSON.stringify(payload, null, 2)
  const filename = `iskotify-export-${new Date().toISOString().slice(0, 10)}.json`

  if (Platform.OS === 'android') {
    const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync()
    if (!perms.granted) return { status: 'cancelled' }
    const fileUri = await StorageAccessFramework.createFileAsync(
      perms.directoryUri,
      filename,
      'application/json',
    )
    await StorageAccessFramework.writeAsStringAsync(fileUri, json)
    return { status: 'saved', filename }
  }

  // iOS — share sheet is the platform-native export
  const fileUri = `${FileSystem.documentDirectory}${filename}`
  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  })
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing not available on this device')
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Save Iskotify Data',
  })
  return { status: 'saved', filename }
}
```

### Caller updates

Find the caller (Settings screen → "Export Data" action). The current call site likely just `await exportUserData(db)` and shows a generic "Exported!" toast. Update to:

```ts
const result = await exportUserData(db)
if (result.status === 'saved') {
  Alert.alert('Export complete', `Saved as ${result.filename}`)
}
// status === 'cancelled' is silent — user cancelled the picker intentionally
```

### Behavior

**Android:**
1. User taps Export in Settings.
2. Native Android directory picker opens (Documents/Downloads/SD card/etc).
3. User picks a folder, taps "Use this folder".
4. File saves to that folder with name `iskotify-export-2026-05-24.json`.
5. Alert: "Export complete. Saved as iskotify-export-2026-05-24.json".

**iOS:** unchanged — share sheet (the iOS-native paradigm).

**No new permissions required** — SAF uses user-granted directory permissions per-export, no `WRITE_EXTERNAL_STORAGE` manifest entry needed.

---

## 3. Color palette — theme-aware `accentText`

### Current state

`#fca5a5` (a pale red/pink) is hardcoded in 30+ places across components, screens, and the theme `statusColors.pink` constant. It works on the dark theme's `#1a1a2e` navy background but is unreadable on the light theme's `#fdf4f4` cream background.

### Changes

#### A. Add a theme-aware token

`apps/mobile/theme/tokens.ts`:

```ts
export const darkTheme = {
  // ... existing fields ...
  accentText: '#fca5a5',   // pale red — readable on dark navy
}

export const lightTheme = {
  // ... existing fields ...
  accentText: '#9b1c1c',   // rich dark red — readable on cream
}
```

Delete the `statusColors.pink` entry. Keep `strong`, `weak`, `review` (those are status-semantic and work across themes).

#### B. Mass-replace `#fca5a5` literals

12 files to touch. For each file, the pattern is:
- If `t` is already in scope (from `useTheme()`), change `'#fca5a5'` → `t.accentText`.
- If `t` is NOT in scope (component is purely static styles), add `const { theme: t } = useTheme()` to the component body and move styles into a `useMemo` if needed.

Affected files + count of occurrences (verified via grep):
- `apps/mobile/components/AiModelBanner.tsx` — 5
- `apps/mobile/components/SchoolPicker.tsx` — 2
- `apps/mobile/app/(tabs)/analytics.tsx` — 4
- `apps/mobile/app/(tabs)/index.tsx` — 8
- `apps/mobile/app/(tabs)/listings.tsx` — 2
- `apps/mobile/app/(tabs)/practice.tsx` — 1
- `apps/mobile/app/(tabs)/profile.tsx` — 1
- `apps/mobile/app/about.tsx` — 1
- `apps/mobile/app/help.tsx` — 1
- `apps/mobile/app/landing.tsx` — 1
- `apps/mobile/app/listings/[slug].tsx` — 2
- `apps/mobile/theme/tokens.ts` — 1 (the `statusColors.pink` entry — deleted)

Verify post-change with: `grep -rn "fca5a5" apps/mobile/` returns zero matches outside of `tokens.ts` (where `#fca5a5` lives as `darkTheme.accentText`).

#### C. ActivityIndicator color

`SchoolPicker.tsx` line 126 passes `color="#fca5a5"` to `<ActivityIndicator>`. ActivityIndicator on Android works with any color; passing `t.accentText` is fine.

---

## 4. Listing detail focus button sizing

### Current state

In `apps/mobile/app/listings/[slug].tsx`:
- `practiceBtn` has `marginHorizontal: 14, paddingVertical: 14` → 28px inner height, content area starts 14px from screen edge.
- `focusRemoveBtn` has NO `marginHorizontal`, `paddingVertical: 14`, plus `borderWidth: 2` → spans full width (no margin), total height = 4 + 28 = 32px.
- `focusAddBtn` has NO `marginHorizontal`, `paddingVertical: 14`, no border → spans full width, height 28px.
- `linkBtn` has `marginHorizontal: 14, paddingVertical: 12, borderWidth: 1`.

So the focus buttons are **wider** (no margin) AND the remove variant is **4px taller** (border adds height). User notices both.

### Changes

```ts
focusRemoveBtn: {
  marginHorizontal: 14,            // NEW
  backgroundColor: 'rgba(128,0,0,0.12)',
  borderWidth: 2,
  borderColor: '#831626',
  borderRadius: 18,
  paddingVertical: 12,              // CHANGED from 14 (compensates for 2px border)
  alignItems: 'center',
  marginBottom: 12,
},
focusAddBtn: {
  marginHorizontal: 14,            // NEW
  backgroundColor: 'rgba(128,0,0,0.82)',
  borderRadius: 18,
  paddingVertical: 14,              // unchanged
  alignItems: 'center',
  marginBottom: 12,
},
```

Math check:
- `practiceBtn`: paddingVertical 14 + border 0 = 28px content height
- `focusAddBtn`: paddingVertical 14 + border 0 = 28px ✓
- `focusRemoveBtn`: paddingVertical 12 + border 2*2 = 28px ✓

Width-wise all four buttons now have `marginHorizontal: 14`, so they're identical.

`focusRemoveTxt` color also changes from `'#fca5a5'` to `t.accentText` as part of Section 3.

---

## 5. File map

**Supabase migration (NEW):**
- One migration applied via `mcp__supabase__apply_migration` against project `dtugrsbarruizgzowgso` — adds `aliases` column + index + INSERT 25 schools.

**Modified files (~14):**

| File | Changes |
|---|---|
| `apps/mobile/hooks/useSchoolSearch.ts` | Rewrite `searchSupabase` to query name + aliases; add specific Places error messages; expose `errorMessage` from the hook. |
| `apps/mobile/components/SchoolPicker.tsx` | Read `errorMessage` from hook and display it as secondary text under the error banner. Color swap: 2 uses. |
| `apps/mobile/services/export.ts` | Use SAF on Android; share-sheet on iOS; return `ExportResult` type. |
| `apps/mobile/app/(tabs)/profile.tsx` | Update Export caller to handle `ExportResult` + show alert. Color swap: 1 use. |
| `apps/mobile/theme/tokens.ts` | Add `accentText` to both themes. Delete `statusColors.pink`. |
| `apps/mobile/components/AiModelBanner.tsx` | Color swap: 5 uses. |
| `apps/mobile/app/(tabs)/analytics.tsx` | Color swap: 4 uses. |
| `apps/mobile/app/(tabs)/index.tsx` | Color swap: 8 uses. |
| `apps/mobile/app/(tabs)/listings.tsx` | Color swap: 2 uses. |
| `apps/mobile/app/(tabs)/practice.tsx` | Color swap: 1 use. |
| `apps/mobile/app/about.tsx` | Color swap: 1 use. |
| `apps/mobile/app/help.tsx` | Color swap: 1 use. |
| `apps/mobile/app/landing.tsx` | Color swap: 1 use. |
| `apps/mobile/app/listings/[slug].tsx` | Focus button sizing fix + color swap: 2 uses. |
| `apps/mobile/eas.json` | Verify/add `EXPO_PUBLIC_GOOGLE_PLACES_KEY` reference in preview env. |

**Test files updated (~2):**

| File | Changes |
|---|---|
| `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts` | Update Supabase mock to assert the new `.or()` query shape; add test that alias-match returns results; add test that specific Places error messages flow to `errorMessage`. |
| `apps/mobile/services/__tests__/export.test.ts` | Mock `StorageAccessFramework`; add test that Android takes SAF path; iOS test takes share path; cancellation returns `{ status: 'cancelled' }`. |

---

## 6. Testing approach

**Unit tests (Jest):**

- `useSchoolSearch`:
  - Search "UPLB" returns the UP Los Baños row (via aliases match in the mocked Supabase response).
  - Search "Diliman" returns the UP Diliman row (via name ILIKE match).
  - Places API 403 → `errorMessage` is "Places API key denied (Android signature check failed)".
  - Places API works → results map correctly.
- `export.ts`:
  - Platform.OS = 'android' + SAF permissions granted → calls `createFileAsync` + `writeAsStringAsync` → returns `{ status: 'saved', filename }`.
  - Platform.OS = 'android' + SAF permissions denied → returns `{ status: 'cancelled' }`.
  - Platform.OS = 'ios' → calls `Sharing.shareAsync` → returns `{ status: 'saved', filename }`.

**No new tests for color swap or button sizing** — pure visual changes validated on-device.

**Manual on-device validation (after OTA installs):**

1. School picker → type "UPLB" → row appears instantly from Supabase.
2. School picker → type "PSHS" → 3 rows appear (Main, Central Luzon, CALABARZON).
3. School picker → type an obscure private school → if Places API works, fallback results appear; if not, the error message shows what's wrong (key missing / 403 / etc.).
4. Settings → Export → Android directory picker opens → pick Documents → file saved → alert shows filename.
5. Settings → Export → cancel the picker → no alert, no error.
6. Switch to Light theme → all formerly-pale-pink text is now rich dark red and readable.
7. Listings → tap a card → focus button has same width and height as practice button.

---

## 7. Rollout

**Two-step rollout:**

**Step 1: Apply Supabase migration** via the MCP `apply_migration` tool. Non-destructive: adds column with default, INSERTs with `ON CONFLICT DO NOTHING`.

**Step 2: OTA bundle:**

```bash
eas update --branch preview --message "fix(mobile): school picker (aliases + smarter search), SAF export, accent text color, focus button sizing"
```

No version bump (no native modules added).

**Action items for user (out of band):**

1. Confirm `EXPO_PUBLIC_GOOGLE_PLACES_KEY` is set as an EAS secret for the `preview` environment. If not: `eas env:create --variable-environment preview` and enter the key value.
2. Update Google Cloud Console → Credentials → the Places API key's Android restrictions to include the production APK's SHA-1 fingerprint. The implementation plan will print the SHA-1 (via `eas credentials -p android`) so you can copy-paste.

---

## 8. Out of scope

- Refactoring how `schools` is populated (CHED API scraping, etc.) — separate data-ops task.
- Adding fuzzy / typo-tolerant search (e.g., trigram matching) — current `ilike` + alias array is adequate for known abbreviations.
- Renaming `statusColors.weak` / `.review` / `.strong` — they're semantic and unchanged.
- Adding a "Save to Downloads (no picker)" power-user toggle for export — possible follow-up.
- Customizing the Android SAF picker UI — uses the OS-native picker as-is.
- iOS-specific Files-app integration beyond the standard share sheet.
- Migration to a vector search or LLM-based "what school did you mean?" rerank — out of scope.
