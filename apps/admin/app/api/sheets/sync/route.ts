import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createServerClient, transformSheetRow } from '@iskotify/utils'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
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
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SYNC_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawRows = await fetchSheetRows()
  const listings = rawRows.map(transformSheetRow)
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
  if (incomingSlugs.length > 0) {
    const { data: closedRows } = await supabase
      .from('listings')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('status', 'active')
      .not('slug', 'in', `(${incomingSlugs.join(',')})`)
      .select('id')
    closed = closedRows?.length ?? 0
  }

  return NextResponse.json({ synced: valid.length, skipped, closed })
}
