import { useCallback } from 'react'
import { eq, isNull } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { flashcards, topics, subjects } from '../db/schema'
import { modelExists, buildPrompt, runInference } from '../services/llm'

function shuffleWithCorrect(
  correctAnswer: string,
  distractors: [string, string, string]
): { options: string[]; correctIndex: number } {
  const all: string[] = [correctAnswer, ...distractors]
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j]!, all[i]!]
  }
  return { options: all, correctIndex: all.indexOf(correctAnswer) }
}

export async function runEnhancement(db: DrizzleClient): Promise<void> {
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

      const subjectName = subjectRows[0]?.name ?? 'General Knowledge'
      const topicName = topicRows[0].topicName

      const prompt = buildPrompt({ subjectName, topicName, question: card.question, answer: card.answer })
      const output = await runInference(prompt)
      if (!output) continue

      const { options, correctIndex } = shuffleWithCorrect(card.answer, [
        output.wrong_option_1,
        output.wrong_option_2,
        output.wrong_option_3,
      ])

      await db
        .update(flashcards)
        .set({
          aiOptions: JSON.stringify(options),
          aiCorrectIndex: correctIndex,
          aiExplanation: output.explanation,
          aiEnhancedAt: Date.now(),
        })
        .where(eq(flashcards.id, card.id))
    } catch {
      // Skip this card silently — it will be retried on the next trigger
    }
  }
}

export function useAiEnhancement() {
  const enhance = useCallback(async (db: DrizzleClient) => {
    await runEnhancement(db)
  }, [])

  return { enhance }
}
