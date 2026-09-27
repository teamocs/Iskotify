import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { previewKbFile, type PreviewFilter } from '@/lib/kb/previewKbFile'
import { DRIVE_FILE_ID } from '@/lib/kb/fileRules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILTERS: PreviewFilter[] = ['all', 'ready', 'held']

// The draft questions one Drive file imported, for the Preview drawer.
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const q = req.nextUrl.searchParams
  const driveFileId = q.get('driveFileId') ?? ''
  if (!DRIVE_FILE_ID.test(driveFileId)) return NextResponse.json({ error: 'driveFileId is required' }, { status: 400 })
  const filter = (FILTERS as string[]).includes(q.get('filter') ?? '') ? (q.get('filter') as PreviewFilter) : 'all'
  const offset = Number.parseInt(q.get('offset') ?? '0', 10) || 0
  const limit = Number.parseInt(q.get('limit') ?? '25', 10) || 25

  try {
    return NextResponse.json(await previewKbFile(gate.supabase!, driveFileId, { filter, offset, limit }))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed'
    const status = /not found/i.test(message) ? 404 : 500
    if (status === 500) console.error('[kb/preview] failed:', err)
    return NextResponse.json({ error: message }, { status })
  }
}
