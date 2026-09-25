# Product

<!-- impeccable:product-schema 1 -->

> **Draft for confirmation (2026-09-26).** Written without an interview, at the owner's request,
> from `iskotify-context.md`, `DESIGN.md`, `apps/admin/components/landing/*`,
> `docs/audits/2026-07-02-full-app-audit.md`, and the team's marketing brief.
> Every line tagged **(inferred — confirm)** is a hypothesis the owner has not yet approved.
> Untagged lines are stated directly in those sources. Delete the tag once confirmed, or correct the line.

## Platform

android

<!--
Surface split (inferred — confirm):
- apps/mobile: one custom design language (Refined Maroon), Android-first distribution (early-access APK),
  also shipped as a web build (app.iskotify.ph). iOS "on the way" per landing FAQ. Not per-OS adaptive.
- apps/admin: web (Next.js). Internal admin console + public landing page in one app.
-->

## Users

**Students (primary, mobile app)**: Filipino Grade 11–12 senior-high students getting ready for college
entrance tests (UPCAT, ACET, DCAT, USTET, MSU-SASE and others) and deciding which school, course and
scholarship to go for. Four personas from the marketing brief:

- **Iskolar Aspirant**: public-school student, worried about money, needs free prep and a full scholarship to
  make college possible. Probably on a low-end Android phone with prepaid or patchy data, often sharing the
  device. **(inferred — confirm device and data profile)**
- **Anxious Achiever**: private or science high school, does a lot of research, compares schools and cutoffs,
  takes many mock exams, and wants to see how ready they are. **(inferred — confirm)**: mostly on better phones
  and on the web build.
- **Sacrificing Parent (including OFW parents)**: the one who pays, and uses Facebook more than anything
  else. Wants to see progress and deadlines without learning a study app. **(inferred — confirm)**: the parent
  is a *secondary* viewer, not an account holder. No parent surface exists in the code today.
- **Barkada Reviewer**: Gen Z, finds things on TikTok, gets memes, and studies with friends. **(inferred —
  confirm)**: wants study sessions that feel social and can be shared. No share entry points exist yet (audit
  §2, P2).

**Operators (admin console)**: a small internal team (the sole developer plus Review Masters Bicol content
staff) who import and review the question bank, curate flashcards, configure exam blueprints, moderate
listings, updates, feedback and date contributions, and hand out early-access builds. **(inferred — confirm
team size and whether non-technical content staff use the console day to day)**

## Product Purpose

Iskotify is a free exam-prep and college-decision companion (free during early access). It puts the three
separate jobs of a Filipino college applicant in one offline-first app:

1. **Prepare**: blueprint-driven mock exams, a diagnostic, a 30-minute Study Sprint, spaced-repetition
   flashcards, and answer explanations for each option.
2. **Decide**: scholarships, entrance exams, universities and courses with eligibility matching, PRC
   board-exam evidence, and career-destination data.
3. **Keep track**: deadlines, admissions news, a daily study plan paced to the exam date, and progress
   analytics.

Success means the student shows up on exam day ready, and applies to the right schools and scholarships
before the deadlines. **(inferred — confirm success signals below)**

### Success signals (inferred — confirm)

- A student answers practice questions on at least 3 days a week in the 8 weeks before their exam.
- A new student gets a diagnostic result or first answered question within the first session.
- A student who adds a scholarship or exam to their focus list sees its deadline before it passes.
- The number of answers per UPCAT subtest reaches the Estimated Admission Score threshold (20 per subtest).
- Operator side: a Drive question file goes from import to published in one sitting, with no questions
  silently held back.

## Positioning

**(inferred — confirm)** Most PH reviewer apps only do test prep, and most scholarship sites only list
things. Iskotify does both, and adds three things a neighbouring product would find hard to claim honestly:

- It is **backed by Review Masters Bicol**, a real review-center content team, and not only scraped or
  AI-generated questions. **(confirm the exact wording of the backing claim you are allowed to use)**
- It **works offline on the phone the student already has**: synced SQLite catalog, prefetched question
  figures, on-device Gemma for search and distractors.
- It gives an **Estimated Admission Score computed on the device** from the student's own GWA and their
  real practice answers (published Manlapaz regression), framed only as an estimate.

## Operating Context

- Students study in short bursts on a phone: on the way to school, at night, between classes. Connectivity
  is not reliable, which is why the app syncs incrementally and works offline. **(inferred — confirm)**
- Exam season sets the pace: UPCAT (typically around Aug–Oct), then private-university exams and scholarship
  deadlines. The study plan counts down to the student's focused exam.
- Parents are reached through Facebook. There is a private Facebook beta community (landing footer).
  Distribution is currently early-access Android APK by email, plus the web app.
