import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createServerClient, transformSheetRow } from '@iskotify/utils'

function getAuth() {
  let credentials: unknown
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing or malformed')
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

async function fetchSheetRows(): Promise<Record<string, string>[]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID!,
    range: 'Sheet1',
  })
  const [headers, ...rows] = response.data.values ?? []
  if (!headers) return []
  return rows.map(row =>
    Object.fromEntries(
      (headers as string[]).map((h, i) => [h, (row as string[])[i] ?? ''])
    )
  )
}

export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_SECRET
  if (!secret) {
    console.error('[sync] SYNC_SECRET is not configured')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rawRows = await fetchSheetRows()
    const listings = rawRows.map(row => {
      const result = transformSheetRow(row)
      if (result === null) console.error('[sync] skipped invalid row:', row)
      return result
    })
    const valid = listings.filter((l): l is NonNullable<typeof l> => l !== null)
    const skipped = listings.length - valid.length
    const incomingSlugs = valid.map(l => l.slug)

    const supabase = createServerClient()

    if (valid.length > 0) {
      const { error } = await supabase.from('listings').upsert(valid, { onConflict: 'slug' })
      if (error) {
        console.error('[sync] upsert error:', error)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
    }

    let closed = 0
    // Guard required: NOT IN () with an empty list is invalid SQL
    if (incomingSlugs.length > 0) {
      // Slugs are validated by Zod to match [a-z0-9-] — safe to interpolate directly
      const { data: closedRows, error: closeError } = await supabase
        .from('listings')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .not('slug', 'in', `(${incomingSlugs.join(',')})`)
        .select('id')
      if (closeError) {
        console.error('[sync] soft-close error:', closeError)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
      closed = closedRows?.length ?? 0
    }

    return NextResponse.json({ synced: valid.length, skipped, closed })
  } catch (err) {
    console.error('[sync] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
