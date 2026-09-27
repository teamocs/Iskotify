import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { suggestMapping } from '@/lib/kb/fileMapping'
import { DRIVE_FILE_ID } from '@/lib/kb/fileRules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// An AI-proposed mapping to prefill the dialog. Nothing is saved: the admin
// reviews it and saves through POST /api/kb/mapping.
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error
  let body: { driveFileId?: unknown } | null = null
  try { body = await req.json() } catch { /* handled below */ }
  const driveFileId = typeof body?.driveFileId === 'string' ? body.driveFileId : ''
  if (!DRIVE_FILE_ID.test(driveFileId)) return NextResponse.json({ error: 'driveFileId is required' }, { status: 400 })
  try {
    const suggestion = await suggestMapping(gate.supabase!, driveFileId)
    if (!suggestion) {
      return NextResponse.json({ error: 'AI couldn’t map this file. Pick the columns yourself.' }, { status: 422 })
    }
    return NextResponse.json({ suggestion })
  } catch (err) {
    console.error('[kb/mapping/suggest] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI mapping failed' }, { status: 500 })
  }
}
