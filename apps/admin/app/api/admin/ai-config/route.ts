import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { AI_CONFIG_DEFAULTS } from '@/lib/aiConfigDefaults'

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

// GET: return the current config row + the builtin defaults (so the admin UI
// can show placeholder text = the builtin each override replaces).
export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase
    .from('ai_chat_config')
    .select('*')
    .eq('id', 1)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = row not found; that's fine — seed row may not exist yet
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    config: data ?? null,
    defaults: AI_CONFIG_DEFAULTS,
  })
}

// PUT: upsert the single config row (id=1).
// Accepts a partial body — only provided fields are updated (merged server-side).
export async function PUT(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = await req.json()

  // Build the upsert payload — only known fields are forwarded to Supabase.
  const payload: Record<string, unknown> = { id: 1 }

  const textFields = [
    'core_rules_override', 'scope_block_override', 'grounding_rule_override',
    'anti_injection_override', 'progress_addendum_override',
    'topic_addendum_override', 'math_addendum_override',
  ] as const
  for (const f of textFields) {
    if (f in body) payload[f] = typeof body[f] === 'string' ? body[f] : ''
  }

  if ('rag_total_token_budget' in body) {
    payload.rag_total_token_budget = Number(body.rag_total_token_budget) || 0
  }
  if ('rag_per_block_char_cap' in body) {
    payload.rag_per_block_char_cap = Number(body.rag_per_block_char_cap) || 0
  }
  if ('rag_blocks_enabled' in body && typeof body.rag_blocks_enabled === 'object') {
    payload.rag_blocks_enabled = body.rag_blocks_enabled
  }
  if ('chat_enabled' in body) {
    payload.chat_enabled = body.chat_enabled === true
  }

  const { error } = await supabase
    .from('ai_chat_config')
    .upsert(payload, { onConflict: 'id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
