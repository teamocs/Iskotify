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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params
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
