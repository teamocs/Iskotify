# Epic B — Scholarship Directory Expansion + Eligibility Matcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Grow scholarships from ~8 → ~135 programs with typed detail, a pure eligibility matcher, onboarding-collected matcher inputs, browse facets + "eligible for me", and enriched detail screens — reusing the existing listings pipeline.

**Architecture:** B1 schema (migration 019 + mobile mirror + user_settings) → B3 pure matcher util → B2 parser scripts → committed seed SQL → B6 sync + admin drawer → B4 onboarding step → B5 browse/detail UI → verify + apply via MCP.

**Tech Stack:** Supabase (typed columns + jsonb, public-read RLS); Next.js admin + Vitest; Expo RN + Drizzle/expo-sqlite + Jest; Node parser scripts (self-contained, like `scripts/import-upcat-questions.mjs`).

**Spec:** [docs/superpowers/specs/2026-06-06-epic-b-scholarship-directory-design.md](../specs/2026-06-06-epic-b-scholarship-directory-design.md)

**Sources:** `C:\Users\User\Downloads\Iskotify Upgrades\_extracted\philippine_national_scholarships_database.txt`, `…\lgu_political_scholarships.txt`, `…\admissions_update_20260603.txt` (DLSU item #6).

**Delivery:** migration 019 + seeds applied via Supabase MCP (project `dtugrsbarruizgzowgso`) at verify time; mobile JS ships in the final-batch OTA. Highest migration currently applied: 018. Next: 019.

---

## File map

### New
```
supabase/migrations/019_scholarship_fields.sql                 B1 listings typed cols + profiles province/city
apps/mobile/utils/scholarshipMatch.ts                          B3 pure matcher
apps/mobile/utils/__tests__/scholarshipMatch.test.ts
scripts/parse-national-scholarships.mjs                         B2 national parser → seed
scripts/parse-lgu-scholarships.mjs                             B2 LGU parser → seed
scripts/__tests__/scholarshipNormalize.test.mjs                B2 normalization unit tests (or vitest in admin)
supabase/seed/scholarships_national_seed.sql                   B2 generated seed (committed)
supabase/seed/scholarships_lgu_seed.sql                        B2 generated seed (committed)
apps/mobile/components/scholarships/MatchPill.tsx              B5 status pill
apps/mobile/components/scholarships/ScholarshipFacets.tsx      B5 facet chips (or inline in listings.tsx)
```

### Modified
```
apps/mobile/db/schema.ts                  B1 listings + user_settings new columns
apps/mobile/db/client.ts                  B1 ALTER TABLE migrations
apps/mobile/services/settings.ts (or store) B1/B4 income_bracket/gwa/province/city read+write
apps/mobile/services/sync.ts              B6 listings select + upsert new columns
apps/admin/components/admin/ListingDrawer.tsx  B6 typed field inputs
apps/mobile/app/onboarding.tsx            B4 income/GWA/province step
apps/mobile/app/(tabs)/listings.tsx       B5 facets + match pill on cards
apps/mobile/app/listings/[slug].tsx       B5 detail enrichment + warnings
```

---

# B1 — Schema

## Task 1: Migration 019 — listings typed columns + profiles province/city

**Files:** Create `supabase/migrations/019_scholarship_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Epic B: scholarship typed columns (matcher + facets) + profile location
ALTER TABLE listings ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'national';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS income_ceiling numeric;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gwa_requirement numeric;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS monthly_stipend numeric;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS service_obligation_years int;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS has_entrance_exam boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS application_window text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS scholarship_meta jsonb NOT NULL DEFAULT '{}';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_scope_check') THEN
    ALTER TABLE listings ADD CONSTRAINT listings_scope_check
      CHECK (scope IN ('national','regional','provincial','city','school'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_listings_scope ON listings(scope);
CREATE INDEX IF NOT EXISTS idx_listings_province ON listings(province);
CREATE INDEX IF NOT EXISTS idx_listings_is_verified ON listings(is_verified);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city text;
```

- [ ] **Step 2: Commit** (controller applies via MCP at Task 13)

```bash
git add supabase/migrations/019_scholarship_fields.sql
git commit -m "feat(db): scholarship typed columns on listings + profiles province/city"
```

## Task 2: Mobile schema + SQLite migrations

**Files:** Modify `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`

- [ ] **Step 1:** In `schema.ts` `listings` table add fields:
```ts
  province: text('province'),
  city: text('city'),
  scope: text('scope').notNull().default('national'),
  isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
  incomeCeiling: integer('income_ceiling'),
  gwaRequirement: integer('gwa_requirement'),
  monthlyStipend: integer('monthly_stipend'),
  serviceObligationYears: integer('service_obligation_years'),
  hasEntranceExam: integer('has_entrance_exam', { mode: 'boolean' }).notNull().default(false),
  applicationWindow: text('application_window'),
  scholarshipMeta: text('scholarship_meta').notNull().default('{}'),  // JSON string
```
In `user_settings` table add: `incomeBracket: text('income_bracket')`, `gwa: real('gwa')` (import `real` from drizzle-orm/sqlite-core if not present; else use `integer`), `province: text('province')`, `city: text('city')`.

- [ ] **Step 2:** In `client.ts` MIGRATIONS append (idempotent ALTERs — the runner swallows "duplicate column"):
```ts
  `ALTER TABLE listings ADD COLUMN province TEXT`,
  `ALTER TABLE listings ADD COLUMN city TEXT`,
  `ALTER TABLE listings ADD COLUMN scope TEXT NOT NULL DEFAULT 'national'`,
  `ALTER TABLE listings ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE listings ADD COLUMN income_ceiling INTEGER`,
  `ALTER TABLE listings ADD COLUMN gwa_requirement INTEGER`,
  `ALTER TABLE listings ADD COLUMN monthly_stipend INTEGER`,
  `ALTER TABLE listings ADD COLUMN service_obligation_years INTEGER`,
  `ALTER TABLE listings ADD COLUMN has_entrance_exam INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE listings ADD COLUMN application_window TEXT`,
  `ALTER TABLE listings ADD COLUMN scholarship_meta TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE user_settings ADD COLUMN income_bracket TEXT`,
  `ALTER TABLE user_settings ADD COLUMN gwa REAL`,
  `ALTER TABLE user_settings ADD COLUMN province TEXT`,
  `ALTER TABLE user_settings ADD COLUMN city TEXT`,
```
Match the exact array formatting of the surrounding entries. If the SQLite ALTER with `NOT NULL DEFAULT` on an existing table errors in this engine, drop the `NOT NULL` for those two (`scope`, `scholarship_meta`, the booleans) and keep just `DEFAULT` — verify by reading how existing non-null defaulted columns were added.

- [ ] **Step 3: Type-check**: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -iE "listings|user_settings|schema|client" | head` → no errors.

- [ ] **Step 4: Commit**:
```bash
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts
git commit -m "feat(mobile): mirror scholarship typed columns + user_settings matcher fields"
```

## Task 3: user_settings read/write for matcher fields

**Files:** Modify the settings helper (find it: `grep -rln "user_settings\|userSettings" apps/mobile/services apps/mobile/hooks | head`; likely `apps/mobile/services/settings.ts` or a `useSettings` hook)

- [ ] **Step 1:** Read the existing settings get/update functions. Extend the settings type + the read mapping + the update function to include `incomeBracket?`, `gwa?` (number), `province?`, `city?`. Mirror exactly how existing optional fields (e.g. `school`, `gradeLevel`) are read/written.

- [ ] **Step 2:** If there is a settings test, extend it to assert the new fields round-trip; else add a focused test. Run: `cd apps/mobile && pnpm jest settings 2>&1 | tail -6`.

- [ ] **Step 3: Commit**:
```bash
git add apps/mobile/services/settings.ts apps/mobile/services/__tests__/settings.test.ts
git commit -m "feat(mobile): settings read/write for income bracket, GWA, province, city"
```
(Adjust paths to the real settings module.)

---

# B3 — Eligibility matcher (pure)

## Task 4: scholarshipMatch.ts (TDD)

**Files:** Create `apps/mobile/utils/scholarshipMatch.ts` + `apps/mobile/utils/__tests__/scholarshipMatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { matchScholarship, INCOME_BANDS, type StudentProfile, type MatchInput } from '../scholarshipMatch'

function L(p: Partial<MatchInput>): MatchInput {
  return {
    scope: 'national', isVerified: true, incomeCeiling: null, gwaRequirement: null,
    serviceObligationYears: null, province: null, city: null, targetYearLevels: [],
    hucExcluded: false, ...p,
  }
}
const S = (p: Partial<StudentProfile> = {}): StudentProfile => ({ ...p })

describe('matchScholarship — income', () => {
  it('ineligible when band lower bound exceeds ceiling', () => {
    const r = matchScholarship(L({ incomeCeiling: 100000 }), S({ incomeBracket: '300k-600k' }))
    expect(r.status).toBe('ineligible')
    expect(r.reasons.join(' ')).toMatch(/income/i)
  })
  it('eligible when band fully under ceiling', () => {
    const r = matchScholarship(L({ incomeCeiling: 600000 }), S({ incomeBracket: '<=100k' }))
    expect(r.status).toBe('eligible')
  })
  it('maybe when band straddles ceiling', () => {
    const r = matchScholarship(L({ incomeCeiling: 200000 }), S({ incomeBracket: '100k-300k' }))
    expect(r.status).toBe('maybe')
  })
  it('maybe + warning when means-tested but income unknown', () => {
    const r = matchScholarship(L({ incomeCeiling: 100000 }), S({}))
    expect(r.status).toBe('maybe')
    expect(r.warnings.join(' ')).toMatch(/income/i)
  })
})

describe('matchScholarship — GWA', () => {
  it('ineligible below requirement', () => {
    expect(matchScholarship(L({ gwaRequirement: 90 }), S({ gwa: 85 })).status).toBe('ineligible')
  })
  it('maybe within 2 points', () => {
    expect(matchScholarship(L({ gwaRequirement: 90 }), S({ gwa: 88.5 })).status).toBe('maybe')
  })
  it('eligible at/above requirement', () => {
    expect(matchScholarship(L({ gwaRequirement: 90 }), S({ gwa: 92 })).status).toBe('eligible')
  })
  it('maybe + prompt when GWA required but missing', () => {
    const r = matchScholarship(L({ gwaRequirement: 90 }), S({}))
    expect(r.status).toBe('maybe'); expect(r.warnings.join(' ')).toMatch(/GWA/i)
  })
})

describe('matchScholarship — LGU residency', () => {
  it('ineligible when province differs', () => {
    const r = matchScholarship(L({ scope: 'provincial', province: 'Ilocos Norte' }), S({ province: 'Cebu' }))
    expect(r.status).toBe('ineligible'); expect(r.reasons.join(' ')).toMatch(/Ilocos Norte/)
  })
  it('eligible when province matches', () => {
    expect(matchScholarship(L({ scope: 'provincial', province: 'Cebu' }), S({ province: 'Cebu' })).status).toBe('eligible')
  })
  it('HUC warning for excluded city resident', () => {
    const r = matchScholarship(L({ scope: 'provincial', province: 'Cebu', hucExcluded: true }), S({ province: 'Cebu', city: 'Cebu City' }))
    expect(r.warnings.join(' ')).toMatch(/Cebu City|HUC|highly urbanized/i)
  })
})

describe('matchScholarship — verified + unknown', () => {
  it('unverified always warns', () => {
    expect(matchScholarship(L({ isVerified: false }), S()).warnings.join(' ')).toMatch(/verify|unverified/i)
  })
  it('unknown when no typed criteria', () => {
    expect(matchScholarship(L({}), S()).status).toBe('unknown')
  })
  it('exposes INCOME_BANDS map', () => {
    expect(INCOME_BANDS['<=100k']).toEqual([0, 100000])
  })
})
```

- [ ] **Step 2:** Run → FAIL (module missing). `cd apps/mobile && pnpm jest utils/__tests__/scholarshipMatch.test.ts`

- [ ] **Step 3: Implement `apps/mobile/utils/scholarshipMatch.ts`**

```ts
export type IncomeBracket = '<=100k' | '100k-300k' | '300k-600k' | '600k-1.2M' | '>1.2M' | 'unknown'
export const INCOME_BANDS: Record<Exclude<IncomeBracket, 'unknown'>, [number, number]> = {
  '<=100k': [0, 100000],
  '100k-300k': [100001, 300000],
  '300k-600k': [300001, 600000],
  '600k-1.2M': [600001, 1200000],
  '>1.2M': [1200001, Number.POSITIVE_INFINITY],
}

// Highly Urbanized Cities (independent of their province). Minimal list for warnings.
const HUC = new Set(['Cebu City','Lapu-Lapu City','Mandaue City','Davao City','Iloilo City','Bacolod City','Cagayan de Oro City','Zamboanga City','General Santos City','Angeles City','Olongapo City','Baguio City','Butuan City','Iligan City','Tacloban City','Puerto Princesa City','Lucena City','Naga City','Cotabato City'])

export interface StudentProfile { gradeLevel?: number; incomeBracket?: IncomeBracket; gwa?: number; province?: string | null; city?: string | null }
export interface MatchInput {
  scope: 'national'|'regional'|'provincial'|'city'|'school'
  isVerified: boolean
  incomeCeiling: number | null
  gwaRequirement: number | null
  serviceObligationYears: number | null
  province: string | null
  city: string | null
  targetYearLevels: string[]
  hucExcluded: boolean
}
export type MatchStatus = 'eligible' | 'maybe' | 'ineligible' | 'unknown'
export interface MatchResult { status: MatchStatus; reasons: string[]; warnings: string[] }

const RANK: Record<MatchStatus, number> = { ineligible: 3, maybe: 2, eligible: 1, unknown: 0 }

export function matchScholarship(listing: MatchInput, student: StudentProfile): MatchResult {
  const reasons: string[] = []
  const warnings: string[] = []
  const states: MatchStatus[] = []
  let hadCriterion = false

  // Income
  if (listing.incomeCeiling != null) {
    hadCriterion = true
    const C = listing.incomeCeiling
    if (!student.incomeBracket || student.incomeBracket === 'unknown') {
      states.push('maybe'); warnings.push(`Income-based (cap ~₱${C.toLocaleString()}/yr) — confirm you qualify.`)
    } else {
      const [lo, hi] = INCOME_BANDS[student.incomeBracket]
      if (lo > C) { states.push('ineligible'); reasons.push(`Your income likely exceeds the ₱${C.toLocaleString()}/yr ceiling.`) }
      else if (hi <= C) { states.push('eligible'); reasons.push(`Within the ₱${C.toLocaleString()}/yr income ceiling.`) }
      else { states.push('maybe'); warnings.push(`Your income is near the ₱${C.toLocaleString()}/yr ceiling — confirm.`) }
    }
  }

  // GWA
  if (listing.gwaRequirement != null) {
    hadCriterion = true
    const R = listing.gwaRequirement
    if (student.gwa == null) { states.push('maybe'); warnings.push(`Requires GWA ≥ ${R}% — add your GWA to check.`) }
    else if (student.gwa >= R) { states.push('eligible'); reasons.push(`Your GWA meets the ≥ ${R}% requirement.`) }
    else if (student.gwa >= R - 2) { states.push('maybe'); warnings.push(`Your GWA is close to the ${R}% cutoff.`) }
    else { states.push('ineligible'); reasons.push(`Requires GWA ≥ ${R}% (yours is ${student.gwa}%).`) }
  }

  // LGU residency
  if (listing.scope === 'provincial' || listing.scope === 'city') {
    hadCriterion = true
    if (listing.province && student.province) {
      if (student.province.trim().toLowerCase() === listing.province.trim().toLowerCase()) {
        states.push('eligible'); reasons.push(`You are a resident of ${listing.province}.`)
        if (listing.hucExcluded && student.city && HUC.has(student.city.trim())) {
          warnings.push(`${student.city} is a highly urbanized city and may be excluded from this provincial program.`)
        }
      } else { states.push('ineligible'); reasons.push(`For residents of ${listing.province}.`) }
    } else if (listing.province && !student.province) {
      states.push('maybe'); warnings.push(`For residents of ${listing.province} — set your province to confirm.`)
    }
  }

  // Year level (soft — data is messy; warn, never hard-fail)
  if (listing.targetYearLevels && listing.targetYearLevels.length > 0 && student.gradeLevel != null) {
    const wantsG12 = listing.targetYearLevels.some(y => /12|freshman|graduat/i.test(y))
    if (wantsG12 && student.gradeLevel < 11) {
      warnings.push(`Usually for Grade 12 / incoming freshmen — you are in Grade ${student.gradeLevel}.`)
    }
  }

  if (listing.serviceObligationYears && listing.serviceObligationYears > 0) {
    warnings.push(`Requires ${listing.serviceObligationYears} year(s) of service after graduation.`)
  }
  if (!listing.isVerified) warnings.push('Unverified — confirm details on the official site.')

  let status: MatchStatus = 'unknown'
  if (hadCriterion) {
    status = states.reduce<MatchStatus>((acc, s) => (RANK[s] > RANK[acc] ? s : acc), 'eligible')
  }
  return { status, reasons, warnings }
}
```

- [ ] **Step 4:** Run → PASS. `cd apps/mobile && pnpm jest utils/__tests__/scholarshipMatch.test.ts`

- [ ] **Step 5: Commit**:
```bash
git add apps/mobile/utils/scholarshipMatch.ts apps/mobile/utils/__tests__/scholarshipMatch.test.ts
git commit -m "feat(mobile/scholarships): pure eligibility matcher (income, GWA, residency, HUC, verified)"
```

---

# B2 — Data ingestion

> Parsers are self-contained Node ESM (model on `scripts/import-upcat-questions.mjs`): a quote/label-aware reader, inline cleaners, normalization, deterministic slug, emit idempotent seed SQL. Because the flat-files are messy, each parser must (a) print a row-count + per-field null-rate report, and (b) the implementer spot-checks ≥5 emitted rows against the source before committing. Where a block cannot be reliably parsed, author it by hand into the seed rather than emitting garbage.

## Task 5: National scholarships parser → seed (+ normalization tests)

**Files:** Create `scripts/parse-national-scholarships.mjs`, `supabase/seed/scholarships_national_seed.sql`, normalization test.

- [ ] **Step 1: Normalization helpers + tests.** In the parser (export the pure helpers for testing, or duplicate into a test) implement and test:
  - `normalizeCurrency('₱8,000/month') → 8000`, `'Up to ₱40,000/academic year' → 40000`, `'N/A' → null`, `'Full' → null` (full handled separately).
  - `parsePercent('85%') → 85`, `'GPA 2.75' → null` (or convert via a documented table), `'top 5%' → null`.
  - `resolveSentinel` (UNCONFIRMED/TBA/Unknown/N/A/— → null), `decodeMojibake`, `stripBom` (reuse Epic A cleaner logic — inline).
  - `slugify('DOST-SEI Undergraduate Scholarship (Merit)') → 'dost-sei-merit'` (deterministic, stable).
  Add `scripts/__tests__/scholarshipNormalize.test.mjs` (run via `node --test scripts/__tests__/scholarshipNormalize.test.mjs`) or place the helpers in `apps/admin/lib/csv/` and use vitest. Verify these pass before parsing.

- [ ] **Step 2: Parse + map.** Read the national flat-file, split into per-program blocks, extract the label|value fields, map to `listings` columns:
  - `type='scholarship'`, `scope='national'`, `provider`=Administering Body, `title`=Scholarship Name, `slug`=slugify, `description`=a composed summary, `coverage`=tuition/benefits summary, `external_url`=Official Website, `region`='National', `is_verified=true` for the confirmed programs (the file's "NOT confirmed" list → `is_verified=false`).
  - Typed: `income_ceiling` (from Income Ceiling), `gwa_requirement` (from GWA/Grade Requirement when a clean %), `monthly_stipend`, `service_obligation_years` (YES + "1 year per year" → store the per-year obligation as the duration or 1), `has_entrance_exam` (Has Own Entrance Exam? YES/NO), `application_window` (Application Period).
  - `requirements` text[] from Documentary Requirements (split on commas/semicolons).
  - `target_year_levels` from Year Level Eligible.
  - `scholarship_meta` jsonb: { other_benefits[], tuition_coverage, renewal_gwa, slots, citizenship, selection_method, exam_subtests, uses_upcat_scores, contact, source_url }.
  - Emit `INSERT INTO listings (...) VALUES (...) ON CONFLICT (slug) DO UPDATE SET ...` for the scholarship + typed + meta columns (do NOT overwrite `created_at`). Escape single quotes by doubling. jsonb via `'{...}'::jsonb`.

- [ ] **Step 3: Run + verify.** `node scripts/parse-national-scholarships.mjs "<national txt>" > supabase/seed/scholarships_national_seed.sql` (or write file inside the script). Print the report; spot-check 5 rows.

- [ ] **Step 4: Commit**:
```bash
git add scripts/parse-national-scholarships.mjs scripts/__tests__/scholarshipNormalize.test.mjs supabase/seed/scholarships_national_seed.sql
git commit -m "feat(scholarships): national parser + seed (~22 programs, typed + meta)"
```

## Task 6: LGU scholarships parser → seed

**Files:** Create `scripts/parse-lgu-scholarships.mjs`, `supabase/seed/scholarships_lgu_seed.sql`

- [ ] **Step 1: Parse + map.** Read the LGU flat-file, one block per `Scholarship ID`. Map:
  - `type='scholarship'`, `slug`=lowercased Scholarship ID (e.g. `lgu-r1-iln-001`), `title`=Full Name, `provider`=Administering Body, `region`=canonicalizeRegion(Region), `province`=Province, `city`=City (when present), `scope`='provincial' (or 'city' when a city government), `is_verified` = (Status==='Active'/'Verified'), `external_url`/`scholarship_meta.source_url`=Contact/Source.
  - Typed: `gwa_requirement` (parse a clean % from GWA Requirement, else null), `monthly_stipend` (from Benefits when parseable, else null), `income_ceiling` = null (LGU income is free-text "indigent" → store in meta).
  - `scholarship_meta`: { benefits_text, income_requirement_text, residency_required:true, slots, application_period, notes, huc_excluded: (scope==='provincial') }.
  - `requirements` text[] from any documentary list if present.
  - Emit idempotent `ON CONFLICT (slug) DO UPDATE` inserts.

- [ ] **Step 2: Run + verify** (report + spot-check ≥5, including 1 unverified and 1 city program).

- [ ] **Step 3: Commit**:
```bash
git add scripts/parse-lgu-scholarships.mjs supabase/seed/scholarships_lgu_seed.sql
git commit -m "feat(scholarships): LGU parser + seed (~113 programs, province/city + verified flag)"
```

## Task 7: DLSU/DCAT aid-window refresh

**Files:** Append to `supabase/seed/scholarships_national_seed.sql` (or a tiny `supabase/seed/dlsu_dcat_refresh.sql`)

- [ ] **Step 1:** Add an idempotent `UPDATE listings SET application_window='Apr 17–May 17, 2026 (St. La Salle Grant, DCAT applicants)', scholarship_meta = scholarship_meta || '{"special_dcat_window":"May 26–Jun 1, 2026"}'::jsonb WHERE slug='dcat-dlsu';` — first confirm the real slug via `SELECT slug FROM listings WHERE title ILIKE '%dcat%' OR title ILIKE '%la salle%'` (controller runs at apply time; if no such row exists, INSERT it as a `type='exam'`/aid listing instead).

- [ ] **Step 2: Commit** with the chosen approach.

---

# B6 — Sync + Admin

## Task 8: Sync pulls new listing columns

**Files:** Modify `apps/mobile/services/sync.ts`

- [ ] **Step 1:** Extend the `listings` `.select(...)` string with `,province,city,scope,is_verified,income_ceiling,gwa_requirement,monthly_stipend,service_obligation_years,has_entrance_exam,application_window,scholarship_meta`. In the upsert mapping add the fields: booleans via `!!row.is_verified` / `!!row.has_entrance_exam`; `scholarshipMeta: JSON.stringify(row.scholarship_meta ?? {})`; numerics pass through `?? null`; province/city/scope/applicationWindow `?? null` (scope default 'national' if null).

- [ ] **Step 2:** Extend the real-SQLite sync test (the Epic A pattern): seed a mock listing row with the new fields, run `syncOnLaunch`, assert they land (e.g. `is_verified` → 1, `scholarship_meta` round-trips as JSON string, `income_ceiling` numeric). `cd apps/mobile && pnpm jest services/__tests__/sync.test.ts 2>&1 | tail -10`.

- [ ] **Step 3: Commit**:
```bash
git add apps/mobile/services/sync.ts apps/mobile/services/__tests__/sync.test.ts
git commit -m "feat(mobile/scholarships): sync pulls scholarship typed columns + meta"
```

## Task 9: Admin ListingDrawer — typed fields

**Files:** Modify `apps/admin/components/admin/ListingDrawer.tsx`

- [ ] **Step 1:** Read the drawer; add inputs (matching its existing field styling) for: province, city, scope (select of the 5 values), is_verified (checkbox/toggle), income_ceiling (number ₱), gwa_requirement (number %), monthly_stipend (number ₱), service_obligation_years (number), has_entrance_exam (toggle), application_window (text). Wire them into the existing save payload (the API/route that writes listings — extend it to accept these columns). Leave `scholarship_meta` out of v1 UI (seed-only).

- [ ] **Step 2:** Type-check + build: `cd apps/admin && pnpm exec tsc --noEmit 2>&1 | grep -i listing | head; pnpm build 2>&1 | grep -iE "error|Compiled" | head`. If a drawer test exists, update it.

- [ ] **Step 3: Commit**:
```bash
git add apps/admin/components/admin/ListingDrawer.tsx
git commit -m "feat(admin/scholarships): edit scholarship typed fields in ListingDrawer"
```

---

# B4 — Onboarding

## Task 10: Onboarding income/GWA/province step

**Files:** Modify `apps/mobile/app/onboarding.tsx` (+ settings write from Task 3)

- [ ] **Step 1:** Read `onboarding.tsx`. Add one optional step AFTER the school/grade step and BEFORE pre-assessment (so it never gates account creation). UI: income bracket single-select chips (the 5 bands + "Prefer not to say" → stores `undefined`/`'unknown'`); GWA numeric input (75–100, with Skip); province picker defaulted from the chosen school's province when resolvable (derive via the `schools` table / existing school record; else a plain province select). A "Skip" control advances without setting fields.

- [ ] **Step 2:** Persist via the Task 3 settings update (incomeBracket, gwa, province, city). Also write province/city + year_level to `profiles` on next sync (extend the profile push if one exists; else note for sync).

- [ ] **Step 3:** Type-check + onboarding test if present: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -i onboarding | head; pnpm jest onboarding 2>&1 | tail -6`.

- [ ] **Step 4: Commit**:
```bash
git add apps/mobile/app/onboarding.tsx
git commit -m "feat(mobile/onboarding): optional income bracket + GWA + province step (matcher inputs)"
```

---

# B5 — Scholarships UI

## Task 11: Browse facets + match pill on cards

**Files:** Modify `apps/mobile/app/(tabs)/listings.tsx`; Create `apps/mobile/components/scholarships/MatchPill.tsx`

- [ ] **Step 1: MatchPill.** Create a small component that takes a `MatchStatus` and renders a colored pill ("✓ Eligible" green / "Maybe" amber / "Not eligible" muted / hidden for unknown). Use the theme tokens.

- [ ] **Step 2: Facets.** In `listings.tsx` Scholarships segment, add facet chips: Provider, Province, Verified-only, **Near me** (filter `province === user.province`), **Eligible for me** (compute `matchScholarship` per listing from `user_settings`; keep `eligible`+`maybe`). Read the user's matcher inputs from settings once. Render `MatchPill` + verified badge + province on each scholarship card. Keep existing search + region chips working. Build the `MatchInput` for each row from the synced columns (parse `scholarship_meta` JSON for `hucExcluded`).

- [ ] **Step 3:** Type-check + practice/listings tests if any: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -iE "listings|MatchPill" | head`.

- [ ] **Step 4: Commit**:
```bash
git add "apps/mobile/app/(tabs)/listings.tsx" apps/mobile/components/scholarships/MatchPill.tsx
git commit -m "feat(mobile/scholarships): browse facets + eligible-for-me + match pills"
```

## Task 12: Detail-screen enrichment

**Files:** Modify `apps/mobile/app/listings/[slug].tsx`

- [ ] **Step 1:** For scholarship-type listings, add: a `matchScholarship` status pill + reasons block near the top; rows for income ceiling, minimum GWA, monthly stipend, application window, scope/region/province chips; a **service-obligation warning** banner when `serviceObligationYears > 0`; a **HUC-exclusion warning** when the matcher returns it; a verified badge + persistent "Details change yearly — verify on the official site" note + the `external_url` button; render `scholarship_meta.other_benefits` under Benefits. Reuse the existing `RequirementsChecklist`. Parse `scholarship_meta` JSON safely (try/catch → {}).

- [ ] **Step 2:** Type-check: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -iE "listings/\\[slug\\]" | head`.

- [ ] **Step 3: Commit**:
```bash
git add "apps/mobile/app/listings/[slug].tsx"
git commit -m "feat(mobile/scholarships): detail enrichment (match status, ceilings, service + HUC warnings, verified)"
```

---

# Verify + deliver

## Task 13: Full verification + apply 019 + seeds via MCP

- [ ] **Step 1:** Full suites + build:
```bash
cd apps/admin && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -3
cd apps/mobile && pnpm test 2>&1 | tail -6
```
Expected: green; admin build clean.

- [ ] **Step 2 (controller, MCP):** Apply migration 019 via `apply_migration`; verify columns + constraint + indexes. Then apply `scholarships_national_seed.sql`, `scholarships_lgu_seed.sql`, and the DLSU refresh via `execute_sql`. Verify: `SELECT scope, count(*) FROM listings WHERE type='scholarship' GROUP BY scope`; `SELECT count(*) FILTER (WHERE is_verified), count(*) FROM listings WHERE type='scholarship'`; spot-check 3 rows' typed fields vs source. Run `get_advisors security` — confirm no NEW issues from listings changes.

- [ ] **Step 3:** Mobile JS ships in the final-batch OTA (not now). Note count expectations: ~135 scholarships total.

- [ ] **Step 4:** Manual smoke (after OTA): onboarding new step → set income/GWA/province; Scholarships tab → facets + "eligible for me" filter; open a national + an LGU detail → match pill, ceilings, service-obligation + HUC + verified warnings render; "near me" shows your province's LGU programs.

---

## Self-review against the spec
- B1 schema → Tasks 1–3 ✓ (listings typed cols, profiles location, mobile mirror, user_settings, settings helper)
- B2 ingestion → Tasks 5–7 ✓ (national + LGU parsers + seeds + DLSU refresh, normalization tests, verification pass)
- B3 matcher → Task 4 ✓ (pure, exhaustively tested: income/GWA/residency/HUC/verified/unknown)
- B4 onboarding → Task 10 ✓ (optional, non-blocking, province-from-school)
- B5 UI → Tasks 11–12 ✓ (facets, eligible-for-me, near-me, match pills, detail enrichment, warnings)
- B6 sync + admin → Tasks 8–9 ✓
- Delivery → Task 13 ✓ (suites, build, apply 019 + seeds via MCP, verification; OTA batched)
- Type/name consistency: `matchScholarship`/`MatchInput`/`MatchStatus`/`INCOME_BANDS`/`scholarshipMeta`/`is_verified`/`scholarship_meta` used consistently across tasks ✓
