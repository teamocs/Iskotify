# Kuya Baw Retirement + Core Feature Modules — Implementation Plan (2026-08-06)

Source: user spec (2026-08-06): complete Kuya Baw retirement (mobile + landing), mock-test UI fix, distractor difficulty overhaul, and 4 new modules (Personalized Study Plan, Detailed Answer Explanations, Performance Analytics, Flashcards SRS). Branch: `feature/homepage-optimization` (continuing).

## Global Constraints

- **Migrations are files only.** The user applies them manually by pasting into the Supabase SQL editor — NEVER connect or apply via the supabase MCP. Migrations 001-047 are already applied remotely. Next free number: **048**. Every task that adds a migration must say so explicitly in its report so the final summary can list files to paste, in order.
- **User-local tables sync via the `user_app_data` jsonb bag** (supabase/migrations/037_user_app_data.sql, services/sync.ts:81,185-188, services/export.ts). Any new user-local table (attempts, SRS, study plan) must be added to: apps/mobile/db/schema.ts, db/client.ts MIGRATIONS, sync.ts bag, export.ts backup/restore — and needs a small migration only if the remote bag schema needs a new key (it is jsonb; usually no SQL change needed — verify).
- **db/client.ts `MIGRATIONS` is an ordered, index-sensitive list on installed devices. NEVER remove or reorder existing entries; append only.** When retiring features, leave old entries as idempotent no-ops if removal would shift indices (verify how the runner tracks position before touching anything).
- **Design bar:** any task creating or restyling UI must first Read the design skill file named in its brief — mobile app UI: `C:\Users\raroc\.claude\skills\impeccable\SKILL.md`; web landing page: `C:\Users\raroc\.claude\skills\gpt-taste\SKILL.md` — and apply its principles within the app's existing token system (useTheme(), theme/tokens.ts). No hardcoded colors. All new Text gets `maxFontSizeMultiplier` caps consistent with existing usage.
- **On-device AI infra STAYS** (llm.ts core inference, useAiEnhancement MCQ distractor generation, listingSearch Tier-2, useModelDownload). Only chat-specific code goes. The mascot (kuya-baw images) stays as brand art where used outside chat (activate/expired/onboarding screens; landing FooterCTA + ListingGrid empty state).
- Tests: full mobile jest suite + tsc green before each task's commit (baseline 126 suites / 1733 tests at HEAD 7436d6e); admin vitest + tsc when admin touched (baseline 68 files / 670 tests).
- Commits end with "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>".

## Task A: Complete Kuya Baw chat removal (mobile)

Execute the removal manifest verbatim (it is authoritative; re-verify only where it flags caution):

