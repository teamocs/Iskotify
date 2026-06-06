# Epic E — Admission Score Estimator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes. QA: run `npx react-doctor --project @iskotify/mobile --diff <base>` on changed mobile code; fix new bug-errors (esp. `{n && <JSX/>}` bare-zero).

**Goal:** An unofficial Admission Score Estimator (1.0–5.0) computed in a SECURITY DEFINER RPC, mapped to per-campus cutoffs, with EEAS breakdown + mandatory EN/TL disclaimers + zero UP branding.

**Architecture:** `mobile → supabase.rpc('estimate_admission_score', payload) → SECURITY DEFINER fn (formula+baselines+EEAS+reads upcat_cutoffs) → jsonb`. Grades/profile stored locally (SQLite user_settings) + passed to the stateless RPC. Mock subtest % = rolling 3-session local average. Coefficients live ONLY in the RPC.

**Tech Stack:** Supabase Postgres (plpgsql SECURITY DEFINER RPC + public-read table); Expo RN + Drizzle/expo-sqlite + Jest. supabase-js `.rpc()` (first use in app).

**Spec:** [docs/superpowers/specs/2026-06-07-epic-e-admission-score-estimator-design.md](../specs/2026-06-07-epic-e-admission-score-estimator-design.md)

**Delivery:** migration 020 + seeds + palugit-fact fix applied via MCP (project `dtugrsbarruizgzowgso`) at verify; mobile ships in final-batch OTA. Highest migration applied: 019. Next: 020.

---

## Task 1: Migration 020 — `upcat_cutoffs` + `estimate_admission_score` RPC

**Files:** Create `supabase/migrations/020_admission_score.sql`

- [ ] **Step 1: Write the migration.** Table + RPC. The RPC implements the Manlapaz regression with static z-baselines, EEAS via client-passed booleans/types, clamps to [1,5], reads `upcat_cutoffs` for per-campus status.

```sql
CREATE TABLE IF NOT EXISTS upcat_cutoffs (
  id text PRIMARY KEY,
  campus text NOT NULL,
  program text,
  cutoff numeric NOT NULL,
  year int,
  is_estimate boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE upcat_cutoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upcat_cutoffs_read ON upcat_cutoffs;
CREATE POLICY upcat_cutoffs_read ON upcat_cutoffs FOR SELECT USING (true);
DROP TRIGGER IF EXISTS upcat_cutoffs_updated_at ON upcat_cutoffs;
CREATE TRIGGER upcat_cutoffs_updated_at BEFORE UPDATE ON upcat_cutoffs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.estimate_admission_score(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m_mean CONSTANT numeric := 50; m_sd CONSTANT numeric := 12;
  r_mean CONSTANT numeric := 58; r_sd CONSTANT numeric := 10;
  l_mean CONSTANT numeric := 62; l_sd CONSTANT numeric := 9;
  s_mean CONSTANT numeric := 52; s_sd CONSTANT numeric := 11;
  h_mean CONSTANT numeric := 88; h_sd CONSTANT numeric := 5;
  hsgwa numeric := (payload->>'hsGWA')::numeric;
  ma numeric := COALESCE((payload->>'math')::numeric, m_mean);
  rc numeric := COALESCE((payload->>'reading')::numeric, r_mean);
  lp numeric := COALESCE((payload->>'language')::numeric, l_mean);
  sc numeric := COALESCE((payload->>'science')::numeric, s_mean);
  school_type text := COALESCE(payload->>'schoolType','');
  is_ip boolean := COALESCE((payload->>'isIndigenous')::boolean, false);
  target_far boolean := COALESCE((payload->>'targetCampusFar')::boolean, false);
  zma numeric; zrc numeric; zlp numeric; zsc numeric; zh numeric;
  upg numeric; eff numeric; palugit numeric := 0; pabigat numeric := 0; elig_pal boolean := false;
  lo numeric; hi numeric; campuses jsonb;
BEGIN
  IF hsgwa IS NULL THEN RAISE EXCEPTION 'hsGWA required'; END IF;
  ma := least(greatest(ma,0),100); rc := least(greatest(rc,0),100);
  lp := least(greatest(lp,0),100); sc := least(greatest(sc,0),100);
  hsgwa := least(greatest(hsgwa,0),100);
  zma := (ma-m_mean)/m_sd; zrc := (rc-r_mean)/r_sd; zlp := (lp-l_mean)/l_sd;
  zsc := (sc-s_mean)/s_sd; zh := (hsgwa-h_mean)/h_sd;
  upg := 2.8101 - 0.047147*zma - 0.046402*zrc - 0.1381*zlp - 0.15531*zh - 0.025178*(zsc*zlp*zh);
  upg := least(greatest(upg,1.0),5.0);
  elig_pal := is_ip OR school_type IN ('public_general','public_vocational','public_barangay');
  IF elig_pal THEN palugit := 0.05; END IF;
  IF target_far THEN pabigat := 0.05; END IF;
  eff := least(greatest(upg - palugit + pabigat, 1.0), 5.0);
  lo := greatest(eff-0.20,1.0); hi := least(eff+0.20,5.0);
  SELECT jsonb_agg(jsonb_build_object(
    'campus', c.campus, 'program', c.program, 'cutoff', c.cutoff, 'year', c.year,
    'isEstimate', c.is_estimate,
    'status', CASE WHEN eff <= c.cutoff THEN 'likely' WHEN eff <= c.cutoff+0.30 THEN 'possible' ELSE 'unlikely' END,
    'gap', round(eff - c.cutoff, 3)) ORDER BY c.cutoff)
  INTO campuses FROM upcat_cutoffs c WHERE c.program IS NULL;
  RETURN jsonb_build_object(
    'point', round(eff,3), 'low', round(lo,3), 'high', round(hi,3),
    'eeas', jsonb_build_object('palugit', palugit, 'pabigat', pabigat, 'eligiblePalugit', elig_pal),
    'campuses', COALESCE(campuses, '[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.estimate_admission_score(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_admission_score(jsonb) TO authenticated;
```

