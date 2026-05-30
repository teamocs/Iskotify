import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerClient } from '@iskotify/utils'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const supabase = createServerClient()

    // Whitelist: only card content fields may be updated via this endpoint
    const { question, answer, explanation } = body as {
      question?: string
      answer?: string
      explanation?: string
    }

    const patch: Record<string, unknown> = {}
    if (question    !== undefined) patch.question    = question
    if (answer      !== undefined) patch.answer      = answer
    if (explanation !== undefined) patch.explanation = explanation

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
    }

    if (typeof question === 'string' && question.trim() === '') {
      return NextResponse.json({ error: 'Question cannot be empty' }, { status: 400 })
    }
    if (typeof answer === 'string' && answer.trim() === '') {
      return NextResponse.json({ error: 'Answer cannot be empty' }, { status: 400 })
    }

    const { error } = await supabase
      .from('flashcards')
      .update(patch)
      .eq('id', id)

    if (error) {
      console.error('[cards] update error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    revalidateTag('subject-cards')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cards] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()

    const { error } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[cards] delete error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    revalidateTag('subject-cards')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cards] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