- Operators work at a desktop: Google Drive CSVs and figures, the listings master Google Sheet, Gemini
  generation, Supabase. The console lives inside the same Next.js app as the public landing page.

## Capabilities and Constraints

**Capabilities (confirmed in code/context):** mock exams driven by exam blueprints; diagnostic; Study Sprint;
due-cards SRS queue; per-option explanations; question figures with tap-to-zoom; Estimated Admission Score;
listings (scholarships, exams, universities, courses) with eligibility matching; admissions updates;
crowd-sourced date corrections; progress analytics (accuracy trend, time per question, common mistakes,
mock percentile); notes; local notifications; dark and light theme. Admin: Drive question-bank sync and
per-file publish, CSV import, flashcard CRUD and AI generation, distractor review queue, exam blueprints,
listings sync and CRUD, data-table browser, early-access tooling, analytics.

**Hard compliance (non-negotiable):**
- **No UP branding**: no UP seal, oblation, UP wordmark or UP colours presented as an affiliation.
- The score is always called the **"Estimated Admission Score"** and is described as "based on historical
  cutoffs".
- Never write "your UPG is", "will qualify", or pass/fail language. The EN/TL disclaimer must be accepted
  before the first view. This is enforced by `apps/mobile/app/estimator/__tests__/compliance.test.tsx`.

**Technical constraints:** offline-first (catalog read-only on the device, one synced `user_app_data` row
per user); the mobile web build shares all screens; no push server (local notifications only); no
monetization integrated (RevenueCat absent); account deletion is still missing and blocks the Play Store
listing (audit P0).

**Undecided / open:**
- Pricing after early access (free forever? freemium? parent-paid?). **(open — owner to decide)**
- Whether parents get their own surface or a shareable progress summary. **(open)**
- iOS timing. **(open)**

## Brand Commitments

- **Name:** Iskotify. **Mascot:** Kuya Baw survives only as brand artwork. The AI chat was retired
  2026-08-06 and must not come back through copy.
- **Colour:** maroon (`#800000`) is the brand colour on both surfaces (see DESIGN.md). **(inferred — confirm
  that maroon itself is not read as UP branding; see the open question in the redesign brief)**
- **Voice:** Taglish, warm, a peer who has been through it ("Para sa mga Iskolar ng Bayan", "fellow
  Iskolars"). Plain English carries the instructions and adds Filipino for warmth and belonging.
  **(inferred — confirm)**: the barkada/meme register belongs in marketing and delight moments. It stays
  out of scores, deadlines and money, where the voice should be calm and exact.
- **Tone per moment (inferred — confirm):** encouraging on practice, straight and careful on the Estimated
  Admission Score, urgent-but-not-alarming on deadlines, matter-of-fact in the admin console.
- **Backed by Review Masters Bicol.** **(confirm allowed placement and wording)**

## Evidence on Hand

- Real content: the question bank (Drive-synced UPCAT-style items with figures), flashcards, exam
  blueprints, listings from the master Google Sheet, ~727 tertiary schools, PRC board-exam data, 2019
  campus-level UPCAT cutoff estimates.
- **No testimonials exist.** The landing Testimonials section is deliberately an empty "Be the first to
  review" state (`apps/admin/components/landing/Testimonials.tsx`). Do not invent reviews, user counts,
  pass rates, or "X students admitted" claims.
- **Claims to check before reuse:** the landing FAQ says "hundreds of private scholarships… updated weekly"
  and "industry-standard encryption… at rest", and calls early access a "free trial" while also saying "free
  during early access". **(confirm or correct before any redesign reuses them)**

## Product Principles (inferred — confirm)

1. **Honest about uncertainty.** Estimates, cutoffs and deadlines show their source and their range. The
   app never promises admission.
2. **Works on the student's real phone.** A low-end Android on prepaid data is the reference device, not
   the owner's laptop.
3. **One next step.** Each screen answers "what should I do now?" before it shows everything the app knows.
   (Continues the approved 2026-06-10 density spec.)
4. **Free means free.** No dark patterns, fake scarcity, or paywall teasers during early access.
5. **Operators publish with confidence.** The console makes held-back, failed or partial imports impossible
   to miss.

## Accessibility & Inclusion

- WCAG 2.2 AA on both surfaces. The token contrast tables and the accessibility floor in DESIGN.md are
  binding (September 2026 audit).
- Touch targets of at least 44pt, font scaling that survives 200%, and colour never the only signal.
- Bilingual: EN/TL disclaimers where compliance requires them. Taglish copy must stay understandable to a
  student with limited English. **(inferred — confirm whether a full Filipino locale is planned)**
- Low bandwidth and low-end hardware count as accessibility needs: no heavy motion or large un-cached
  assets on core flows.
