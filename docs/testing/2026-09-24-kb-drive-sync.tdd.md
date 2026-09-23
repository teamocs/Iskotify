# TDD evidence — Drive question-bank sync and question figures

Branch `feature/kb-drive-sync`, 2026-09-24. Journeys come from the plan
approved in-session: import the team's Google Drive question files into the
question bank, keep them syncing automatically, and render figures inside
questions.

## User journeys

1. As an admin, I want new question files in our Drive folder to reach the
   question bank without hand-importing CSVs, so that content writers ship
   questions by saving a file.
2. As an admin, I want imported questions held as drafts and published per
   file after review, so that nothing unreviewed reaches students.
3. As a student, I want the diagram, chart or comic panel a question refers to
   shown with the question, including offline, so that visual items are
   answerable.

## Checkpoints (RED → GREEN)

| Stage | Commit | Command | Result |
|---|---|---|---|
| RED: core specs + migrations | b8df053 | `vitest run lib/kb lib/upcat` | 6 files failed; 3 failed / 22 passed |
| GREEN: sync core | cedb56f | `vitest run lib/kb lib/upcat` | 7 files, 60 passed |
| RED: route specs | 3655727 | `vitest run app/api/kb` | 10 failed |
| GREEN: routes, adapters, cron | 86ce1f8 | `vitest run` (admin) + `tsc --noEmit` | 85 files, 813 passed; tsc clean |
| RED → GREEN: admin panel | bd40faa | `vitest run components/admin/__tests__/KbDriveSyncPanel.test.tsx` | 4 failed → 4 passed |
| Security + DB review fixes | 155f86b | `vitest run lib/kb app/api/kb` | 3 failed → 47 passed |
| TypeScript review fixes | abe6c08 | `vitest run` (admin) | 3 failed → 86 files, 822 passed |
| Mobile figures (per-task TDD) | 54269b5 | `pnpm --filter @iskotify/mobile test` | 136 suites, 1490 passed; type-check clean |
| React review fixes | 0296a10 | same | 3 failed → 136 suites, 1493 passed |

Real-data check (not committed): the six in-scope Drive CSVs parsed with the
committed `fileRules` + `dialects` — 3,200 rows converted, 0 rejected, all ids
unique, 549 figure references, 22 reading passages, PSHS NCE skipped.

## What the tests guarantee

| # | Guarantee | Test |
|---|---|---|
| 1 | A file's name decides its pool; unknown names are flagged, PSHS NCE is skipped | `lib/kb/__tests__/fileRules.test.ts` |
| 2 | All four header layouts convert; ids are namespaced per file; bad rows are rejected with a reason; figure-only stimuli never reference a missing passage | `lib/kb/__tests__/dialects.test.ts` |
| 3 | New files import as drafts; unchanged files are not downloaded; figures upload once under a content hash; missing figures are counted | `lib/kb/__tests__/syncDriveFolder.test.ts` |
| 4 | Edits to live questions re-draft only the edited ones, say so, and re-run the flashcard projection | same |
| 5 | Same-named files, oversize files (including native Sheets) and download failures never corrupt the bank | same |
| 6 | Publishing holds back missing-figure, 3-option and live-duplicate questions | `lib/kb/__tests__/publishKbFile.test.ts` |
| 7 | Cron GET needs the secret; an admin session works on POST only; publish is admin-only | `app/api/kb/*/__tests__/route.test.ts` |
| 8 | The CSV importer keeps its UPCAT-only default and refuses mixed image/no-image batches | `lib/upcat/__tests__/importUpcatCore.test.ts` |
| 9 | Figures render with alt text, zoom, an offline placeholder, and no state carried between questions | `apps/mobile/components/practice/__tests__/QuestionFigure.test.tsx` |
| 10 | Sync keeps working before migration 054 (legacy-column retry on a missing column only) | `apps/mobile/services/__tests__/sync.test.ts` |
| 11 | Questions needing a figure they don't have are never served | `upcatExam`, `examBuilder`, `examBlueprints`, `preAssessmentSource` tests |

## Known gaps

- No live run against Google Drive or Supabase yet: needs migrations 053–055
  applied, `KB_DRIVE_FOLDER_ID` + `CRON_SECRET` set, and the folder shared with
  the service account.
- Figures not checked on a device or simulator.
- The 549 referenced figure files are not in Drive; those questions import as
  drafts and stay unpublished until the images are added.
- Admin ESLint is not configured in this repo (`next lint` prompts for setup),
  so no lint gate ran.