1. DELETE chat-only files: providers/KuyaChatProvider.tsx, hooks/useKuyaChat.ts, hooks/useKuyaEnabled.ts, components/AskKuyaModal.tsx, components/ChatBubble.tsx, components/TypingDots.tsx, services/chatPrompts.ts, services/chatContext.ts, services/ragPipeline.ts, services/ssotAnswer.ts, services/flashcardRetriever.ts, services/geminiClient.ts, services/geminiKey.ts, app/settings/gemini-key.tsx, services/coachTemplates.ts, services/aiConfig.ts, scripts/build-kuya-lottie.mjs (repo root), apps/mobile/assets/animations/kuya-baw-hero.json, apps/mobile/scripts/generate-mascot.js — plus their dedicated test files (18 listed in the manifest, incl. db/__tests__/aiChatConfig.repro.test.ts).
2. **Model download relocation (Finding 1 resolution):** KEEP hooks/useModelDownload.ts (+ .web) and repurpose components/KuyaDownloadSheet.tsx as a de-branded `AiModelDownloadSheet` (strip Kuya persona copy; neutral "On-device AI model" language). Add a Settings row under a new "AI Features" section (app/settings.tsx) that opens it, so AI flashcard enhancement (useAiEnhancement) and Tier-2 offline listing search keep a download path. runEnhancement/_layout wiring stays.
3. EDIT mixed files exactly as the manifest specifies: app/_layout.tsx (unwrap provider), components/TabBar.tsx (remove FAB + center slot, collapse to single 4-tab row), components/web/SidebarNav.tsx (remove chat item + styles), app/(tabs)/practice.tsx (remove AI Chat card; keep AI Study Feedback), app/settings.tsx (remove AI Chat section; add AI Features section per #2), services/settings.ts (drop aiProvider field paths; DB column stays), services/llm.ts + llm.web.ts (strip runCoachInference/streamChatInference/parseCoachPhrase; keep core), services/coachQueue.ts (inline COACH_CATEGORIES, then delete services/coachPrompts.ts), services/sync.ts (stop mirroring ai_chat_config), db/schema.ts (remove chatMessages + aiChatConfig defs), db/client.ts + db/web/openWebDatabase.ts (**append-only rule above** — verify runner indexing; make retired CREATE/FTS entries no-ops only if indices would shift), copy edits in app/welcome.tsx, app/help.tsx, app/about.tsx, app/settings/report-bug.tsx, comment edits in EdgeSwipeNavigator.tsx + (tabs)/index.tsx.
4. Admin: DELETE app/admin/ai-config/ page, components/admin/AiConfigEditor.tsx, app/api/admin/ai-config/ route + tests, lib/aiConfigDefaults.ts; remove any nav link to ai-config; edit app/admin/guide/page.tsx:19 copy.
5. EDIT tests per manifest (practice.test.tsx, SidebarNav.test.tsx, home.test.tsx stale negatives, sync.test.ts fixture, llm.test.ts coach blocks).
6. Keep: everything in the manifest's KEEP table (useAiEnhancement, listingSearch, coachQueue consumer, mascot assets, career kuya_baw_summary, packages llama.rn + background-downloader).
7. No SQL migration (remote chat tables stay; mobile just stops referencing them).

## Task B: Landing page — remove all Kuya Baw / AI-chat marketing

Read `C:\Users\raroc\.claude\skills\gpt-taste\SKILL.md` first. Landing lives at apps/admin/app/page.tsx + components/landing/.

1. Hero.tsx: delete the phone-mock Kuya hero band (:117-134) and the center chat FAB in the mock nav (:202-207); rebalance the vacated space (grow My Focus or Subjects card) so the mock reads as the real post-redesign app (focus tiles, subjects grid, 4-tab nav).
2. Features.tsx: delete KuyaBawChat() (:75-109) and the "AI Companion / Kuya Baw" FeatureBlock (:198-204); replace BenefitCard #6 (:267-277) with a non-chat card marketing the roadmap features actually shipping (e.g. "Smart study plan & progress analytics — daily goals paced to your exam date, spaced-repetition flashcards, and per-subject tracking") so the 2×3 benefit grid stays intact; keep the career "AI-proof course"/"AI's impact" copy (:177, :217-218); keep ":194 AI flashcards" phrase (on-device enhancement survives); drop the now-unused next/image import.
3. DELETE components/landing/KuyaBawCTA.tsx (orphaned) + its test describe; delete public/kuya-baw-avatar.png; verify public/kuya-baw-mascot.svg is truly unreferenced before deleting; KEEP kuya-baw-waving.png (FooterCTA, ListingGrid empty state).
4. FAQ.tsx:14 — strip "and AI coach features".
5. Tests: landing-overhaul.test.tsx — remove KuyaBawCTA import/describe; fix/invert the "Ask Kuya Baw" hero assertion (:103); assert the new benefit card.
6. Admin suite + tsc green.

## Task C: Mock-test UI optimization (shared QuestionCard/OptionButton)

Read `C:\Users\raroc\.claude\skills\impeccable\SKILL.md` first. The four engines hand-roll byte-identical question/option UI (exam/[slug].tsx:615-647, upcat/[subtest].tsx:260-292, diagnostic/index.tsx:219-245, FlashcardExam.tsx:190-217).

1. Create shared `components/practice/QuestionCard.tsx` + `OptionList.tsx` (question text, optional passage slot, options with letter chips) and adopt in all four engines, deleting the duplicated style blocks.
2. Visual hierarchy fix (the actual complaint): question text becomes the dominant element — raise `qText` to typo.lg minimum with lineHeight ≥ 1.35×; options shrink: letter chip 30→24px, `paddingVertical` 13→9, `optTxt` typo.md(17)→typo.sm+1 (≈14-15) with lineHeight ≥ 1.35×, `gap` 9→8. Cap ALL question/option text with `maxFontSizeMultiplier` (match PassagePanel's convention).
3. Options zone: reduce the hard `maxHeight: winH * 0.55` cap to ≈0.42 so the question pane gets the majority of the viewport; options scroll within their zone when they overflow.
4. Fix FlashcardExam token drift while adopting the shared components ('#fff'→t.textInverse, hardcoded greens/reds→t.success/t.danger, gap 12→spacing tokens) and add `accessibilityState={{selected}}` everywhere.
5. Keep both scroll shapes working (split fixed-zone in exam/upcat/diagnostic; single-scroll in FlashcardExam). Per-question scroll reset stays.
6. Tests: shared components get their own tests; update FlashcardExam + diagnostic tests; full suite green.

## Task D: Attempt telemetry foundation (per-question records + timing)

Foundation for Tasks G, H, I — no user-visible UI beyond what exists.

1. New local table `question_attempts` (db/schema.ts + client.ts MIGRATIONS append): id, sessionKey (attempt start ms), sourceTable 'upcat_questions'|'flashcards', questionId, listingSlug, subtest, topic, selectedIndex, correctIndex, correct (bool), elapsedMs, answeredAt. Index on (answeredAt), (questionId).
2. Per-question timing: capture Date.now() on idx-change in each engine (hooks exist at exam:181-183, upcat:59-61, diagnostic:70-72; FlashcardExam needs one) and accumulate elapsedMs per question (revisits add up).
3. Write attempts in all four engines' submit() alongside existing recordSession calls.
4. **Fix the user_progress producer gap:** FlashcardExam.submit also inserts per-card user_progress rows (flashcardId, correct, answeredAt) so weak-topic detection/streak/today-accuracy finally have a live producer.
5. Sync/backup: add question_attempts (and confirm user_progress) to the user_app_data bag in sync.ts + export.ts. Verify whether the remote jsonb bag needs a migration (likely not — document either way).
6. Tests: pure attempt-row builder + timing accumulator utils; engine submit tests extended; full suite green.

## Task E: Detailed answer explanations

1. Migration `048_question_explanations.sql`: `alter table upcat_questions add column if not exists option_explanations jsonb not null default '[]'::jsonb, add column if not exists strategy_tip text not null default '';` and same two columns on `flashcards`. No updated_at bump needed for empty defaults BUT content backfills later must bump — note it in the file header.
2. Mobile mirrors (schema.ts + client.ts MIGRATIONS append; text column storing JSON for option_explanations) + sync.ts select/upsert mappings for both tables.
3. Shared `components/practice/ReviewCard.tsx` (read the impeccable skill first): question, your answer vs correct (tone colors), correct-answer rationale (existing explanation), per-option "why it's wrong" rows (from option_explanations, rendered only when present), strategy tip chip (💡 formula shortcut/mnemonic/time tip, when present). Explanation text ≥ typo.sm with proper lineHeight (current typo.xs/12px is the least readable text in the app).
4. Adopt ReviewCard in exam ReviewAccordion, upcat results, FlashcardExam results, and ADD a per-question review section to diagnostic results (data already loaded there).
5. Admin: extend the Gemini generation pipeline (generate route + lib/gemini/generateDistractors.ts) to also produce option_explanations + strategy_tip for new cards, and add a bulk "Generate explanations" action for existing upcat_questions/flashcards missing them (batch, rate-limited, service-role update). Admin tests.
6. Full mobile + admin suites green.

## Task F: Distractor difficulty overhaul

1. Rewrite the distractor-generation prompts (lib/gemini/generateDistractors.ts + generate route's buildGenerationPrompt) around plausibility: distractors must be common student misconceptions, near-miss calculations, or partially-true statements — never category errors or obviously-wrong fillers; include difficulty rubric + few-shot examples of weak vs strong distractor sets; forbid "all of the above"/joke options.
2. Admin bulk action "Regenerate distractors (hard mode)" for existing flashcards (filters: subject/topic, only ai-enhanced or all), batched + rate-limited, updating ai_options/ai_correct_index (+ option_explanations from Task E in the same call to save Gemini round-trips).
3. Authored upcat_questions seeds are curated content — do NOT auto-rewrite them; instead add an admin review queue view listing questions whose options fail cheap heuristics (any option < 40% the length of the longest, duplicate options, "none/all of the above") so humans can fix them.
4. Tests: prompt-builder unit tests (rubric present, few-shots present), heuristic flagger pure-function tests.

## Task G: Performance analytics dashboard v2

Read the impeccable skill first. Data now exists from Task D.

1. Un-hide the analytics tab (app/(tabs)/_layout.tsx href) with a proper tab icon/label ("Progress").
2. Dashboard additions (components/analytics/, hand-rolled or react-native-svg — no new chart deps): overall score & metrics row (sessions, avg accuracy, streak, active days — exists, restyle per skill); per-subject accuracy breakdown (exists — keep); **avg time per question** overall + per subject (from question_attempts.elapsedMs); **Most Common Mistakes** list (top wrong questions/topics by miss count from question_attempts, tap → review that topic); **trend chart** of accuracy over weeks (line/bar from practice_sessions + attempts, longer window than the current 7-day).
3. Percentile band history: store estimatePercentileBand result per mock attempt (derivable from sessions — compute, don't add tables unless needed).
4. Tests for the new aggregate functions (pure SQL/JS helpers in services/homeAggregates.ts or a new services/analyticsAggregates.ts); full suite green.

## Task H: Flashcards spaced repetition (SRS)

1. New local table `flashcard_srs` (flashcardId PK, intervalDays, easeFactor, repetitions, lapses, dueAt, lastReviewedAt, lastGrade) — schema.ts + client.ts append + user_app_data bag in sync.ts/export.ts.
2. Pure `utils/srs.ts`: SM-2-lite — grade derived from MCQ correctness + response time (correct+fast=Easy, correct+slow=Good, wrong=Again); intervals 1d/3d/1w+ growth with easeFactor clamp; unit tests over the schedule table (1d→3d→1w progression, lapse reset, clamps).
3. FlashcardExam.submit updates flashcard_srs per card (uses Task D's elapsedMs).
4. Due queue surfaces: `getDueCounts` aggregate; "Due today (N)" chooser option in the listing/topic/deck quiz choosers (alongside Quick/Full/Weak); due badges on Saved Decks and practice-tab deck rows; a "Review due cards" row on the practice tab (top placement when N > 0). pickQuestions gains a 'due' mode ordering by dueAt.
5. Deck categories: surface subject grouping for browsing (subjects → topics already exist; ensure vocabulary/formula-style decks are just topics — no new taxonomy).
6. Tests: srs.ts thoroughly; chooser + aggregate tests; full suite green.

## Task I: Personalized study plan

Read the impeccable skill first. Depends on D (attempts) and H (due counts) being present.

1. New local table `study_plan_items` (id, planDate 'YYYY-MM-DD', kind 'srs_review'|'topic_practice'|'mock_section'|'diagnostic', refId (topicId/subtest/listingSlug), targetCount, completedAt nullable, createdAt) — schema.ts + client.ts append + user_app_data bag.
2. Pure generator `utils/studyPlan.ts`: inputs = focused exam dates (earliest examDate), days remaining, subject readiness percentages, weak topics, due SRS count; output = today's ordered plan (2-4 items): due SRS reviews first, then weakest-subject topic practice sized by days-remaining pacing (more items as exam nears: >60d light, 21-60d moderate, <21d heavy incl. weekly mock_section), diagnostic when no data exists. Deterministic (date passed in), fully unit-tested.
3. `hooks/useStudyPlan.ts`: generates/loads today's items (idempotent per day), marks complete via useRecordSession integration (session completion matching an item's kind+refId marks it done) and manual check-off.
4. Home: "Today's Plan" fold (top of home, above FocusExamsFold): checklist cards with progress ring, streak flame chip (streakDays exists), all-done state with tomorrow preview. Impeccable-skill styling.
5. Notifications: make the daily 9am nudge dynamic — body names today's top plan item + streak (services/notifications.ts; content computed at schedule time, rescheduled on plan generation); exam countdown nudges already exist.
6. Settings: new "Notifications" section — master toggle (exists as boolean), daily reminder time picker (store hour in user_settings via a new column in the local table + jsonb bag; no remote SQL needed — verify), weekly summary toggle.
7. Tests: studyPlan.ts generator matrix (far/near exam, no data, all caught up), hook tests, full suite green.

## Task ordering

A → B → C → D → E → F → G → H → I. (B may run after A only; C-I strictly sequential per SDD.)
