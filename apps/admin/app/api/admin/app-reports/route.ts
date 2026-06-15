import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const REPORT_STATUSES = new Set(['new', 'reviewed', 'resolved'])

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

// GET /api/admin/app-reports?status=&q=&page=&limit=
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const url = new URL(req.url)
  const status = url.searchParams.get('status')?.trim() ?? ''
  const q = url.searchParams.get('q')?.trim() ?? ''
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10) || 0)
  const rawLimit = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit))

  if (status && !REPORT_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
  }

  let query = supabase
    .from('app_bug_reports')
    .select('*', { count: 'exact', head: false })

  if (status) {
    query = query.eq('status', status)
  }

  // Sanitize search: strip structural chars used in Supabase .or() DSL
  const safe = q.replace(/[(),.*:\\%]/g, ' ').trim()
  if (safe) {
    query = query.or(`screen.ilike.%${safe}%,description.ilike.%${safe}%`)
  }

  const from = page * limit
  const to = from + limit - 1
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[admin/app-reports GET] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ rows: data ?? [], count: count ?? 0 })
}
