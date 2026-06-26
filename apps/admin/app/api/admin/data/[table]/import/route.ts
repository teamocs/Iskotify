import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { DATA_TABLE_MAP, ALLOWED_TABLES } from '@/lib/dataTables'
import { importDataTable } from '@/lib/dataTables/importCore'
import { parseCsv } from '@/lib/dataTables/serialization'
import { stripBom } from '@/lib/csv/cleaners'

export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024 // 5MB

// POST /api/admin/data/[table]/import  (multipart form-data, field "file")
// Accepts CSV or JSON; upserts on the table's id column. Returns {inserted, updated, errors}.
export async function POST(req: NextRequest, context: { params: Promise<{ table: string }> }) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { table } = await context.params
  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 })
  }
  const config = DATA_TABLE_MAP[table]!

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form-data with a "file" field' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  const text = stripBom(await file.text())
  const head = text.trimStart()
  const isJson = (file.name ?? '').toLowerCase().endsWith('.json') || head.startsWith('[') || head.startsWith('{')

  let rawRows: Record<string, unknown>[]
  try {
    if (isJson) {
      const parsed = JSON.parse(text)
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : null
      if (!arr) {
        return NextResponse.json({ error: 'JSON must be an array of rows or { "rows": [...] }' }, { status: 400 })
      }
      rawRows = arr as Record<string, unknown>[]
    } else {
      rawRows = parseCsv(text)
    }
  } catch {
    return NextResponse.json({ error: 'Could not parse the file' }, { status: 400 })
  }

  if (rawRows.length === 0) {
    return NextResponse.json({ error: 'No rows found in the file' }, { status: 400 })
  }

  const result = await importDataTable(supabase, config, rawRows)
  return NextResponse.json({ ok: true, ...result })
}
