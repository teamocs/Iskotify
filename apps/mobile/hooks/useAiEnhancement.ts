import { useCallback } from 'react'
import { eq, isNull, inArray, and } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { flashcards, topics, subjects } from '../db/schema'
import { modelExists, buildPrompt, runInference } from '../services/llm'

let running = false

function shuffleWithCorrect(
  correctAnswer: string,
  distractors: [string, string, string]
): { options: string[]; correctIndex: number } {
  const all: string[] = [correctAnswer, ...distractors]
  let correctIndex = 0
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j]!, all[i]!]
    if (i === correctIndex) correctIndex = j
    else if (j === correctIndex) correctIndex = i
  }
  return { options: all, correctIndex }
}

/**
 * Enhance a single flashcard via the local LLM. Returns true if the card was
 * enhanced (DB updated), false if it was skipped (no topic, model returned
 * unusable output, etc.). Never throws — failures are logged.
 */
async function enhanceOneCard(
  db: DrizzleClient,
  card: { id: string; topicId: string; question: string; answer: string },
): Promise<boolean> {
  try {
    const topicRows = await db
      .select({ subjectId: topics.subjectId, topicName: topics.name })
      .from(topics)
      .where(eq(topics.id, card.topicId))
      .limit(1)

    if (!topicRows[0]) return false

    const subjectRows = await db
      .select({ name: subjects.name })
      .from(subjects)
      .where(eq(subjects.id, topicRows[0].subjectId))
      .limit(1)

    const subjectName = subjectRows[0]?.name || 'General Knowledge'
    const topicName = topicRows[0].topicName

    const prompt = buildPrompt({ subjectName, topicName, question: card.question, answer: card.answer })
    const output = await runInference(prompt)
    if (!output) return false

    const rawDistractors = [output.wrong_option_1, output.wrong_option_2, output.wrong_option_3]
    const answerNorm = card.answer.toLowerCase().trim()
    const uniqueDistractors = [
      ...new Set(rawDistractors.filter((d) => d.toLowerCase().trim() !== answerNorm)),
    ]
    if (uniqueDistractors.length < 3) return false

    const { options, correctIndex } = shuffleWithCorrect(
      card.answer,
      uniqueDistractors.slice(0, 3) as [string, string, string]
    )

    await db
      .update(flashcards)
      .set({
        aiOptions: JSON.stringify(options),
        aiCorrectIndex: correctIndex,
        aiExplanation: output.explanation,
        aiEnhancedAt: Date.now(),
      })
      .where(eq(flashcards.id, card.id))
    return true
  } catch (err) {
    console.warn(`[enhanceOneCard] card ${card.id} failed:`, err)
    return false
  }
}

/**
 * Background bulk enhancement: pick up every unenhanced card in the DB and
 * enhance them serially. Fire-and-forget from app start / onboarding finish.
 * Re-entrant-safe via the module-level `running` flag.
 */
export async function runEnhancement(db: DrizzleClient): Promise<void> {
  if (running) return
  running = true
  try {
    if (!(await modelExists())) return

    const unenhanced = await db
      .select({
        id: flashcards.id,
        topicId: flashcards.topicId,
        question: flashcards.question,
        answer: flashcards.answer,
      })
      .from(flashcards)
      .where(isNull(flashcards.aiEnhancedAt))

    for (const card of unenhanced) {
      await enhanceOneCard(db, card)
    }
  } finally {
    running = false
  }
}

export interface EnhanceProgress {
  done: number
  total: number
}

/**
 * Just-in-time enhancement: enhance only the specific cards needed RIGHT NOW
 * (e.g. the cards loaded for an upcoming practice session). Bounded, predictable,
 * and reports progress so the UI can show a "preparing quiz" indicator.
 *
 * - Skips cards already enhanced (so it's safe to call with mixed lists).
 * - Returns the IDs that were actually enhanced this call (useful for telemetry).
 * - If the model isn't downloaded, returns {enhanced: [], skipped: ids} so the
 *   caller can decide to fall back to placeholder distractors.
 * - Never throws.
 *
 * Note: deliberately does NOT use the `running` flag — practice-session
 * enhancement must not be blocked by a background bulk run, otherwise the
 * user waits forever on the loading screen.
 */
export async function enhanceCardsByIds(
  db: DrizzleClient,
  cardIds: string[],
  onProgress?: (p: EnhanceProgress) => void,
): Promise<{ enhanced: string[]; skipped: string[]; modelReady: boolean }> {
  if (cardIds.length === 0) {
    return { enhanced: [], skipped: [], modelReady: false }
  }
  const modelReady = await modelExists()
  if (!modelReady) {
    return { enhanced: [], skipped: cardIds, modelReady: false }
  }

  // Pull only cards in the requested set that lack aiEnhancedAt — already-enhanced
  // cards in the list are silently no-op'd.
  const candidates = await db
    .select({
      id: flashcards.id,
      topicId: flashcards.topicId,
      question: flashcards.question,
      answer: flashcards.answer,
    })
    .from(flashcards)
    .where(and(inArray(flashcards.id, cardIds), isNull(flashcards.aiEnhancedAt)))

  const enhanced: string[] = []
  const skipped: string[] = []
  const total = candidates.length

  onProgress?.({ done: 0, total })
  for (let i = 0; i < candidates.length; i++) {
    const card = candidates[i]!
    const ok = await enhanceOneCard(db, card)
    if (ok) enhanced.push(card.id)
    else skipped.push(card.id)
    onProgress?.({ done: i + 1, total })
  }
  return { enhanced, skipped, modelReady: true }
}

export function useAiEnhancement() {
  const enhance = useCallback(async (db: DrizzleClient) => {
    await runEnhancement(db)
  }, [])

  return { enhance }
}
