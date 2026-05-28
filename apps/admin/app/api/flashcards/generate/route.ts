import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const MIN_COUNT = 1
const MAX_COUNT = 25
const DEFAULT_COUNT = 10

interface GeneratedCard {
  question: string
  answer: string
  explanation: string
}

interface GeminiOutput {
  cards: GeneratedCard[]
}

/**
 * Build the prompt sent to Gemini. The bulk of the quality lives here —
 * tuned to match Philippine college-entrance and scholarship exam standards
 * (UPCAT, ACET, DCAT, USTET, PUPCET, FEUCAT, DOST-SEI, CHED, etc.).
 *
 * Exposed for unit testing — the prompt's structure is part of the contract.
 */
export function buildGenerationPrompt(params: {
  subject: string
  topic: string
  count: number
  listingSlugs: string[]
}): string {
  const { subject, topic, count, listingSlugs } = params
  const examLine = listingSlugs.length > 0
    ? `Target these specific exams (match their style and difficulty): ${listingSlugs.join(', ')}.`
    : `Target general Philippine college-entrance and scholarship exam style.`

  return `You are an expert content writer for Philippine college entrance exams and scholarships.
Your flashcards are studied by Grade 11–12 Filipino students preparing for high-stakes admission tests including:
UPCAT (University of the Philippines), ACET (Ateneo), DCAT (De La Salle), USTET (Santo Tomas),
PUPCET (PUP), FEUCAT (FEU), BUCET (Bicol University), AdNU-CEA (Ateneo de Naga),
BEE (Benilde), MPASS (Mapua), MSU-SASE, and scholarship qualifying exams including
DOST-SEI Merit, CHED Merit Scholarship, GSIS Educational, Ayala Foundation U-Go,
SM Foundation, Metrobank Foundation ACCESS II, and the Tertiary Education Subsidy.

TASK
Generate exactly ${count} flashcards for the topic "${topic}" under the subject "${subject}".
${examLine}

QUALITY STANDARDS (non-negotiable)
- Test conceptual understanding, NOT rote memorization. Avoid "what is the definition of X" — instead probe application, analysis, or comparison.
- Difficulty: rigorous college-entrance level. A well-prepared HS senior should solve each in 1–2 minutes with effort.
- Single best, unambiguous answer. No "all of the above", no opinion-based answers, no trick questions.
- Cover a SPREAD of sub-topics within "${topic}". Do not duplicate concepts across cards.
- Calibrate to the Philippine context where relevant (Filipino authors, Philippine history, local geography, peso currency, metric units).
- Math/Science: include word problems and multi-step application questions, not just formula recall. Use realistic numbers.
- Language/Literature: test comprehension, inference, and analysis — not just vocabulary lookup. Use Filipino works when fitting (Rizal, Balagtas, Bautista, etc.).
- History/Social Studies: emphasize cause-and-effect, dates with context, significance — not isolated trivia.

CARD STRUCTURE
- "question": 1–3 sentences. Self-contained — no references to "the above" or "Figure 1". Include any data the student needs to solve it.
- "answer": The correct answer only. Concise: a number, formula, term, or 1–2 sentence statement. No restating the question.
- "explanation": 1–3 sentences. Explain WHY this is correct — name the relevant concept/formula, mention a common student mistake when useful. This is the teaching content.

OUTPUT FORMAT
Return ONLY valid JSON. No markdown fences. No preamble. Exact shape:
{
  "cards": [
    { "question": "...", "answer": "...", "explanation": "..." }
  ]
}

Generate ${count} cards now.`
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

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
    }

    const body = await req.json().catch(() => null) as {
      subject_name?: string
      topic_name?: string
      listing_slugs?: string[]
      count?: number
    } | null

    const subject = body?.subject_name?.trim() ?? ''
    const topic = body?.topic_name?.trim() ?? ''
    const listingSlugs = Array.isArray(body?.listing_slugs) ? body!.listing_slugs.filter(s => typeof s === 'string') : []
    const requestedCount = typeof body?.count === 'number' ? body.count : DEFAULT_COUNT
    const count = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.floor(requestedCount)))

    if (!subject || !topic) {
      return NextResponse.json({ error: 'subject_name and topic_name are required' }, { status: 400 })
    }

    const prompt = buildGenerationPrompt({ subject, topic, count, listingSlugs })

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        // Card payload is small; cap output well above expected size for headroom.
        maxOutputTokens: 8192,
        // Low but non-zero — quality factual content, slight diversity across sub-topics.
        temperature: 0.4,
      },
    })

    const result = await model.generateContent(prompt)
    const raw = result.response.text()

    let parsed: GeminiOutput
    try {
      parsed = JSON.parse(extractJson(raw))
    } catch {
      console.error('[generate] failed to parse Gemini response. Raw (first 500 chars):', raw.slice(0, 500))
      return NextResponse.json({ error: 'AI returned unexpected format' }, { status: 502 })
    }

    if (!parsed.cards || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
      return NextResponse.json({ error: 'AI returned no cards' }, { status: 502 })
    }

    // Defensive shape-cleanup: drop cards missing q/a, coerce explanation to string.
    const cleaned = parsed.cards
      .filter(c => typeof c?.question === 'string' && c.question.trim() && typeof c?.answer === 'string' && c.answer.trim())
      .map(c => ({
        question: c.question.trim(),
        answer: c.answer.trim(),
        explanation: typeof c.explanation === 'string' ? c.explanation.trim() : '',
      }))

    if (cleaned.length === 0) {
      return NextResponse.json({ error: 'AI returned no valid cards' }, { status: 502 })
    }

    return NextResponse.json({ cards: cleaned })
  } catch (err) {
    console.error('[generate] unexpected error:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
