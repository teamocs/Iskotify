import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { publishKbFile } from '@/lib/kb/publishKbFile'

export const runtime = 'nodejs'
export const maxDuration = 60

// Publishes the reviewed drafts of one Drive file (see lib/kb/publishKbFile.ts).
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  let body: { driveFileId?: unknown } | null = null
  try { body = await req.json() } catch { /* handled below */ }
  const driveFileId = typeof body?.driveFileId === 'string' ? body.driveFileId.trim() : ''
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(driveFileId)) {
    return NextResponse.json({ error: 'driveFileId is required' }, { status: 400 })
  }

  try {
    return NextResponse.json(await publishKbFile(gate.supabase!, driveFileId))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed'
    const status = /not found/i.test(message) ? 404 : 500
    if (status === 500) console.error('[kb/publish] failed:', err)
    return NextResponse.json({ error: message }, { status })
  }
}
