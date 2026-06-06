# Epic E — Admission Score Estimator — Design Spec

**Date:** 2026-06-07
**Status:** Draft for review
**Master plan:** [2026-06-06-mvp-upgrades-master-plan.md](2026-06-06-mvp-upgrades-master-plan.md) (Epic E §2)
**Source:** `…/Iskotify Upgrades/_extracted/upg-calculator-dev-brief.txt` (v1.0, Jun 2026)
**Locked decisions:** unofficial-estimate posture — strong **EN+TL disclaimers**, ZERO UP branding/logos, "verify at upcat.up.edu.ph", regression coefficients **server-side only**. This epic: compute in a **SECURITY DEFINER Postgres RPC**; **full** estimator scope.

---

## 1. Goal

Give students an honest, unofficial **estimated admission score (1.0–5.0, lower=better)** combining their high-school grades (40%) and mock-exam subtest performance (60%), mapped to per-campus reference cutoffs (Likely / Possible / Unlikely), with the EEAS palugit/pabigat adjustment shown — never presented as the official UPG, never UP-branded.

## 2. Naming & legal (non-negotiable)

- User-facing name: **"Admission Score Estimator"** / "Estimated Admission Score". Do NOT use "UPG Calculator" or any UP logo/wordmark in UI or store copy.
- **Mandatory disclaimer**: a non-dismissable full-screen modal on first access + a permanent inline notice on every estimator screen, in **English + Tagalog**: e.g. *"This is an unofficial estimate only and is not affiliated with or endorsed by the University of the Philippines. Verify everything at upcat.up.edu.ph."* / *"Ito ay hindi opisyal na estima lamang…"*.
- Coefficients/baselines NEVER ship in the mobile bundle — they live only in the RPC (server).

## 3. Architecture

`mobile estimator screen → supabase.rpc('estimate_admission_score', inputs) → SECURITY DEFINER fn (formula + baselines + EEAS + reads upcat_cutoffs) → jsonb {point, low, high, eeas, campuses[]} → render`. HS grades + profile inputs are captured + stored **locally** (SQLite `user_settings`) and passed to the RPC each call (RPC is stateless except reading public `upcat_cutoffs`). Mock subtest performance is a **rolling 3-session average** computed locally from `practice_sessions`. The estimate requires connectivity (the RPC); cutoffs are also mirrored to SQLite for the comparison list to render offline with the last estimate.

## 4. The RPC (security-critical core) — `estimate_admission_score`

A `CREATE FUNCTION public.estimate_admission_score(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, `GRANT EXECUTE` to `authenticated`. Holds, server-side only:

**Manlapaz formula (from the brief, identical to the public fact but kept server-side per the decision):**
```
UPG = 2.8101
      - 0.047147*ZMA  - 0.046402*ZRC  - 0.1381*ZLP
      - 0.15531*ZHSWA - 0.025178*(ZSC*ZLP*ZHSWA)
