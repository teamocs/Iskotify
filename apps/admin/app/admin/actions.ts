'use server'

import { headers } from 'next/headers'
import { revalidatePath, revalidateTag } from 'next/cache'
import { isAdminSession } from '@/lib/admin/requireAdmin'

export async function triggerSync(): Promise<{ synced?: number; skipped?: number; closed?: number; error?: string }> {
  // Middleware only checks a session exists — enforce the admin role here so a
  // non-admin session can't trigger (or spam) full sheet re-syncs.
  if (!(await isAdminSession())) return { error: 'Unauthorized' }

  const secret = process.env.SYNC_SECRET
  if (!secret) return { error: 'SYNC_SECRET not configured' }

  const headersList = await headers()
  const host = headersList.get('host') ?? 'localhost:3000'
  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'

  try {
    const res = await fetch(`${proto}://${host}/api/sheets/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` }
    })
    const body = await res.json()
    if (!res.ok) return { error: body.error ?? 'Sync failed' }
    revalidatePath('/admin/listings')
    revalidateTag('listings')
    return body
  } catch (err) {
    return { error: 'Network error — could not reach sync route' }
  }
}
