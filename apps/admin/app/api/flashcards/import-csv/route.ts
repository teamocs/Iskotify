import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { parseCsvRow, type ValidatedRow, type RawCsvRow } from '@/lib/csv/parseCsvRow'
import { validateCsvFile, validateHeader, checkDuplicates, EXPECTED_HEADER } from '@/lib/csv/validateCsvFile'
import { importCsvCore } from '@/lib/csv/importCsvCore'

export const runtime = 'nodejs'  // papaparse + File polyfill rely on Node runtime

export async function POST(req: NextRequest) {
  // Auth — middleware gates /api/* on user session. Use the cookie-aware
  // auth client to recover the user, then the data client for the role check
  // and downstream DB writes.
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 2. File extraction
  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  const fileErr = validateCsvFile(file)
  if (fileErr) return NextResponse.json({ error: fileErr.message }, { status: 400 })

  // 3. Parse with papaparse
  const text = await file.text()
  const parsed = Papa.parse<RawCsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase().replace(/^﻿/, ''),
  })

  // 4. Header check
  if (parsed.meta.fields) {
    const headerErr = validateHeader(parsed.meta.fields)
    if (headerErr) return NextResponse.json({ error: headerErr.message }, { status: 400 })
  } else {
    return NextResponse.json({ error: 'CSV has no header row' }, { status: 400 })
  }

  // 5. Row count
  if (parsed.data.length === 0) {
    return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })
  }
  if (parsed.data.length > 1000) {
    return NextResponse.json({ error: `Too many rows (max 1000, got ${parsed.data.length})` }, { status: 400 })
  }

  // 6. Per-row validation
  const rowErrors: any[] = []
  const validated: ValidatedRow[] = []
  parsed.data.forEach((row, i) => {
    const result = parseCsvRow(row, i)
    if (result.ok) validated.push(result.value)
    else rowErrors.push(...result.errors)
  })

  // 7. Cross-row duplicate check (only when individual rows are clean)
  if (rowErrors.length === 0) {
    rowErrors.push(...checkDuplicates(validated))
  }

  if (rowErrors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', rowErrors }, { status: 400 })
  }

  // 8. Insert
  let result
  try {
    result = await importCsvCore(supabase, validated)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Import failed' }, { status: 500 })
  }

  // 9. Fire async Gemini enhancement per topic (fire-and-forget)
  const origin = new URL(req.url).origin
  const cookie = req.headers.get('cookie') ?? ''
  for (const topic_id of result.topic_ids) {
    fetch(`${origin}/api/flashcards/enhance-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ topic_id }),
    }).catch(err => console.error('[import-csv] enhance-batch dispatch failed:', err))
  }

  return NextResponse.json(result)
}
