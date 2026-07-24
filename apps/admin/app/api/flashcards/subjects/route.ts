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

    const body = await req.json().catch(() => ({}))
    const { name, listing_slugs } = body as { name?: string; listing_slugs?: unknown }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (listing_slugs !== undefined && (!Array.isArray(listing_slugs) || listing_slugs.some((s: unknown) => typeof s !== 'string'))) {
      return NextResponse.json({ error: 'listing_slugs must be an array of strings' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('flashcard_subjects')
      .insert({ name: name.trim(), listing_slugs: (listing_slugs as string[] | undefined) ?? [] })
      .select('id, name, listing_slugs')
      .single()

    if (error) {
      // 23505 = unique_violation — flashcard_subjects.name is UNIQUE NOT NULL.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A subject with this name already exists.' }, { status: 409 })
      }
      console.error('[subjects/POST] insert error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Database error' }, { status: 500 })

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[subjects/POST] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