**RECONCILIATION NOTE (verify at Step 2):** the brief's worked example (hsGWA 91.5, math 62.3, reading 71.0, language 68.5, science 58.8 → point ≈1.87) does NOT reproduce from the Manlapaz formula + these static baselines (which yield ≈2.49 — the worked example appears to use the brief's *simplified* `0.60·normUPCAT + 0.40·normHSGWA` form). This MVP uses the documented Manlapaz regression as the server method; the estimate is explicitly approximate (disclaimers cover this). Do NOT hard-fix the formula to hit 1.87. The result must be sane ([1,5]) + monotonic (better inputs → lower point). If product later prefers the simplified form, swap the `upg :=` line — it's isolated.

- [ ] **Step 2: Apply via MCP + verify (controller).** `mcp__supabase__apply_migration` (020). Then `mcp__supabase__execute_sql`: `SELECT estimate_admission_score('{"hsGWA":91.5,"math":62.3,"reading":71.0,"language":68.5,"science":58.8}'::jsonb);` → assert it returns a jsonb with point in [1,5], a campuses array, eeas object. Then test monotonicity (a higher-grades payload returns a LOWER point), the palugit branch (`schoolType:'public_general'` lowers point by 0.05), the pabigat branch (`targetCampusFar:true` raises by 0.05), and `GRANT` (function exists, executable). Confirm `upcat_cutoffs` table + RLS via `get_advisors security` shows no new issues.

- [ ] **Step 3: Commit** `feat(db): upcat_cutoffs + estimate_admission_score SECURITY DEFINER RPC` (file only; controller applies).

## Task 2: Cutoffs seed + palugit-fact fix

**Files:** Create `supabase/seed/upcat_cutoffs_seed.sql`; Modify `supabase/seed/upcat_facts_seed.sql`

