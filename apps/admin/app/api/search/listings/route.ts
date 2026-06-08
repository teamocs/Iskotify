import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { waitForRateAllow } from '@/lib/redis/rateLimiter'

export const runtime = 'nodejs'

interface Item { id: string; title: string; type: string; region?: string; provider?: string }

function extractJsonArray(raw: string): string[] {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    const text = (fenced && fenced[1]) ? fenced[1] : raw
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end === -1 || end <= start) return []
    const arr = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

/**
 * Natural-language ("talk to an AI") search over the user's loaded exam/scholarship
 * listings. The mobile app POSTs its query + a compact listings array; Gemini returns
 * a relevance-ranked list of ids. Public (the native app calls it unauthenticated) and
 * rate-limited via the shared Gemini gate. The app falls back to on-device / keyword
 * search if this is unavailable.
 */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'AI search unavailable' }, { status: 503 })
  }

  let body: { query?: string; items?: Item[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const query = (body.query ?? '').trim().slice(0, 300)
  const items = Array.isArray(body.items) ? body.items.slice(0, 120) : []
  if (!query || items.length === 0) return NextResponse.json({ ids: [] })

  try {
    await waitForRateAllow('gemini:global', { max: 14, windowSec: 60 })

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024, temperature: 0.2 },
    })

    const compact = items.map(i => ({
      id: i.id, title: i.title, type: i.type, region: i.region ?? '', provider: i.provider ?? '',
    }))

    const prompt = `You are a search assistant for a Philippine college entrance exam & scholarship app.
The user typed a natural-language search; return ONLY the ids of listings that genuinely match, most relevant first.

User search: "${query}"

Listings (JSON): ${JSON.stringify(compact)}

Rules:
- Interpret intent: exam vs scholarship, region / "near me", course or field of study, low-income / free, provider.
- Include only genuinely relevant ids. If nothing matches, return an empty array.
- Output ONLY a JSON array of id strings ordered by relevance, e.g. ["id1","id2"]. No prose, no markdown.`

    const result = await model.generateContent(prompt)
    const ids = extractJsonArray(result.response.text())
    const valid = new Set(items.map(i => i.id))
    return NextResponse.json({ ids: ids.filter(id => valid.has(id)) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'AI search failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