```
**Static z-baselines (mean/sd):** math 50/12, reading 58/10, language 62/9, science 52/11, hsGWA 88/5. `Z = (rawPercent - mean)/sd`.

**Pipeline:** compute z's → UPG point → clamp [1.0,5.0] → **EEAS**: palugit −0.05 (eligible: school_type ∈ {public_general, public_vocational, public_barangay} OR is_indigenous; NOT public_science/SUC/private), pabigat +0.05 (target campus region ≠ student region; flagged "geographic adjustment, exact value not public") → effective point → range = point ± 0.20. (Use palugit **0.05**, per the brief citing Lontoc 2011 — NOT 0.5; see §8.)

**Per-campus mapping:** read `upcat_cutoffs` (optionally filtered to target campus/programs); for each, `status = point <= cutoff ? 'likely' : point <= cutoff + 0.30 ? 'possible' : 'unlikely'`, with `gap = point - cutoff`. Return only campus-level rows by default + the target program rows if provided.

**Returns jsonb:** `{ point, low, high, eeas: { palugit, pabigat, eligiblePalugit }, campuses: [{ campus, program, cutoff, year, isEstimate, status, gap }] }`. Input-validate/clamp every numeric; missing subtest → use baseline mean (z=0) with a `confidence:'low'` flag.

Deployed via migration 020 (DDL) — same MCP flow as 016–019.

## 5. Data model (E1)

**Supabase (migration 020):**
- `upcat_cutoffs` (public-read RLS): `id text pk, campus text, program text, cutoff numeric, year int, is_estimate boolean default true, updated_at timestamptz default now()` + updated_at trigger.
- the RPC (§4).
- (Profiles cols school_type/is_indigenous/target_campus are NOT added server-side for MVP — grades+profile inputs live locally and are passed to the RPC; cross-device persistence is V2.)

**Mobile SQLite:**
- `user_settings` += `hs_gwa_g8`, `hs_gwa_g9`, `hs_gwa_g10`, `hs_gwa_g11` (real, nullable), `school_type` (text), `is_indigenous` (int bool), `target_campus` (text). (Reuse existing `province`/`region` for the pabigat region check; `gwa` from Epic B is the overall and is NOT reused here.)
- `upcat_cutoffs` mirror table (synced, public-read) for offline display.
- `sync.ts` pulls `upcat_cutoffs`.

## 6. Mobile (E3) — screens

- **Grade-input screen** (Simple Mode): four GWA fields (G8–G11, 0–100; G8 skippable with a "lower confidence" note per the brief), a **school-type** picker (6 options), an **Indigenous Peoples** toggle (optional, for palugit), and a **target campus** picker (9 campuses). Persist to `user_settings`. (Detailed per-subject Mode is V2.)
- **Estimator screen**: gathers HS GWAs (from settings) + rolling-3-session subtest %s (computed locally) + school_type/is_indigenous/target_campus/region, calls the RPC, and renders: a **1.0–5.0 range bar** (point + low–high band), an **EEAS breakdown** (palugit/pabigat chips with the geographic caveat), and a **per-campus list** with Likely/Possible/Unlikely badges + gap. Recompute after each completed mock session (and on grade edits). Empty/needs-more-data states when grades or mock scores are missing.
- **Disclaimer**: `UPGDisclaimerModal` (first-access, non-dismissable until acknowledged, stored ack in settings) + a permanent collapsible inline notice (EN+TL) on the estimator screen.
- **Entry point**: a "📊 Admission Score Estimator" card on the **Practice** tab (it is practice-fed) routing to the estimator; optionally a compact score chip on Home (defer if noisy). No new tab (nav is full).

## 7. Pure helpers (testable, client-side — NO coefficients)
`apps/mobile/utils/subtestRolling.ts`: `rollingSubtestAverages(sessions, n=3)` → `{ math, reading, language, science }` percentages from the last n `practice_sessions` per subtest (maps Epic A subtest names → the four keys). `apps/mobile/utils/estimatorInputs.ts`: validate/normalize grade inputs. These hold NO formula — just data prep for the RPC call.

## 8. Fix the palugit fact (E5)
`upcat_facts` `algorithm-palugit-01` currently says "+0.5 bonus". The dev brief (citing Lontoc 2011) says the EEAS palugit is **0.05**, and explicitly "do NOT use 0.5". Correct the fact row (answer + a note that secondary sources cite 0.5 but the committee figure is 0.05) in `supabase/seed/upcat_facts_seed.sql` and re-apply that single row via MCP. The RPC uses 0.05.

## 9. Cutoffs seed (E4)
`supabase/seed/upcat_cutoffs_seed.sql`: campus-level rows for all 9 campuses from the 2019 reference (Diliman 2.174, Baguio 2.421, Manila 2.580, Cebu 2.700, Los Baños/Mindanao/Visayas/Open University 2.800), `is_estimate=true`, year 2019; + the two program rows from the brief (UPD BS CS 1.550, UPD BS Architecture 1.600, year 2025, is_estimate=false). Idempotent `ON CONFLICT (id) DO UPDATE`.

## 10. Testing
- **RPC**: via MCP execute_sql, call `estimate_admission_score` with the brief's worked example (hsGWA 91.5, math 62.3, reading 71.0, language 68.5, science 58.8) → assert point ≈ 1.87, range ≈ 1.67–2.07, UPD-CS status 'unlikely'. Test palugit eligibility branch + pabigat region branch + clamping + missing-subtest fallback.
- **Client pure helpers**: Jest for `rollingSubtestAverages` (last-3 per subtest, subtest-name mapping, <3 sessions) + input validation.
- **UI**: estimator renders range bar + per-campus list from a mocked rpc; disclaimer modal gates first access; grade-input persists.
- **react-doctor** `--project @iskotify/mobile` on changed files → no new bug-errors.
- Full mobile + admin suites green.

## 11. Delivery
Migration 020 + cutoffs seed + the palugit-fact fix applied via Supabase MCP at verify time. Mobile JS ships in the final-batch OTA. RPC `GRANT EXECUTE` to authenticated only.

## 12. Sequencing (plan → bite-sized TDD)
1. Migration 020: `upcat_cutoffs` + the `estimate_admission_score` RPC.
2. Cutoffs seed + palugit-fact fix.
3. Mobile schema: user_settings grade/profile cols + `upcat_cutoffs` mirror; sync pull.
4. Pure helpers (`subtestRolling`, `estimatorInputs`) — TDD.
5. Grade-input screen + settings persistence.
6. Disclaimer modal + EN/TL copy.
7. Estimator screen (rpc call + range bar + EEAS + per-campus list) + Practice entry.
8. Recompute-after-session hook.
9. Verify (RPC via MCP, suites, react-doctor) + apply 020 + seeds.

## 13. Open questions (proposed defaults)
- Grades stored **locally only** (SQLite), passed to the stateless RPC; cross-device grade sync + `score_estimates` history = V2. (Proposed.)
- Estimator **requires connectivity** (RPC); cutoffs cached for the comparison list. (Proposed.)
- Range band ±0.20 (static baselines); tightens with V2 dynamic app-pool baselines. (Proposed.)