- [ ] **Step 1:** `upcat_cutoffs_seed.sql` — idempotent inserts:
```sql
INSERT INTO upcat_cutoffs (id, campus, program, cutoff, year, is_estimate) VALUES
('updiliman-2019','UP Diliman',NULL,2.174,2019,true),
('upbaguio-2019','UP Baguio',NULL,2.421,2019,true),
('upmanila-2019','UP Manila',NULL,2.580,2019,true),
('upcebu-2019','UP Cebu',NULL,2.700,2019,true),
('uplosbanos-2019','UP Los Baños',NULL,2.800,2019,true),
('upmindanao-2019','UP Mindanao',NULL,2.800,2019,true),
('upvisayas-2019','UP Visayas',NULL,2.800,2019,true),
('upou-2019','UP Open University',NULL,2.800,2019,true),
('updiliman-cs-2025','UP Diliman','BS Computer Science',1.550,2025,false),
('updiliman-arch-2025','UP Diliman','BS Architecture',1.600,2025,false)
ON CONFLICT (id) DO UPDATE SET campus=EXCLUDED.campus, program=EXCLUDED.program, cutoff=EXCLUDED.cutoff, year=EXCLUDED.year, is_estimate=EXCLUDED.is_estimate;
```
(Note: UP Tacloban omitted — no cutoff datum; add later. That's 8 campus rows + 2 program rows.)

- [ ] **Step 2:** In `upcat_facts_seed.sql`, change the `algorithm-palugit-01` row's `answer` so the palugit magnitude is **0.05** not 0.5, with a note: "...lowers your UPG by about 0.05 (per the original EEAS committee figure, Lontoc 2011; some secondary sources cite 0.5)...". Keep eligibility text. (Controller re-applies that one row via execute_sql at verify.)

- [ ] **Step 3: Commit** `feat(db/seed): upcat_cutoffs seed + correct palugit fact (0.05)`.

## Task 3: Mobile schema — estimator inputs + cutoffs mirror + sync

**Files:** Modify `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`, `apps/mobile/services/sync.ts`

- [ ] **Step 1:** `schema.ts`: `user_settings` += `hsGwaG8: real('hs_gwa_g8')`, `hsGwaG9`, `hsGwaG10`, `hsGwaG11` (real), `schoolType: text('school_type')`, `isIndigenous: integer('is_indigenous',{mode:'boolean'})`, `targetCampus: text('target_campus')`, `scoreDisclaimerAck: integer('score_disclaimer_ack',{mode:'boolean'}).notNull().default(false)`. Add a new table:
```ts
export const upcatCutoffs = sqliteTable('upcat_cutoffs', {
  id: text('id').primaryKey(), campus: text('campus').notNull(), program: text('program'),
  cutoff: real('cutoff').notNull(), year: integer('year'),
  isEstimate: integer('is_estimate',{mode:'boolean'}).notNull().default(true),
})
```
- [ ] **Step 2:** `client.ts` MIGRATIONS: ALTERs for the user_settings cols + `CREATE TABLE IF NOT EXISTS upcat_cutoffs (...)`.
- [ ] **Step 3:** `sync.ts`: pull `upcat_cutoffs` (`supabase.from('upcat_cutoffs').select('id,campus,program,cutoff,year,is_estimate')`) + upsert loop (boolean via `!!`). Extend the sync test to assert a cutoff row lands.
- [ ] **Step 4:** tsc + sync test green. **Commit** `feat(mobile): estimator settings cols + upcat_cutoffs mirror + sync`.

## Task 4: Pure helpers (TDD)

**Files:** Create `apps/mobile/utils/subtestRolling.ts` + test; `apps/mobile/utils/estimatorInputs.ts` + test

- [ ] **Step 1: Tests.** `subtestRolling.test.ts`: `rollingSubtestAverages(sessions, n=3)` → `{ math, reading, language, science }` (percent 0–100 or null) from the last n sessions per subtest. A session is `{ subtest, score, total, completedAt }`; subtest names map Epic A's `'Mathematics'→math, 'Science'→science, 'Language Proficiency'→language, 'Reading Comprehension'→reading`. Tests: averages last 3 of a subtest, ignores other subtests, <3 sessions averages what exists, null when none. `estimatorInputs.test.ts`: `computeHsGwa({g8,g9,g10,g11})` averages provided grades (skips null, e.g. G8 missing) → number|null; `isTargetCampusFar(targetCampus, studentRegion)` uses a campus→island map (Luzon/Visayas/Mindanao) + a region→island map → boolean (true when different island; false when same/unknown). `validateGwa(n)` → 0–100 or null.
- [ ] **Step 2:** Implement both (pure, NO formula/coefficients — just data prep + public geography). `isTargetCampusFar`: map UP Diliman/Manila/Los Baños/Baguio/Open University→Luzon, UP Visayas/Cebu→Visayas, UP Mindanao→Mindanao; map PH regions/provinces→island (a compact lookup; default unknown→not far).
- [ ] **Step 3:** Jest green. **Commit** `feat(mobile/estimator): rolling subtest avg + input helpers (pure)`.

## Task 5: Grade-input screen

**Files:** Create `apps/mobile/app/estimator/grades.tsx`

- [ ] **Step 1:** Read `apps/mobile/services/settings.ts` (getSettings/updateSettings — extend it for the new cols) + an existing form screen for styling. Build a Simple-Mode form: G8–G11 GWA inputs (numeric 0–100, G8 marked optional), school-type picker (Public (general) / Public (vocational) / Public (barangay) / Public science HS / SUC-administered / Private — map to enum values `public_general|public_vocational|public_barangay|public_science|suc|private`), Indigenous-Peoples toggle (optional), target-campus picker (the 8–9 campuses). Persist via `updateSettings`. Validate via `validateGwa`.
- [ ] **Step 2:** tsc + (test if a sibling form test pattern exists). **Commit** `feat(mobile/estimator): grade + profile input screen`.

## Task 6: Disclaimer modal (EN+TL)

**Files:** Create `apps/mobile/components/estimator/ScoreDisclaimerModal.tsx`

- [ ] **Step 1:** A non-dismissable (until "I understand") full-screen modal with EN + TL copy (unofficial estimate, not affiliated with/endorsed by UP, verify at upcat.up.edu.ph, no guarantees). On acknowledge → set `user_settings.scoreDisclaimerAck=true` via updateSettings. Also export a compact `<ScoreDisclaimerNotice />` inline banner (EN+TL short form) for permanent display. NO UP logos/wordmarks.
- [ ] **Step 2:** tsc + a render test (modal shows until ack; notice always renders). **Commit** `feat(mobile/estimator): mandatory EN/TL disclaimer modal + inline notice`.

## Task 7: Estimator screen + Practice entry

**Files:** Create `apps/mobile/app/estimator/index.tsx`; Modify `apps/mobile/app/(tabs)/practice.tsx`

- [ ] **Step 1:** Estimator screen: on mount, gate on `scoreDisclaimerAck` (show `ScoreDisclaimerModal` if false). Load grades + profile from settings; compute rolling subtest %s from local `practice_sessions` (via `rollingSubtestAverages`). If grades missing → prompt to open `/estimator/grades`. Build the payload `{ hsGWA: computeHsGwa(...), math, reading, language, science, schoolType, isIndigenous, targetCampusFar: isTargetCampusFar(targetCampus, region) }` and call `supabase.rpc('estimate_admission_score', { payload })`. (Confirm supabase-js rpc arg shape — the fn takes one jsonb param `payload`; call as `.rpc('estimate_admission_score', { payload })`.) Render: a **1.0–5.0 range bar** (lower=better; mark point + low–high), the **EEAS breakdown** (palugit/pabigat chips; pabigat shows the "geographic adjustment — exact value not public" caveat), and a **per-campus list** (Likely=green / Possible=amber / Unlikely=muted, with cutoff + gap + an "estimate" tag when isEstimate). Permanent `<ScoreDisclaimerNotice />` at top. Handle offline/rpc-error gracefully (show last? or a "needs connection" message). NO UP branding.
- [ ] **Step 2:** Practice tab: add an "📊 Admission Score Estimator" card routing to `/estimator`. (Place near the UPCAT card.)
- [ ] **Step 3:** tsc + react-doctor (mobile) + tests. **Commit** `feat(mobile/estimator): estimator screen (RPC, range bar, EEAS, per-campus) + Practice entry`.

## Task 8: Recompute after mock session

**Files:** Modify `apps/mobile/app/estimator/index.tsx` (+ wherever sessions complete, if a hook is cleaner)

- [ ] **Step 1:** Ensure the estimator recomputes when revisited after a new mock session — simplest: recompute on screen focus (`useFocusEffect`) so a freshly-completed UPCAT mock updates the rolling average + estimate next time the estimator is opened. (No push needed for MVP; the brief's "recomputed after each session" is satisfied by focus-recompute.) Optionally show a small "based on your last N mock sessions" note.
- [ ] **Step 2:** tsc + test. **Commit** `feat(mobile/estimator): recompute estimate on focus (after new mocks)`.

## Task 9: Verify + apply

- [ ] **Step 1:** `cd apps/mobile && pnpm test 2>&1 | tail -6`; `cd apps/admin && pnpm test 2>&1 | tail -4`; `npx react-doctor --project @iskotify/mobile --diff <epic-base> --no-warnings --no-telemetry` → no new bug-errors.
- [ ] **Step 2 (controller, MCP):** apply migration 020; apply `upcat_cutoffs_seed.sql`; re-apply the corrected palugit fact row; run the RPC verification queries (Task 1 Step 2); `SELECT count(*) FROM upcat_cutoffs` → 10; `get_advisors security`.
- [ ] **Step 3:** Manual smoke (after OTA): Practice → Admission Score Estimator → first-access disclaimer modal (EN+TL) → enter grades → see range bar + per-campus Likely/Possible/Unlikely + EEAS; take a Math mock → estimate updates.

---

## Self-review against the spec
- RPC (coeffs server-side, EEAS, per-campus, clamp) → Task 1 ✓
- cutoffs + palugit fix → Task 2 ✓
- schema (settings cols, cutoffs mirror, sync) → Task 3 ✓
- pure helpers (rolling avg, geography, hsGWA) — no coeffs client-side → Task 4 ✓
- grade-input → Task 5; disclaimer EN/TL → Task 6; estimator screen + range bar + EEAS + per-campus + Practice entry → Task 7; recompute → Task 8 ✓
- naming "Admission Score Estimator", no UP branding, EN/TL disclaimers ✓
- delivery via MCP + OTA ✓
- Type/name consistency: `estimate_admission_score`/`upcat_cutoffs`/`rollingSubtestAverages`/`computeHsGwa`/`isTargetCampusFar`/`scoreDisclaimerAck` ✓
- Reconciliation caveat (1.87 vs 2.49) flagged in Task 1 ✓
