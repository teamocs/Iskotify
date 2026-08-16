# Iskotify: Project Context & Technical Architecture

> Present-tense description of what the system actually is today. Historical design
> records live in `docs/superpowers/plans/` and `docs/superpowers/specs/` — those are
> append-only and describe the state at the time they were written, not necessarily now.

## 1. Project Overview

**Iskotify** is a multi-platform ecosystem for Philippine students preparing for
college entrance exams (UPCAT, ACET, DCAT, USTET and others) and looking for
scholarships.

**The Ecosystem:**
* **Marketing Landing Page** — public web portal for discovering scholarships/exams and driving app installs.
* **Mobile App** — the offline-first practice, review, and progress-tracking engine. Also ships as a web build.
* **Admin CMS** — content management for listings, the question bank, flashcards, and exam blueprints.

## 2. Tech Stack

### Web (landing page + admin CMS — one Next.js app)
* **Framework:** Next.js 15 (App Router), React 19
* **Styling:** Tailwind CSS
* **Deployment:** Vercel
* **Auth model:** Supabase session in middleware; every mutating admin route additionally enforces `profiles.role = 'admin'` via `requireAdmin()`

### Mobile App (`apps/mobile`)
* **Framework:** React Native + Expo SDK 54, Expo Router
* **Offline database:** `expo-sqlite` + `drizzle-orm` (native) / `sql.js` + IndexedDB (web)
* **On-device AI:** `llama.rn` running Gemma 3 1B — used for MCQ distractor enhancement and Tier-2 offline listing search. **Not** a chat feature; see §5.
* **Notifications:** `expo-notifications` (local only — no push server)

### Backend
* **BaaS:** Supabase (PostgreSQL, Auth, Storage)
* **Content automation:** Google Sheets sync for listings; CSV import for the question bank and flashcards; Gemini for MCQ distractor + explanation generation
* **Caching:** Upstash Redis (admin rate limiting)

## 3. Data Layer

Supabase Postgres is the source of truth. The mobile app mirrors catalog tables into
local SQLite and syncs incrementally on an `updated_at` cursor (`apps/mobile/services/sync.ts`).

* **Catalog tables** (read-only on device): `listings`, `flashcards`, `upcat_questions`, `exam_blueprints`, `tertiary_schools`, `university_profiles`, `career_*`, `admissions_updates`.
* **User data** rides a single `user_app_data` row per user — one named `jsonb` column per synced local table (`user_progress`, `practice_sessions`, `question_attempts`, `flashcard_srs`, `study_plan_items`, `settings`, …). Adding a synced table therefore requires an `ALTER TABLE user_app_data ADD COLUMN` migration, not just a local schema change.
* **Local schema migrations** live in the `MIGRATIONS` array in `apps/mobile/db/client.ts`. That list is **append-only** and re-executes in full on every launch (each statement is individually idempotent and error-tolerant) — never reorder or remove entries.
* **Supabase migrations are applied manually** by pasting the SQL files in `supabase/migrations/` into the Supabase SQL editor, in numeric order. Latest applied: `052`.

## 4. Mobile App Structure

* **Home** — Today's Plan (daily generated study tasks), My Entrance Exams focus tiles with preparedness scores, subject preparedness grid, explore cards, recommended scholarships, merged News & Dates. Sections live in `apps/mobile/components/home/`.
* **Exams / Practice** — blueprint-driven mock exams, a 30-minute Study Sprint, a short diagnostic (`/practice/diagnostic`), per-topic and per-deck flashcard review, and a due-cards queue.
* **Lists** — scholarships, entrance exams, universities, and courses, with eligibility matching.
* **Updates** — admissions news, events, and upcoming dates.
* **Progress** — analytics: overall metrics, per-subject accuracy, average time per question, most common mistakes, an 8-week accuracy trend, and mock percentile history.

**Learning systems:**
* **Attempt telemetry** — every answered question is recorded in `question_attempts` (selected option, correct option, elapsed ms, subtest/topic), capped at the 5,000 most recent rows. This is what makes time-per-question and mistake analysis possible.
* **Spaced repetition** — SM-2-lite scheduling in `apps/mobile/utils/srs.ts`, graded from correctness plus response time, persisted in `flashcard_srs`.
* **Study plan** — a pure, deterministic generator (`apps/mobile/utils/studyPlan.ts`) produces each day's tasks from due-review counts, weak subjects, and days remaining until the student's focused exam.
* **Answer explanations** — per-option "why this is wrong" rationales plus strategy tips, rendered by the shared `components/practice/ReviewCard.tsx`. A database trigger clears them whenever a question's options change, so a stale rationale can never be shown against a changed option.

## 5. On-device AI (no chat)

The **Kuya Baw AI chat assistant was retired on 2026-08-06** and removed entirely —
the chat provider, RAG pipeline, Gemini BYOK client, and prompt builders are all gone.
The mascot survives only as brand artwork.

What remains:
* `services/llm.ts` — Gemma 3 1B inference used by `hooks/useAiEnhancement.ts` (MCQ distractor generation) and `services/listingSearch.ts` (Tier-2 offline search). The model download lives behind **Settings → AI Features**.
* `services/embeddings.ts` + `services/vectorSearch.ts` — dormant groundwork, currently unreferenced, kept for a possible future self-hosted AI.

Server-side, Gemini (via the admin app) generates flashcard distractors, per-option
explanations, and strategy tips. That pipeline is live and unrelated to the retired chat.

## 6. Admin CMS

* **Listings** — synced from a master Google Sheet (`apps/admin/app/api/sheets/sync/`) plus direct CRUD.
* **Question bank & flashcards** — CSV import (`lib/upcat/importUpcatCore.ts`, `lib/csv/importCsvCore.ts`), subject/topic management, and AI generation with admin-supplied format notes or sample questions.
* **Distractor quality** — a "hard mode" bulk regeneration and a heuristic review queue that flags weak option sets for human review rather than rewriting curated content automatically.
* **Exam blueprints** — per-exam section/timing configuration that drives the mobile mock engine.
* **Distribution** — early-access lead capture and APK-by-email tooling. Note: the early-access *lockout gate* was removed on 2026-08-06 and the app is open to everyone; this remaining tooling is lead capture and build distribution only.

## 7. Repository Layout

```
apps/mobile     Expo app (also builds to web)
apps/admin      Next.js landing page + admin CMS
packages/utils  Shared helpers (Sheets, Supabase, formatting)
packages/ui     Shared UI primitives
supabase/       Migrations (applied manually) and seed data
docs/           Append-only plans, specs, and audits
scripts/        Data-parsing and scraping utilities
```

Commands: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm type-check` (Turbo-driven, per-workspace filters available, e.g. `pnpm --filter @iskotify/mobile test`).

## 8. Not Integrated

Called out because earlier drafts of this document claimed otherwise:
* **RevenueCat / monetization** — not integrated; no purchases dependency exists in either app.
* **WatermelonDB** — replaced by `expo-sqlite` + Drizzle on 2026-05-13.
* **PDF-to-flashcard parsing** — scaffolded but never wired; superseded by CSV import.
* **Account deletion** — still missing, and a Play Store requirement. See `docs/audits/2026-07-02-full-app-audit.md`.
