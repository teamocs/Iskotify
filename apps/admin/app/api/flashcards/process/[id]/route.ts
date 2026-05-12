import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { GoogleGenerativeAI } from '@google/generative-ai'

const PROMPT = `You are extracting Q&A flashcard pairs from a study material PDF for Filipino students
preparing for scholarship and qualifying exams (DOST-SEI, UPCAT, PUPCET, CSE, etc.).

Analyze the entire document and extract the most important concepts as question-answer pairs.

Return ONLY valid JSON with this exact structure — no markdown, no explanation, no extra text:
{
  "subject": "<subject area, e.g. Science, Mathematics, Filipino, English, General Knowledge>",
  "topic": "<specific topic, e.g. Cell Biology, Algebra, Panitikang Filipino>",
  "cards": [
    {
      "question": "<clear, specific question>",
      "answer": "<concise, accurate answer>",
      "explanation": "<brief context or elaboration — empty string if not needed>",
      "difficulty": 1
    }
  ]
}

Difficulty levels:
  1 = Basic recall (definition, fact)
  2 = Application (explain, compare, compute)
  3 = Analysis/synthesis (evaluate, connect concepts)

Generate between 15 and 40 cards. Prioritize high-yield concepts for competitive exams.`

interface GeminiCard {
  question: string
  answer: string
  explanation: string
  difficulty: number
}

interface GeminiResponse {
  subject: string
  topic: string
  cards: GeminiCard[]
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: job, error: fetchError } = await supabase
    .from('pdf_jobs')
    .update({ status: 'processing' })
    .eq('id', id)
    .select('id, pdf_url')
    .single()

  if (fetchError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  async function failJob(msg: string) {
    await supabase
      .from('pdf_jobs')
      .update({ status: 'failed', error_msg: msg })
      .eq('id', id)
  }

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('flashcard-pdfs')
      .download(job.pdf_url)

    if (downloadError || !fileBlob) throw new Error('Failed to download PDF')

    const buffer = await fileBlob.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const result = await model.generateContent([
      { text: PROMPT },
      { inlineData: { data: base64, mimeType: 'application/pdf' } },
    ])

    const raw = result.response.text()
    let parsed: GeminiResponse
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('Gemini returned unexpected format')
    }

    if (!parsed.cards || parsed.cards.length === 0) {
      throw new Error('Gemini returned unexpected format')
    }

    const { data: subject, error: subjectError } = await supabase
      .from('flashcard_subjects')
      .upsert({ name: parsed.subject }, { onConflict: 'name' })
      .select('id')
      .single()

    if (subjectError || !subject) throw new Error('Failed to upsert subject')

    const { data: topic, error: topicError } = await supabase
      .from('flashcard_topics')
      .insert({ name: parsed.topic, subject_id: subject.id, status: 'draft' })
      .select('id')
      .single()

    if (topicError || !topic) throw new Error('Failed to insert topic')

    const cards = parsed.cards.map((c) => ({
      topic_id: topic.id,
      question: c.question,
      answer: c.answer,
      explanation: c.explanation,
      difficulty: c.difficulty,
      status: 'draft',
      source_pdf_url: job.pdf_url,
      listing_slugs: [],
    }))

    const { error: cardsError } = await supabase.from('flashcards').insert(cards)
    if (cardsError) throw new Error('Failed to insert flashcards')

    await supabase
      .from('pdf_jobs')
      .update({ status: 'done', subject_id: subject.id, topic_id: topic.id, card_count: cards.length })
      .eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[process] job failed:', msg)
    await failJob(msg)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
