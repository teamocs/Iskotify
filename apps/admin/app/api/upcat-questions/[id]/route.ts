import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

export const runtime = 'nodejs'

// upcat_questions PK is question_id (text, e.g. 'M001') per migration 016.
// DB CHECK: correct_index BETWEEN 0 AND 3; options text[] NOT NULL.
const QUESTION_STATUSES = new Set(['published', 'draft'])
const MAX_CORRECT_INDEX = 3
const MIN_OPTIONS = 4

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

// GET /api/upcat-questions/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params

  const { data, error } = await supabase
    .from('upcat_questions')
    .select('*')
    .eq('question_id', id)
    .maybeSingle()

  if (error) {
    console.error('[upcat-questions/[id] GET] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  }

  return NextResponse.json({ question: data })
}

// PATCH /api/upcat-questions/[id]
// Whitelist: question_text, options, correct_index, explanation, status.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}

  // question_text: non-empty string
  if (body.question_text !== undefined) {
    if (typeof body.question_text !== 'string' || body.question_text.trim() === '') {
      return NextResponse.json({ error: 'question_text must be a non-empty string' }, { status: 400 })
    }
    patch.question_text = body.question_text
  }

  // options: array of >= 4 non-empty strings
  if (body.options !== undefined) {
    const options = body.options
    if (
      !Array.isArray(options) ||
      options.length < MIN_OPTIONS ||
      !options.every(o => typeof o === 'string' && o.trim() !== '')
    ) {
      return NextResponse.json(
        { error: `options must be an array of at least ${MIN_OPTIONS} non-empty strings` },
        { status: 400 },
      )
    }
    patch.options = options
  }

  // correct_index: integer, 0..min(options.length - 1, 3)
  if (body.correct_index !== undefined) {
    const ci = body.correct_index
    if (typeof ci !== 'number' || !Number.isInteger(ci) || ci < 0 || ci > MAX_CORRECT_INDEX) {
      return NextResponse.json(
        { error: `correct_index must be an integer between 0 and ${MAX_CORRECT_INDEX}` },
        { status: 400 },
      )
    }
    patch.correct_index = ci
  }

  // explanation: string
  if (body.explanation !== undefined) {
    if (typeof body.explanation !== 'string') {
      return NextResponse.json({ error: 'explanation must be a string' }, { status: 400 })
    }
    patch.explanation = body.explanation
  }

  // status: published | draft
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !QUESTION_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "status must be 'published' or 'draft'" }, { status: 400 })
    }
    patch.status = body.status
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  // Bounds check: correct_index must point inside the effective options array.
  if (patch.correct_index !== undefined) {
    let optionsLength: number
    if (patch.options !== undefined) {
      optionsLength = (patch.options as string[]).length
    } else {
      // Fetch the current row to validate against existing options
      const { data: current, error: fetchError } = await supabase
        .from('upcat_questions')
        .select('options')
        .eq('question_id', id)
        .single()
      if (fetchError || !current) {
        return NextResponse.json({ error: 'Question not found' }, { status: 404 })
      }
      optionsLength = Array.isArray(current.options) ? current.options.length : 0
    }
    if ((patch.correct_index as number) >= optionsLength) {
      return NextResponse.json(
        { error: 'correct_index is out of bounds of the options array' },
        { status: 400 },
      )
    }
  }
  // Note: an options-only patch can never orphan correct_index — options must
  // have >= 4 entries and the DB CHECK caps correct_index at 0..3.

  patch.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('upcat_questions')
    .update(patch)
    .eq('question_id', id)

  if (error) {
    console.error('[upcat-questions/[id] PATCH] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/upcat-questions/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params

  const { error } = await supabase
    .from('upcat_questions')
    .delete()
    .eq('question_id', id)

  if (error) {
    console.error('[upcat-questions/[id] DELETE] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
