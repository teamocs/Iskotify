'use server'

import { headers } from 'next/headers'
import { revalidatePath, revalidateTag } from 'next/cache'

export async function triggerSync(): Promise<{ synced?: number; skipped?: number; closed?: number; error?: string }> {
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
