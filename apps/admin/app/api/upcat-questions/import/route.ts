import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { importUpcatCore, type RawUpcatRow } from '@/lib/upcat/importUpcatCore'
import { normalizeQuestionBankHeader } from '@/lib/csv/questionBankHeaders'

export const runtime = 'nodejs'

const EXPECTED = ['question_id','subtest','main_subject','topic','subtopic','question_format','cognitive_level','difficulty','curriculum_alignment','has_visual','visual_type','visual_description','set_id','set_position','passage_text','question_text','option_a','option_b','option_c','option_d','correct_answer','explanation','status']

export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })

  const text = await file.text()
  const parsed = Papa.parse<RawUpcatRow>(text, {
    header: true, skipEmptyLines: true,
    transformHeader: normalizeQuestionBankHeader,
  })
  const fields = parsed.meta.fields ?? []
  const missing = EXPECTED.filter(c => !fields.includes(c))
  if (missing.length) return NextResponse.json({ error: `Missing columns: ${missing.join(', ')}` }, { status: 400 })

  const rows = (parsed.data as RawUpcatRow[]).filter(r => (r.question_id ?? '').trim())
  if (rows.length === 0) return NextResponse.json({ error: 'No data rows' }, { status: 400 })
  if (rows.length > 2000) return NextResponse.json({ error: `Too many rows (max 2000, got ${rows.length})` }, { status: 400 })

  try {
    const result = await importUpcatCore(supabase, rows)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Import failed' }, { status: 500 })
  }
}
