# Epic A — UPCAT Practice Mode + Authored Question Bank — Design

**Date:** 2026-06-06
**Epic:** A of 7 (MVP upgrades master plan). First epic; absorbs the shared "Phase 0" infra (CSV cleaning harness + subtest schema primitive) by building it with its first consumer.
**Source data:** `Iskotify_Question_Tracker_v2 - CSV Export (Firebase).csv` — 320 authored UPCAT MCQs (verified quote-aware counts: Mathematics 60, Science 60, Language Proficiency 100, Reading Comprehension 100), 23 passage sets, 18 topics / 177 subtopics, difficulty (Medium 196 / Easy 85 / Hard 39), all `status=Approved`, `has_visual=No` for all. Plus `kuya_baw_upcat_context` (persona + UPCAT facts).

**Locked decisions:** per-subtest entry + Quick/Full picker; corrected exam flow built now (no auto-advance, skip/back/change); full Kuya upgrade (persona + FTS facts KB); subtest-tagged sessions + per-subtest results.

---

## 1. Goal

Ship a real, authored UPCAT mock-exam mode — distinct from the existing AI-distractor flashcard quizzes — backed by 2 new Supabase tables, a reusable admin CSV cleaning harness, a new mobile exam screen with the corrected flow + passage rendering + per-subtest scoring, and a Kuya Baw knowledge upgrade (persona + UPCAT-facts RAG).

## 2. Sub-components

- **A1** — Reusable CSV cleaning harness (shared infra).
- **A2** — Data layer: `upcat_questions` + `upcat_passages` (Supabase + admin importer + mobile mirror).
- **A3** — Exam-mode practice screen (entry + exam + results), subtest-tagged sessions.
- **A4** — Kuya Baw upgrade: persona system prompt + `upcat_facts` FTS5 RAG.

---

## A1 — Reusable CSV cleaning harness

**File:** `apps/admin/lib/csv/cleaners.ts` (new). Pure functions, unit-tested, reused by Epics B/C/D/F.

```ts
export function stripBom(text: string): string
  // removes a leading U+FEFF if present

export function decodeMojibake(text: string): string
  // repairs common Windows-1252-misread-as-UTF-8 sequences:
  //   â€" → —, â€™ → ’, â€œ/â€ → " ", Ã± → ñ, ï¿½/� → — (em dash fallback),
  //   →/⇒ arrow artifacts normalized. Idempotent on clean UTF-8.

export function resolveSentinel(value: string | null | undefined): string | null
  // trims; returns null for: '', '[UNCONFIRMED]', 'UNCONFIRMED', 'Unknown',
  //   'TBA', 'VERIFY', 'N/A', 'NA', '—', '-' (case-insensitive). Else trimmed value.

export function letterToIndex(letter: string): number
  // 'A'|'a'→0 … 'D'|'d'→3; throws Error on anything else.

export function canonicalizeRegion(raw: string): string
  // maps the 3+ region naming conventions to one canonical label
  //   (e.g. 'CALABARZON' | 'Region IV-A' | 'IV-A' | '4A' → 'Region IV-A (CALABARZON)').
  // Complete table for all 17 PH regions + NCR/CAR/BARMM. Used heavily by Epic C;
  // shipped now so it exists as shared infra. Unknown input returned trimmed as-is.
```

**Tests:** one Vitest file covering each function incl. idempotency (decodeMojibake on clean text), all sentinel variants, letter bounds (throws on 'E'/''/'1'), region aliases.

**Note:** the existing flashcard importer is NOT refactored to use these — no forced churn. New importers adopt them.

---

## A2 — Data layer

### Migration 016 — Supabase tables (public-read RLS like flashcards)

