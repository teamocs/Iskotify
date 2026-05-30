import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerClient } from '@iskotify/utils'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const db = createServerClient()
    const { error } = await db
      .from('listings')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      console.error('[admin/listings PATCH] supabase error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    revalidateTag('listings')
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[admin/listings PATCH] unexpected:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = createServerClient()
    const { error } = await db.from('listings').delete().eq('id', id)
    if (error) {
      console.error('[admin/listings DELETE] supabase error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    revalidateTag('listings')
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[admin/listings DELETE] unexpected:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
