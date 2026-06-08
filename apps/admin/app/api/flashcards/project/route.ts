import { NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

export const runtime = 'nodejs'

// Projects published Question Bank rows (upcat_questions) into the flashcard_*
// tables via the project_question_bank_to_flashcards() SQL function, so the mobile
// topic/deck/listing quiz engine surfaces the same content as the UPCAT mock exams.
// Admin-gated; uses the service-role client so the SECURITY DEFINER function runs.
export async function POST() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase.rpc('project_question_bank_to_flashcards')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? {})
}
