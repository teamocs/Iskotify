# Iskotify Full Access — in-app purchases

Status (2026-10-01): **built, merged, switched off.** Nothing is sold until the
switches in [Going live](#3-going-live) are turned on.

- Server: PR #73 (migration 067, checkout, webhooks). Database part is live in prod.
- App: PR #74 (paywall, limits, upgrade screen, Terms/Privacy text).
- Needs a new Android build (app version **1.9.0**) because it adds a native module.

---

## 1. What is sold

One product: **Iskotify Full Access**, a one-time **₱500** purchase. No ads, no
subscription. Bought once, it unlocks Android and web on the same account.

| Free | Full Access (paid) |
|---|---|
| Diagnostic test | Unlimited practice questions |
| Explore, schools, scholarships | Unlimited full mock exams |
| Notes, estimator, flashcards | Detailed explanation for every answer choice |
| Sprint mode (short timed mock) | |
| 1 full mock exam per entrance exam | |
| 30 practice questions per day (Manila time), with the main explanation | |

Change the limits in `apps/mobile/utils/premiumLimits.ts`:

```ts
export const FREE_DAILY_PRACTICE_QUESTIONS = 30
export const FREE_FULL_MOCKS_PER_EXAM = 1
```

Never gated: the diagnostic, onboarding, Sprint, resuming a run already started.
Flashcard quizzes are free.

---

## 2. How it works

```
 ANDROID                                   WEB (app.iskotify.ph)
 /upgrade → Google Play purchase           /upgrade → POST /api/payments/checkout
   (RevenueCat SDK)                           → PayMongo checkout page
        │                                       (GCash, Maya, card, QR Ph)
        ▼                                            │
 RevenueCat ──webhook──► /api/payments/      PayMongo ──webhook──► /api/payments/
                         revenuecat/webhook                       paymongo/webhook
                               │                                        │
                               └──────────►  public.entitlements  ◄─────┘
                                             (premium = true)            │
                                                   ▲                     └─► also grants the
                                                   │                         RevenueCat "premium"
                              app reads its own row (both platforms)         entitlement
```

**One rule above all:** the app decides access **only** from the
`public.entitlements` row of the signed-in user. RevenueCat is used only to buy
and restore on Android, never to decide access (anyone can claim any RevenueCat
user id from a device).

- A purchase needs a signed-in account (so it works on every device).
- RevenueCat's user id = the Supabase user id.
- The app caches the last known state on the phone, tied to the user id, so
  access works offline and never carries over to another account.
- After buying, the app shows "Confirming your purchase" and checks the
  entitlement row for about 30 seconds (webhooks can lag).

### Grant and revoke rules (enforced in SQL, atomic)

| Event | Result |
|---|---|
| Google Play purchase | grant, source `play` |
| Web (PayMongo) payment | grant, source `web` (takes over from `play`) |
| Play refund / expiry | removes **only** a `play` grant |
| Play purchase moved to another account (TRANSFER) | old account loses `play`, new account gets it |
| Later Play grant while a web/grandfather/admin grant is active | ignored (keeps the stronger grant) |
| Same event delivered twice | processed once (`payment_events.id`) |

A web payment is granted only if it is exactly **50000 centavos, PHP**, live mode
matches the secret key (`sk_live_` ⇒ live), and the reference starts with `ISK-`.
Anything else is recorded and logged for manual review, never granted.

---

## 3. Going live

Do these in order. Webhooks reject everything until their secrets are set.

The admin app (webhooks, checkout) lives at **`https://iskotify.ph`** (custom domain;
`iskotify.vercel.app` still works as an alias, `www.iskotify.ph` does not resolve).
The student web app is `https://app.iskotify.ph`.

### A. Google Play Console
1. Payments profile set up (Philippines). Merchant account active.
2. Create a **one-time product** (in-app product, not subscription), price ₱500.
   Note its product id.
3. Add license testers (for sandbox testing).

### B. RevenueCat
1. Create a project and an Android app (package `app.iskotify.mobile`), connect
   the Play service account credentials.
2. Create entitlement **`premium`** and attach the Play product.
3. Create an offering (the "current" offering) with one package containing the product.
4. **Project settings → Restore behavior → "Keep with original App User ID".**
5. Integrations → Webhooks:
   - URL: `https://iskotify.ph/api/payments/revenuecat/webhook`
   - Authorization header: a long random string → also set as `REVENUECAT_WEBHOOK_AUTH`.
   - Environment: Production (sandbox events are ignored unless `REVENUECAT_ALLOW_SANDBOX=true`).
6. Copy the **secret API key** (server) and the **Android public SDK key** (`goog_…`, app).

### C. PayMongo
1. Complete business verification (KYC) and activate live mode.
2. Developers → Webhooks → add:
   - URL: `https://iskotify.ph/api/payments/paymongo/webhook`
   - Event: `checkout_session.payment.paid`
   - Copy the webhook secret → `PAYMONGO_WEBHOOK_SECRET`.
3. Copy the secret key (`sk_live_…`) → `PAYMONGO_SECRET_KEY`.
   Test and live webhooks have different secrets; use the live ones in production.

### D. Admin app env (Vercel → admin project → Environment Variables, Production)

| Variable | Value |
|---|---|
| `PAYMENTS_ENABLED` | `true` (turns on web checkout) |
| `PAYMONGO_SECRET_KEY` | `sk_live_…` |
| `PAYMONGO_WEBHOOK_SECRET` | from the PayMongo webhook |
| `REVENUECAT_SECRET_API_KEY` | RevenueCat secret key |
| `REVENUECAT_WEBHOOK_AUTH` | the Authorization string you set in RevenueCat |
| `REVENUECAT_ALLOW_SANDBOX` | leave unset in production (`true` only while testing) |
| `WEB_APP_URL` | `https://app.iskotify.ph` (PayMongo returns here) |

All are server-only. Never put them in the app or in Git.

### E. App env (EAS production env **and** Vercel web-app env)

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_PAYWALL_ENABLED` | `1` (limits + upgrade screen on) |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | `goog_…` public SDK key (Android build only) |

Then build Android **1.9.0** (production profile builds an `.aab`) and upload to
the Play testing track. Old OTA updates cannot reach the new build (runtime
version follows the app version), and the new code cannot reach old builds.

### F. Test before opening to everyone
1. Sandbox Play purchase with a license tester (temporarily `REVENUECAT_ALLOW_SANDBOX=true`):
   buy → "Confirming" → Full Access active. Check the row:
   `select * from public.entitlements where user_id = '<uid>';`
2. Restore purchases on a reinstall → still active.
3. Refund the test purchase in Play Console → row becomes `premium = false`.
4. Web: PayMongo **test** keys on a preview deployment, pay with a test card/GCash
   test → active on web, then sign in on Android → active there too.
5. Sign in with a second account on the same phone → no Full Access.
6. Turn `REVENUECAT_ALLOW_SANDBOX` back off.

---

## 4. Everyday operations

Run these in the Supabase SQL editor (service role).

**Does this student have Full Access?**
```sql
select e.* from public.entitlements e
join auth.users u on u.id = e.user_id
where lower(u.email) = lower('student@example.com');
```

**Give someone Full Access manually** (support case, promo, early-access thank-you):
```sql
select public.grant_entitlement('<user uuid>', 'admin');        -- or 'grandfather'
```

**Remove a manual or web grant** (`revoke_play_entitlement` only touches Play grants):
```sql
update public.entitlements
   set premium = false, revoked_at = now(), updated_at = now()
 where user_id = '<user uuid>';
```

**Web refund:** refund in the PayMongo dashboard, then run the update above.
Our Terms promise refunds where the law gives a right to one; never write "no refunds".

**Play refund:** handled automatically (RevenueCat webhook revokes the Play grant).

**Payments that need a look** (paid but not granted: wrong amount, mode or unknown user):
```sql
select id, provider, type, amount_centavos, payload, received_at
from public.payment_events
where user_id is null
order by received_at desc;
```
Check the PayMongo session in their dashboard, then grant manually if genuine.
The server logs these as "manual review" in the Vercel logs.

**Purchase records:** `payment_events` keeps only purchase facts (ids, type,
amount, currency, mode), no names or emails. When a student deletes their
account, their entitlement is deleted and their payment records are unlinked
(kept for tax).

---

## 5. Changing things

| Change | Where |
|---|---|
| Free daily cap / free mocks | `apps/mobile/utils/premiumLimits.ts` (OTA-able) |
| Web price | `PRICE_CENTAVOS` in `apps/admin/lib/payments/paymongo.ts` **and** the `₱500` fallback in `apps/mobile/app/upgrade.tsx` |
| Play price | Play Console (the app shows the store's localized price) |
| Turn web checkout off | `PAYMENTS_ENABLED` unset → checkout returns 503 (webhooks still honour paid payments) |
| Turn the paywall off in the app | `EXPO_PUBLIC_PAYWALL_ENABLED` unset/`0` → no limits, no upgrade UI |
| What Full Access includes | gates in `app/practice/upcat/[subtest].tsx`, `app/practice/exam/[slug].tsx`, `components/practice/ReviewCard.tsx`; then update the Terms section "Free features and Iskotify Full Access" |

If the price or what's included changes, update `packages/utils/src/termsOfService.ts`
in the same PR.

---

## 6. Rules not to break

- **Google Play:** inside the Android app, never mention, link to, or price the
  web purchase (no GCash/Maya/PayMongo/website wording). Honouring a web purchase
  on Android is allowed; advertising it is not. A test enforces this on `/upgrade`.
- **Apple (future iOS app):** must sell its own in-app purchase too (guideline 3.1.3(b)).
  Today the buy button is hidden on iOS.
- **Minors:** the upgrade screen tells under-18s to ask a parent or guardian first.
- **Consumer law (RA 7394 / RA 11967):** no "no refunds" wording; one-time, not a subscription.
- **Tax:** PH VAT on digital services; Google's 15% service fee applies to Play sales.
  Confirm VAT handling with a CPA before launch.

---

## 7. File map

**Database** — `supabase/migrations/067_entitlements_and_payments.sql`
- `public.entitlements` — students can read their own row only; no client writes.
- `public.payment_events` — service role only; idempotency + purchase records.
- `public.grant_entitlement(uuid, text)`, `public.revoke_play_entitlement(uuid)` — service role only.
- `public.delete_user_data` — deletes entitlements, unlinks payment events.
- Related: 066 stops students editing `profiles.role` (and anything not listed).

**Server** — `apps/admin`
- `app/api/payments/checkout/route.ts` — creates the PayMongo checkout (bearer token, rate-limited).
- `app/api/payments/paymongo/webhook/route.ts` — signature check, amount/mode checks, grant.
- `app/api/payments/revenuecat/webhook/route.ts` — auth check, grant/revoke/transfer.
- `lib/payments/` — `signature.ts`, `entitlementRules.ts`, `paymongo.ts`, `revenuecat.ts`, `store.ts`.
- `middleware.ts` — exact-match exemptions for the webhook and checkout paths.

**App** — `apps/mobile`
- `utils/premiumLimits.ts` — flag, limits, passage-safe trimming.
- `services/premium.native.ts` (RevenueCat, Android) / `services/premium.ts` (web, PayMongo).
- `services/premiumState.ts`, `premiumCache.ts`, `premiumGate.ts`, `premiumUsage.ts`, `entitlements.ts`.
- `hooks/usePremium.ts` — `{ enabled, isPremium, loading, refresh }`.
- `app/upgrade.tsx` — the upgrade screen; `components/premium/UpgradeCard.tsx` — the limit card.
- Profile row "Iskotify Full Access" in `app/(tabs)/profile.tsx`.

---

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Paid, stuck on "Confirming" | Vercel logs for the webhook route; `payment_events` row exists? webhook secret/auth set? |
| Webhook returns 401 | Wrong `PAYMONGO_WEBHOOK_SECRET` (test vs live) or `REVENUECAT_WEBHOOK_AUTH` mismatch |
| Webhook returns 500 | Missing env var, or `PAYMONGO_SECRET_KEY` not starting with `sk_live_`/`sk_test_` |
| Web checkout says unavailable | `PAYMENTS_ENABLED` is not `true` |
| No buy button on Android | `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` missing in the build, or no current offering in RevenueCat |
| Sandbox purchase not granted | Expected; set `REVENUECAT_ALLOW_SANDBOX=true` while testing |
| Web buyer not unlocked on Android | Android reads the same entitlements row; make sure they signed in with the same account |
