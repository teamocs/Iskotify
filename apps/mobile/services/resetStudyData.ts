import type { DrizzleClient } from '../db/client'
import {
  userProgress,
  practiceSessions,
  questionAttempts,
  flashcardSrs,
  studyPlanItems,
  focusListings,
  savedDecks,
  userSettings,
  userRequirements,
  coachPhrases,
  examRuns,
  resultWatches,
} from '../db/schema'

/**
 * Every local table that holds a student's own study data. The phone's
 * "Reset App Data" clears all of them.
 *
 * Deliberately NOT here:
 *  - notes, note_labels, note_label_assignments: a student's notes are kept.
 *    They delete notes themselves from Notes.
 *  - question_feedback: the queue of question reports they already sent.
 *  - the synced catalog (listings, flashcards, questions, schools, careers…).
 *
 * services/__tests__/resetStudyData.test.ts makes every table in db/schema.ts
 * declare which of these buckets it is in, so a new study table can't be missed.
 */
export const STUDY_TABLES = [
  userProgress,
  practiceSessions,
  questionAttempts,
  flashcardSrs,
  studyPlanItems,
  focusListings,
  savedDecks,
  userSettings,
  userRequirements,
  coachPhrases,
  examRuns,
  resultWatches,
] as const

/** Clears all study data on this device in one transaction. Notes are kept. */
export async function resetStudyData(db: DrizzleClient): Promise<void> {
  await db.transaction((tx) => {
    for (const table of STUDY_TABLES) tx.delete(table).run()
  })
}
