import { useCallback } from 'react'
import { eq, isNull } from 'drizzle-orm'
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
      try {
        const topicRows = await db
          .select({ subjectId: topics.subjectId, topicName: topics.name })
          .from(topics)
          .where(eq(topics.id, card.topicId))
          .limit(1)

        if (!topicRows[0]) continue

        const subjectRows = await db
          .select({ name: subjects.name })
          .from(subjects)
          .where(eq(subjects.id, topicRows[0].subjectId))
          .limit(1)

        const subjectName = subjectRows[0]?.name || 'General Knowledge'
        const topicName = topicRows[0].topicName

        const prompt = buildPrompt({ subjectName, topicName, question: card.question, answer: card.answer })
        const output = await runInference(prompt)
        if (!output) continue

        const rawDistractors = [output.wrong_option_1, output.wrong_option_2, output.wrong_option_3]
        const answerNorm = card.answer.toLowerCase().trim()
        const uniqueDistractors = [
          ...new Set(rawDistractors.filter((d) => d.toLowerCase().trim() !== answerNorm)),
        ]
        if (uniqueDistractors.length < 3) continue

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
      } catch (err) {
        console.warn(`[runEnhancement] card ${card.id} failed:`, err)
      }
    }
  } finally {
    running = false
  }
}

export function useAiEnhancement() {
  const enhance = useCallback(async (db: DrizzleClient) => {
    await runEnhancement(db)
  }, [])

  return { enhance }
}
