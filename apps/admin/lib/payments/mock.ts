import { randomBytes } from 'crypto'
import type { createServerClient } from '@iskotify/utils'

// The mock checkout: lets staff walk the whole purchase flow on the web without a
// payment gateway. Only accounts with profiles.role = 'admin' (which students cannot
// edit, migration 066), only for their own account, and only while real payments are
// off: PAYMENTS_ENABLED=true closes it.

type Db = ReturnType<typeof createServerClient>

export const MOCK_REFERENCE = /^ISK-MOCK-[a-z0-9-]{8,60}$/

export const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === 'true'

export function newMockReference(): string {
  return `ISK-MOCK-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`
}

/** Throws on a database error (the caller answers 500). */
export async function isMockTester(db: Db, uid: string): Promise<boolean> {
  if (paymentsEnabled()) return false
  const { data, error } = await db.from('profiles').select('role').eq('id', uid).maybeSingle()
  if (error) throw new Error(`profile lookup failed: ${error.message}`)
  return (data as { role?: string } | null)?.role === 'admin'
}
