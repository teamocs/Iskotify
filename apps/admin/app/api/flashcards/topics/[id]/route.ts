import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcard_topics')
    .select('id, name, status, subject_id, flashcard_subjects:flashcard_subjects!subject_id (id, name)')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Flatten the nested subject for the client.
  const subject = (data as any).flashcard_subjects
  return NextResponse.json({
    id: data.id,
    name: data.name,
    status: data.status,
    subject_id: data.subject_id,
    subject_name: subject?.name ?? 'Unknown',
  })
}
