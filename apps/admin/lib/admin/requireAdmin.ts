import { NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

// Server-side admin gate for API routes: 401 if no session, 403 if not an admin.
// On success returns the service-role client. Mirrors the inline gate in
// app/api/admin/data/[table]/route.ts (kept there to avoid disturbing its test).
// NOTE: the middleware only verifies a session EXISTS — any signed-in app user
// passes it. Every mutating admin route MUST call this to enforce the role.
export async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  let supabase: ReturnType<typeof createServerClient>
  try {
    supabase = createServerClient()
  } catch (err) {
    console.error('[requireAdmin] server client init failed:', err)
    return { error: NextResponse.json({ error: 'Server not configured' }, { status: 500 }) }
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

/** Boolean admin check for server actions (which can't return a NextResponse). */
export async function isAdminSession(): Promise<boolean> {
  const gate = await requireAdmin()
  return !('error' in gate && gate.error)
}
