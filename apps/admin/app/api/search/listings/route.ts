import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Listing search for the student app. Student-typed queries are never sent to an
 * AI provider (provider API terms bar under-18 audiences), so this route does no
 * ranking of its own: it keeps the `{ ids }` response shape that older installed
 * apps expect and answers with an empty list, which those clients treat as "use
 * the on-device keyword ranking" (apps/mobile/utils/listingSearch.ts). Current app
 * versions rank by keyword locally and no longer call this route.
 *
 * Public (the native app calls it unauthenticated).
 */
export async function POST(req: NextRequest) {
  try {
    await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  return NextResponse.json({ ids: [] })
}
