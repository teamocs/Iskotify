import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerClient } from '@iskotify/utils'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
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
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { name, listing_slugs } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!Array.isArray(listing_slugs) || listing_slugs.some((s: unknown) => typeof s !== 'string')) {
    return NextResponse.json({ error: 'listing_slugs must be an array of strings' }, { status: 400 })
  }

  const supabase = createServerClient()
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
  const { id } = await params
  const supabase = createServerClient()
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
    // 23503 = foreign_key_violation — surface a useful message instead of generic 500.
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'Cannot delete: this subject is still referenced by other records.', detail: error.message },
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
