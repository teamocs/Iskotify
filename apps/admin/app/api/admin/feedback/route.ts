import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { listStatusQueue } from '@/lib/admin/statusQueueList'
import { FEEDBACK_QUEUE } from '@/lib/admin/queueSpecs'

export const runtime = 'nodejs'

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

// GET /api/admin/feedback?q=&status=&sort=&dir=asc|desc&page=&limit= (+ queue filters; see lib/admin/queueSpecs.ts)
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  return listStatusQueue(gate.supabase, FEEDBACK_QUEUE, new URL(req.url).searchParams, '[admin/feedback GET]')
}
