# Production readiness plan — paid launch (2026-10-01)

Goal: production grade, PH-legal, Google Play (and later App Store) compliant,
real value for ₱500 one-time ("lifetime") premium via RevenueCat; Android first,
web as the iOS bridge. Sources: four audits (Play policy, PH legal, payments
research, value & user flows), key claims verified in code / prod DB and gated
by Jev. Not legal advice — items marked [LAWYER] / [CPA] need a professional.

## Decisions (Jev-gated)
- Order: P1 compliance & trust → P2 content protection → P3 monetization → P4 value → P5 launch ops.
- Gemini on student scholarship search: OFF (API terms bar under-18 audiences); keyword ranking stays.
- On-device AI model + background downloader: removed from the student app.
- Analytics: off until opt-in for under-18s; on with opt-out for 18+ (lead decision, Jev abstained).
- Free/premium matrix: adopted provisionally; daily cap and free-mock count are config constants.
- Web payments: PayMongo (Stripe unavailable to PH businesses); built behind a disabled flag until owner registrations.
- Android: Play Billing only; may honor web purchases after login; never mention/link web purchase in-app or on the listing.

## P1 — compliance & trust (no owner dependency)
- P1a Account deletion: in-app Delete account (server-side RPC deletes auth user + all user rows/files), public deletion page, legal text update.
- P1b Consent: age band + Terms/Privacy checkbox at sign-up; parent/guardian attestation for under-18 [LAWYER: sufficiency];
  separate opt-in before grades / income / Indigenous status, with withdraw-and-clear; analytics consent per above;
  Terms/Privacy links on landing and sign-in.
- P1c Platform hygiene: Gemini off on student search; remove on-device AI + downloader (no FOREGROUND_SERVICE_DATA_SYNC);
  production builds AAB; block unneeded permissions; "Inappropriate AI content" report reason + AI-assisted labels.
- P1d Legal texts: lawful basis per purpose, processors + countries, retention periods (+ enforcement), DPO block,
  AI disclosure, non-affiliation / no-guarantee disclaimers on estimator & listing, early-access form notice,
  Premium section drafted (hidden until launch), refund wording (never "no refunds").

## P2 — content protection
- Published-only RLS on question / passage / flashcard bodies; status-only public feed so devices still learn about unpublished items; stop syncing drafts.

## P3 — monetization
- **Built (#73, #74), switched off.** As built it uses `public.entitlements` and admin-app webhooks, not
  `profiles.is_premium` or an edge function. Setup, operations and go-live steps:
  [docs/payments/in-app-purchases.md](../payments/in-app-purchases.md).
- RevenueCat (react-native-purchases) non-consumable `premium` entitlement, app_user_id = Supabase user id; premium gate hook;
  paywall at natural moments; restore; Supabase `purchases` + `profiles.is_premium` + rc-webhook edge function;
  grandfather early-access users; web reads `is_premium`; PayMongo checkout + webhook behind a flag.

## P4 — value
- Unseen-first mock sampling; mistake bank feeding SRS; Practice quick-start (Diagnostic · Sprint · Drill · Mistakes);
  fix wrong CTAs; estimator only for UPCAT focus; onboarding ≈4 steps; guest web glimpse with diagnostic;
  measure + backfill explanation coverage (target ≥90%); per-exam coverage labels; fill DOST Mechanical-Technical / Abstract pools.

## P5 — launch ops
- Closed testing (12 testers × 14 days), Data safety form, target audience 16–17 & 18+, store listing, 16 KB page-size check.

## Owner-only
1. DTI (or SEC) registration, barangay + mayor's permit.
2. BIR registration/COR, VAT vs non-VAT with a CPA — Google does not remit PH VAT for PH developers [CPA].
3. Appoint a DPO; NPC registration (Circular 2022-04) once thresholds apply.
4. Accept DPAs: Supabase, Vercel, PostHog, Resend, Upstash, Google, RevenueCat, Expo; confirm Supabase region.
5. Written content license + IP warranty from Review Masters Bicol [LAWYER].
6. Play payments profile in the business name; PayMongo KYC; payout bank in the same name.
7. Lawyer review: minors' consent, refund + "lifetime" clauses, exam-name trademarks in marketing.
