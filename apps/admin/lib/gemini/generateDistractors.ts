import { GoogleGenerativeAI } from '@google/generative-ai'
import { waitForRateAllow } from '../redis/rateLimiter'

export interface DistractorResult {
  options: string[]      // 4 entries, shuffled, includes the correct answer
  correctIndex: number   // 0–3
  explanation: string    // 1–2 sentence why-this-is-correct
}

interface DistractorInput {
  subject: string
  topic: string
  question: string
  answer: string
}

function buildPrompt({ subject, topic, question, answer }: DistractorInput): string {
  return `You are writing multiple-choice distractors for a Philippine college entrance / scholarship exam flashcard.

Subject: ${subject}
Topic: ${topic}
Question: ${question}
Correct answer (DO NOT include in your output): ${answer}

Generate exactly 3 incorrect distractors that:
- Are plausible to a student who hasn't fully mastered this topic
- Reflect common student mistakes (sign errors, wrong formula application, near-synonyms, wrong dates, etc.)
- Are in the SAME format and length as the correct answer (if answer is a number → distractors are numbers; if a phrase → phrases of similar length)
- Are unambiguously WRONG when checked against the correct answer
- Are different from each other AND different from the correct answer

Also write a 1–2 sentence explanation of why the correct answer is correct (mention the relevant concept or formula). The explanation is for the student to read AFTER they answer.

Output ONLY valid JSON, no markdown, no preamble:
{
  "wrong_1": "...",
  "wrong_2": "...",
  "wrong_3": "...",
  "explanation": "..."
}`
}

function extractJson(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced && fenced[1]) return fenced[1].trim()
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

function shuffleWithCorrect(correctAnswer: string, distractors: [string, string, string]): { options: string[]; correctIndex: number } {
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

export async function generateDistractorsForCard(input: DistractorInput): Promise<DistractorResult | null> {
  if (!process.env.GEMINI_API_KEY) return null

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 2048,
        temperature: 0.5,
      },
    })

    // Cross-instance rate-limit gate. Replaces the in-process sleep() that used
    // to live in callers — that only worked under a single Vercel function instance.
    await waitForRateAllow('gemini:global', { max: 14, windowSec: 60 })
    const result = await model.generateContent(buildPrompt(input))
    const raw = result.response.text()

    let parsed: { wrong_1?: string; wrong_2?: string; wrong_3?: string; explanation?: string }
    try {
      parsed = JSON.parse(extractJson(raw))
    } catch {
      console.warn('[generateDistractors] malformed JSON. Raw first 300 chars:', raw.slice(0, 300))
      return null
    }

    const w1 = parsed.wrong_1?.trim()
    const w2 = parsed.wrong_2?.trim()
    const w3 = parsed.wrong_3?.trim()
    const explanation = parsed.explanation?.trim() ?? ''

    if (!w1 || !w2 || !w3) {
      console.warn('[generateDistractors] missing distractors in output')
      return null
    }

    const answerNorm = input.answer.toLowerCase().trim()
    const distractors = [w1, w2, w3]
    if (distractors.some(d => d.toLowerCase().trim() === answerNorm)) {
      console.warn('[generateDistractors] a distractor matched the correct answer')
      return null
    }

    const lowerSet = new Set(distractors.map(d => d.toLowerCase().trim()))
    if (lowerSet.size !== 3) {
      console.warn('[generateDistractors] distractors not unique')
      return null
    }

    const { options, correctIndex } = shuffleWithCorrect(input.answer, [w1, w2, w3])
    return { options, correctIndex, explanation }
  } catch (err) {
    console.warn('[generateDistractors] exception:', err instanceof Error ? err.message : err)
    return null
  }
}
