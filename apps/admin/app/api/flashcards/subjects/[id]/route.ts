import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params
  const { data, error } = await supabase
    .from('flashcard_subjects')
    .select('id, name, listing_slugs')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { name, listing_slugs } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!Array.isArray(listing_slugs) || listing_slugs.some((s: unknown) => typeof s !== 'string')) {
    return NextResponse.json({ error: 'listing_slugs must be an array of strings' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('flashcard_subjects')
    .update({ name: name.trim(), listing_slugs })
    .eq('id', id)
    .select('id, name, listing_slugs')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  revalidateTag('listings')
  revalidateTag(`subject-cards:${id}`)
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params
  const { data, error } = await supabase
    .from('flashcard_subjects')
    .delete()
    .eq('id', id)
    .select('id')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // 23503 = foreign_key_violation — practice_sessions.topic_id RESTRICTs the cascade
    // delete of this subject's topics once students have practice history on them.
    if (error.code === '23503') {
      return NextResponse.json(
        {
          error: "Cannot delete: students have practice history on this subject's topics. Archive it instead (unpublish its topics) rather than deleting.",
          detail: error.message,
        },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  revalidateTag(`subject-cards:${id}`)
  revalidateTag('drafts')
  return new NextResponse(null, { status: 204 })
}
