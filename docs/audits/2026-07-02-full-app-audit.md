# Iskotify Full-App Audit — 2026-07-02

Scope: mobile app (Expo native + web mirror), admin console (Next.js), data layer (Supabase → local SQLite sync), security, UI/UX consistency, performance, missing features. Method: six parallel specialized review passes (security, frontend/layout, backend/API, data/perf, deep-dive debugging, product gaps), every finding verified against the actual code before inclusion; top findings independently re-verified and the P0/P1s **fixed the same day** (commits `ba6d6d8`, `72e25ae`).

Legend: **P0** = broken/blocking · **P1** = high (security or primary-flow damage) · **P2** = medium · **P3** = polish/hygiene.
Status: ✅ FIXED (this audit) · ⬜ OPEN (prioritized backlog).

---

## 1. Fixed during this audit

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | P1→P0-class | **Admin privilege escalation**: middleware only checks a session exists (never `profiles.role`); any signed-in app user could `POST /api/early-access/apk-url` (poison the APK link emailed to every registrant — malware-distribution vector), `/api/early-access/send`, `/api/analytics/dashboard-url` (inject an iframe into the admin), and invoke the `triggerSync` server action. Found independently by both the security and backend reviewers. | ✅ `requireAdmin()` gate on all three routes (reusing its service-role client) + `isAdminSession()` for the server action; helper hardened + documented; 4 new 401/403 tests (`ba6d6d8`) |
| 2 | P0 | **School-only focus synced zero review cards**: the per-slug flashcards pull used raw focus slugs; nothing is tagged `school:<id>`, so a fresh device with only a school focus got an empty review deck. | ✅ `sync.ts` maps `school:` → `general-cet` for the pull (`72e25ae`) |
| 3 | P0 | **`selectedListingSlug` contamination**: sync cursor + `syncPrimaryListing` stored the raw `school:<id>` pseudo-slug, breaking the profile title ("No exam selected"), Practice-tab recommended topics (always empty), and chat context. | ✅ both writers store the mapped content slug; self-heals on next sync (`72e25ae`) |
| 4 | P0 | **Home "My Focus" card showed raw `school:<uuid>`** and routed to "Listing not found" (`useHomeStats` leftJoin leaves school entries bare; onPress went to `/listings/…`). | ✅ school names resolved via `tertiary_schools`, `type='school'`, cards route to `/practice/start/…` (`72e25ae`) |
| 5 | P1 | **Review screen couldn't scroll**: `practice/review/[slug]` rendered the subject accordion in a plain `View` — content past one viewport was unreachable on the primary review flow. | ✅ wrapped in `ScreenScroll` (also gains desktop max-width) (`72e25ae`) |
| 6 | P1 | **Onboarding silently dropped picked schools** whose exam has no listing slug — user finished onboarding with no focus at all. | ✅ unmapped picks become `school:<id>` focus rows; `selectedListingSlug` falls back to `general-cet` (`72e25ae`) |

Verification: admin 614/614 vitest, mobile 1516/1516 jest, both type-checks clean.

---

## 2. Open findings — prioritized backlog

