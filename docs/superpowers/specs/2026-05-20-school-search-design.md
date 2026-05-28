# School Search Redesign — Design Spec

## Goal

Replace the existing 4-level hierarchical school picker (Region → Province → City → School backed by Supabase tables + SQLite cache) with a single debounced live search powered by the Google Places API (v2). Covers all secondary public/private schools and SHS-offering universities in the Philippines.

## Architecture

### Deleted
- Supabase `schools` table — dropped via migration
- Supabase `school_regions` table — dropped via migration
- `apps/mobile/hooks/useSchoolPicker.ts` — entire file removed
- `schoolsCache` entry in `apps/mobile/db/schema.ts` — removed (existing cached SQLite rows on devices are abandoned harmlessly; no drop migration needed)

### Added
- `apps/mobile/hooks/useSchoolSearch.ts` — Google Places Autocomplete hook with 500ms debounce
- `EXPO_PUBLIC_GOOGLE_PLACES_KEY` — added to `.env` and EAS `preview` environment

### Replaced
- `apps/mobile/components/SchoolPicker.tsx` — modal shell kept, internals completely rewritten

### Unchanged
- `apps/mobile/app/onboarding.tsx` — `<SchoolPicker value={school} onChange={setSchool} />` call identical
- `apps/mobile/db/schema.ts` `userSettings.school` column — still stores plain text school name
- `apps/mobile/services/sync.ts`, `export.ts` — no changes

---

## API

**Endpoint:** Google Places New API (v2) Autocomplete
```
POST https://places.googleapis.com/v1/places:autocomplete
Headers:
  Content-Type: application/json
  X-Goog-Api-Key: {EXPO_PUBLIC_GOOGLE_PLACES_KEY}
  X-Goog-FieldMask: suggestions.placePrediction.structuredFormat
Body:
{
  "input": "<user query>",
  "includedPrimaryTypes": ["school", "secondary_school", "university"],
  "includedRegionCodes": ["ph"]
}
```

**Response shape used:**
```json
{
  "suggestions": [
    {
      "placePrediction": {
        "structuredFormat": {
          "mainText":      { "text": "San Beda University" },
          "secondaryText": { "text": "Mendiola, Manila, Philippines" }
        }
      }
    }
  ]
}
```

`mainText.text` is stored as `userSettings.school`. `secondaryText.text` is shown as a subtitle in the results list only.

**Security:** Key is restricted in Google Cloud Console to Android package `app.iskotify.mobile` and iOS bundle `app.iskotify.mobile` to prevent abuse outside the app.

---

## Hook: `useSchoolSearch.ts`

**Exported interface:**
```ts
interface SchoolResult {
  name: string      // mainText — stored on selection
  subtitle: string  // secondaryText — display only
}

interface UseSchoolSearch {
  query: string
  setQuery: (q: string) => void
  results: SchoolResult[]
  loading: boolean
  error: boolean
  retry: () => void
}
```

**Behavior:**
- Debounce: 500ms via `useRef` + `clearTimeout`/`setTimeout` (no external library)
- Minimum 3 characters before any fetch is triggered
- On fetch start: `loading = true`, `error = false`
- On success: `results` set, `loading = false`
- On failure: `error = true`, `loading = false`, `results = []`
- `retry()` re-fires the last query immediately (resets error)
- Clears results when `query` drops below 3 chars

---

## Component: `SchoolPicker.tsx`

**Outer shell (unchanged):** Tappable row showing selected school name or "Search your school..." placeholder. Tapping opens a bottom-sheet modal.

**Modal interior (fully replaced):**

```
┌─────────────────────────────────────┐
│  ✕   School / University            │  modal header
├─────────────────────────────────────┤
│  🔍  Search schools...              │  autofocused TextInput
├─────────────────────────────────────┤
│  [results list]                     │
│                                     │
│  School Name                        │  mainText — bold
│  City, Province, Philippines        │  secondaryText — muted
│  ────────────────────────────────── │
│  ...                                │
│                                     │
│  Can't find your school?            │
│  Use what I typed  ›                │  always visible when query >= 1 char
└─────────────────────────────────────┘
```

**UI States:**

| State | Display |
|-------|---------|
| query < 3 chars | "Type at least 3 characters to search" |
| loading | Centered spinner |
| results | Scrollable flat list of school rows |
| no results | "No schools found." + "Use what I typed" fallback |
| error | "Could not search schools. Check your connection." + Retry button |

**On selection:** `onChange(result.name)` fires, modal closes.
**"Use what I typed":** `onChange(query)` fires, modal closes. Shown whenever `query.length >= 1`.

---

## Cleanup Checklist

- [ ] Supabase migration: `DROP TABLE IF EXISTS schools; DROP TABLE IF EXISTS school_regions;`
- [ ] Remove `schoolsCache` from `db/schema.ts`
- [ ] Delete `hooks/useSchoolPicker.ts`
- [ ] Rewrite `components/SchoolPicker.tsx`
- [ ] Create `hooks/useSchoolSearch.ts`
- [ ] Add `EXPO_PUBLIC_GOOGLE_PLACES_KEY` to `.env` and EAS `preview` env
- [ ] Bump `versionCode` to 8 in `app.json`
