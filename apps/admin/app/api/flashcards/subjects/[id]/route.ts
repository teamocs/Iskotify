import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcard_subjects')
    .select('id, name')
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
  if (!Array.isArray(listing_slugs)) {
    return NextResponse.json({ error: 'listing_slugs must be an array' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcard_subjects')
    .update({ name: name.trim(), listing_slugs })
    .eq('id', id)
    .select('id, name, listing_slugs')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