### Security & backend
| Sev | Finding | Where | Recommended fix |
|-----|---------|-------|-----------------|
| P2 | Public early-access registration POST has **no rate limiting** (service-role insert, rotating emails = unbounded rows) | `apps/admin/app/api/early-access/route.ts` | wrap in `waitForRateAllow('early-access:<ip>')` like `search/listings` |
| P2 | Places proxy has **no rate limiting** (cache only) — cache-miss loop = unbounded billed Google Places calls | `apps/admin/app/api/places/school-search/route.ts` | per-IP token bucket before the live call |
| P2 | `user_app_data` / `schools` writes trust client-set values — **safe only if RLS is strict**. Required policies: `user_app_data FOR ALL USING/WITH CHECK (auth.uid() = user_id)`; `schools` INSERT restricted to authenticated + `source IN ('manual','places')` | mobile `sync.ts`, `useSchoolSearch.ts` | verify/add policies in Supabase (couldn't be checked from code) |
| P2 | exam-blueprints PUT **delete-then-insert is non-atomic** (failed insert leaves a blueprint with zero sections) + deleted sections never propagate to synced devices (no tombstones) | `apps/admin/app/api/exam-blueprints/route.ts:52-65` | move replace into a Postgres RPC (one tx); check delete errors |
| P3 | CSV export doesn't neutralize formula injection (`=`,`+`,`-`,`@` cells execute in Excel) — listings data originates from an external sheet | `lib/dataTables/serialization.ts encodeCsvCell` | prefix `'` on dangerous leading chars |
| P3 | Raw DB error messages leak to clients in exam-blueprints / ai-config / listings routes; exam-blueprints GET returns 200-with-empty on DB error (admin could re-save over a false-empty state) | see routes | generic messages + check each `.error` |
| P3 | Admin gate duplicated inline in ~9 routes (drift risk) · feedback pagination lacks a unique tiebreaker · non-timing-safe secret compares on operator endpoints | various | migrate to `requireAdmin` incrementally; `.order('id')` tiebreak; `crypto.timingSafeEqual` |

### Product gaps (missing features)
| Sev | Gap | Notes |
|-----|-----|-------|
| **P0** | **No account deletion anywhere** — Google Play requires in-app deletion + a web deletion URL for apps with account creation; also GDPR/DPA exposure. Nothing exists in mobile, admin, or Supabase functions. | **Do before any Play submission**: `SECURITY DEFINER` RPC/edge function (`auth.admin.deleteUser` + wipe user rows), a "Delete account" row in Profile behind a confirm, and a web deletion page |
| P1 | Sync/network failures are invisible (console-only; `syncStatus` has no error field; no offline indicator; no retry UI beyond the web refresh button) | add `lastError` to syncStatus + a dismissible retry banner |
| P1 | Web password reset dead-ends — no `PASSWORD_RECOVERY` handling / set-new-password form; user is signed in once by the email link, then locked out again | handle recovery event in `auth/callback.tsx` → small `updateUser({password})` form |
| P2 | Export/import misses `user_requirements` (reset-after-export loses checked requirements) · Help FAQ points to "Settings → Export Data" but export lives on Profile | add to `services/export.ts` payload + fix copy |
| P2 | Note reminders on web save silently but never fire (no web gate/messaging) | disable/annotate the field on web |
| P2 | No share entry points for schools/exams/listings; no Android App Links for app.iskotify.ph | share icon on detail screens; `intentFilters` in app.json |
| P3 | No global search on Home · BYOK screen doesn't state chats go to Google · admin early-access queue lacks reject/revoke | small additions |

### Performance & data layer
| Sev | Finding | Notes |
|-----|---------|-------|
| P1 | **Full sync executes ~5,300 individual per-row upserts** (zero batching anywhere in `sync.ts`); Tx5 (university tables, ~2.5-3k rows) has no internal yields — main-thread jank/ANR-risk on low-end Android and web wasm | batch with multi-row `.values([...])` chunks (~40-50 rows, SQLite 999-param limit) + yield every N chunks inside Tx5 |
| P1 | **SchoolsDirectory re-runs a 727-row leftJoin on every Universities-tab remount** (tab switch unmounts it; it's the default tab of Lists) with no cache | `cachedQuery('schools:directory', 300_000)` + `subscribe('schools:')`; sync must `invalidate('schools:')` |
| P2 | `invalidate('')` after sync re-fires **every** cached fetcher concurrently in one tick, right after the heaviest write phase | stagger background refreshes in small groups |
| P2 | `loadListings` re-queries 4 datasets on every Lists focus with no cache (sibling `loadDestinations` already uses `cachedQuery`) | same pattern, `lists:listings-meta` |
| P3 | ~800KB dead font weights shipped (barrel imports pull all 9 weights × 2 families; only 6 used) | import the 6 `.ttf` files by subpath |
| P3 | Missing index for the mock-exam hot query | `CREATE INDEX upcat_questions_skill_status_idx ON upcat_questions (skill_category, status)` in MIGRATIONS |
| P3 | Web persist re-serializes the whole DB per debounced write (sql.js structural limit — already mitigated by debounce+flush; awareness only) | none practical |

### Frontend UI/UX & consistency
| Sev | Finding | Notes |
|-----|---------|-------|
| P1 | **14 stack screens render full-bleed on desktop web** (the tabs wrapper caps only tab screens): exam runner, chooser, schools directory, subjects, course rankings, upcat subtest, topic/deck/listing practice, notes, GWA, scholarship-info (review screen fixed in this audit) | migrate to ScreenScroll where possible; web-only `maxWidth+alignSelf:center` on FlatList content styles |
| P2 | Home + Updates are **unrefreshable on web** (dead RefreshControl, no WebRefreshButton — handlers already exist) | drop `WebRefreshButton` next to the existing onRefresh |
| P2 | ~30 hardcoded colors that will break light-theme parity (`#4ade80` free-tuition green, raw maroon rgba on exam CTAs) + 207 raw 10-19px spacing values (worst: exam runner ×25, FlashcardExam ×19, PassagePanel's `14`s) | add success/danger/accent alpha tokens; normalize on next touch of each file |
| P3 | QuestionNavigator cells 30×30 (<44pt target) · notes checklist 22×22 · search TextInputs missing accessibilityLabel (4 screens) · Updates cards + SubjectAccordion missing `maxFontSizeMultiplier` | small sweeps |
| — | **Clean**: empty/loading states strong across data screens; WebTopSpacer coverage complete; a11y labels broadly present; nested-scroll audit clean | scorecard: tokens B-, a11y B+, web parity C (→ B after this audit's fixes) |

### Verified clean (no action)
Service-role key isolation; PostgREST injection surface (sanitized `.or()`, allow-listed tables, field allow-lists); XSS (no dangerous HTML sinks); auth open-redirect; secrets hygiene/gitignore; `updated_at` propagation (DB `BEFORE UPDATE` triggers on every synced table — admin writes can't silently break mobile sync); pagination in export/import cores; import 5MB cap; queryCache eviction headroom; school-focus round-trip via cloud backup; PassagePanel/back-button interaction; profile reset consistency; blueprint badge refresh.

---

## 3. Recommended fix order (backlog)

1. **Account deletion** (Play-Store blocker — before any store submission)
2. RLS policy verification for `user_app_data`/`schools` + rate limits on early-access & places endpoints (server-side, no app release needed)
3. Sync error surfacing + web password-reset screen (user-trust pair)
4. Sync batching + SchoolsDirectory/Lists caching (biggest perceived-perf win, esp. web + low-end Android)
5. Desktop max-width for the 14 stack screens + Home/Updates web refresh (one pattern, mechanical)
6. exam-blueprints atomic replace RPC + deletion tombstones
7. Theme-token color sweep before the light-theme launch; fonts subpath imports; small a11y sweep
