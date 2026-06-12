import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error
    const { supabase } = gate

    const body = await req.json()
    const { subject_id, name, status } = body as {
      subject_id?: string
      name?: string
      status?: string
    }

    if (!subject_id || subject_id.trim() === '') {
      return NextResponse.json({ error: 'subject_id is required' }, { status: 400 })
    }
    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (status && status !== 'published' && status !== 'draft') {
      return NextResponse.json({ error: 'status must be "published" or "draft"' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('flashcard_topics')
      .insert({ subject_id: subject_id.trim(), name: name.trim(), status: status ?? 'published' })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[topics/POST] insert error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  } catch (err) {
    console.error('[topics/POST] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