```sql
CREATE TABLE IF NOT EXISTS upcat_passages (
  set_id text PRIMARY KEY,
  subtest text NOT NULL,
  passage_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upcat_questions (
  question_id text PRIMARY KEY,
  subtest text NOT NULL,
  main_subject text,
  topic text,
  subtopic text,
  question_format text,
  cognitive_level text,
  difficulty text,
  curriculum_alignment text,
  question_text text NOT NULL,
  options text[] NOT NULL,
  correct_index int NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation text NOT NULL,
  set_id text REFERENCES upcat_passages(set_id),
  set_position int,
  has_visual boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upcat_questions_subtest ON upcat_questions(subtest, status);
CREATE INDEX IF NOT EXISTS idx_upcat_questions_set ON upcat_questions(set_id);

ALTER TABLE upcat_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE upcat_questions ENABLE ROW LEVEL SECURITY;
-- public read (anon + authed), matching the flashcards/listings catalog pattern
CREATE POLICY upcat_passages_read ON upcat_passages FOR SELECT USING (true);
CREATE POLICY upcat_questions_read ON upcat_questions FOR SELECT USING (true);
```

### Admin importer

- **Pure core:** `apps/admin/lib/upcat/importUpcatCore.ts` — `importUpcatCore(client, rows): { questions: n, passages: n }`. Steps: validate header; for each row strip BOM (via A1) on first cell, resolve passage (collect distinct set_id→passage_text into `upcat_passages`, dedupe), `letterToIndex(correct_answer)`, pack option_a..d into `options[]`, map `Approved`→`published`. Upsert passages first (FK), then questions `ON CONFLICT(question_id) DO UPDATE`.
- **Parser:** reuse papaparse (already a dep) with quote-aware config — handles the embedded newlines in passage_text. **Critical:** naive split corrupts the file; must use papaparse.
- **Route:** `apps/admin/app/api/upcat-questions/import/route.ts` (POST, admin-JWT auth via `createAuthClient` like the calendar route + role check). Mirrors the existing import-csv route structure (size/row caps; returns `{questions, passages}` or rowErrors). Added to middleware operator allowlist? NO — admin-only, cookie-authed (it's an admin page action, not mobile-called).
- **Admin UI:** `apps/admin/app/admin/upcat/import/page.tsx` — dropzone + preview + import button, cloned from the flashcards import page; nav entry under KNOWLEDGEBASE.
- **No Gemini.** Authored options are final.

### Mobile mirror

- `db/client.ts` MIGRATIONS += `CREATE TABLE upcat_passages(...)` + `CREATE TABLE upcat_questions(...)` (SQLite types; `options` stored as JSON text, `correct_index` int).
- `db/schema.ts` += Drizzle definitions for both.
- `services/sync.ts` `syncOnLaunch` += pull `upcat_passages` + `upcat_questions` (status='published', `.gt('updated_at', since)`) into local tables. Bulk upsert pattern like flashcards.

---

## A3 — Exam-mode practice screen

New routes under `apps/mobile/app/practice/upcat/` (kept separate from legacy `[topicId].tsx`).

### Pure helpers — `apps/mobile/utils/upcatExam.ts`
```ts
SUBTESTS = ['Mathematics','Science','Language Proficiency','Reading Comprehension'] as const
buildExam(questions, passages, { subtest, mode }): ExamQuestion[]
  // mode: 'quick' (sample ~15–20, but keep passage sets intact — never split a set)
  //       | 'full' (all in subtest, official order)
  // attaches passage_text to each question via set_id; groups passage-set questions contiguously
scoreExam(answers): { overall: {correct,total}, bySubtest: Record<subtest,{correct,total}> }
```
All pure + unit-tested (sampling keeps sets whole; passage attachment; scoring by subtest).

### Entry screen — `practice/upcat/index.tsx`
- 4 subtest cards (name + Q-count + best-score) + "Full Mock Exam" card.
- Tap a card → Quick / Full chooser sheet.
- Full Mock → 4 resumable subtest sections (progress persisted in component state for the session).

### Exam screen — `practice/upcat/[subtest].tsx` — the corrected flow
- **Select, don't auto-advance:** tap option → highlight; explicit **Next** button advances. **Confirm-to-submit** on the last question.
- **Skip:** "Skip" advances without answering; skipped questions are revisitable (a question-navigator strip / "review skipped" before submit).
- **Back + change:** back arrow returns to previous question; answers editable until submit.
- **Passage panel:** for Reading sets, a collapsible passage panel pinned above the question; the 5 set questions sweep under it without re-rendering the passage.
- **Timer:** optional overall countdown (Quick ≈ derived short; Full ≈ derived from real subtest timing). No per-card timer pickers (beta ask). Reuses the existing animated timer-bar pattern.
- **Focus mode:** reuse existing `useFocusMode` + `SessionPausedOverlay`.
- **Results:** overall % hero + **per-subtest breakdown** + per-question review (reuse the existing review-card UI with options, correct/wrong marks, explanation). "Retake exam" + "Back".

### Subtest-tagged sessions
- Add `subtest text` (nullable) to `practice_sessions` — Supabase migration + mobile `db/client.ts` + `schema.ts` + `useRecordSession`. The mock writes one session per subtest section (or tags the single-subtest run). Epic E consumes this; legacy quizzes leave it null.

### Home entry
- Add a "UPCAT Mock Exam" entry point on the practice tab / home (a card linking to `practice/upcat`). Minimal — full practice redesign is Epic G.

---

## A4 — Kuya Baw upgrade

### Persona
- Edit `apps/mobile/services/chatPrompts.ts`: fold the distilled WHO-YOU-ARE + behavioral guardrails (warm Taglish-aware kuya, never guarantee cutoffs, push to upcat.up.edu.ph, honesty) into the existing system-prompt constants. **Keep** the current "respond in clear English" rule + 2-sentence cap. Do NOT inline the Taglish canned FAQ answers (they fight `isTagalogHeavy()`).

### Facts KB (FTS5 RAG)
- **Mobile:** new `upcat_facts` SQLite table (`id, topic, question, answer, source, valid_year`) + an FTS5 virtual table `upcat_facts_fts` with insert/update/delete triggers, mirroring the existing `flashcards_fts` pattern in `db/client.ts`.
- **Retrieval:** extend `services/chatContext.ts` (+ `flashcardRetriever.ts` sibling) to BM25-query `upcat_facts_fts` and inject a `[UPCAT FACTS]` block into the prompt alongside the existing `[RELEVANT FLASHCARDS]` block. Each retrieved fact appends "(as of <valid_year>; verify at upcat.up.edu.ph)" when valid_year present.
- **Seed/import:** Supabase `upcat_facts` table (migration) + admin import path so facts are re-verifiable yearly; mobile pulls via sync like questions. Initial content chunked from `kuya_baw_upcat_context` Parts 1–15 (~30–60 chunks) + 8 historical cutoff rows. (Chunking done as a one-time prepared CSV imported through the same harness.)

---

## 3. Testing strategy

| Sub | Tests |
|---|---|
| A1 | Vitest: each cleaner, idempotency, sentinel variants, letter bounds, region aliases |
| A2 | Vitest: importUpcatCore (passage dedup, letter→index, BOM, Approved→published, conflict upsert) + route auth; mobile sync test |
| A3 | Jest: upcatExam pure helpers (sampling keeps sets whole, passage attach, subtest scoring); component tests (select→confirm, skip+return, change answer, passage render) |
| A4 | Jest: upcat_facts FTS retrieval, chatContext `[UPCAT FACTS]` block injection, persona prompt constants |

Gate: full mobile suite green (currently 517) + admin suite green (242) before ship.

## 4. Delivery

- Mobile: pure JS → **EAS OTA**, no native module → no app.json version bump.
- Admin: auto-deploys on push (Vercel).
- Migrations: 016 (upcat tables) + `practice_sessions.subtest` + `upcat_facts` — applied via Supabase MCP after the importer/tests pass.
- The real 320-row question import + facts seed run via the admin importer / MCP once verified.

## 5. Out of scope (other epics)

- IA rework, legacy flashcard-quiz flow fix, onboarding reorder, Practice redesign → **Epic G**.
- UPG computation → **Epic E** (A only supplies subtest-tagged scores).
- Career RAG → **Epic D** (reuses A4's FTS mechanism).
- Visual/image questions (`has_visual` reserved; all current rows are No).
