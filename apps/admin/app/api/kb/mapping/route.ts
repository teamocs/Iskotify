import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { clearMapping, loadMappingContext, saveMapping } from '@/lib/kb/fileMapping'
import { DRIVE_FILE_ID } from '@/lib/kb/fileRules'
import { driveResync } from '@/lib/kb/resyncFile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // saving re-syncs the file

function fail(err: unknown, what: string) {
  console.error(`[kb/mapping] ${what} failed:`, err)
  return NextResponse.json({ error: err instanceof Error ? err.message : `${what} failed` }, { status: 500 })
}

// What the mapping dialog needs: the file's headers, sample rows and saved mapping.
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error
  const driveFileId = req.nextUrl.searchParams.get('driveFileId') ?? ''
  if (!DRIVE_FILE_ID.test(driveFileId)) return NextResponse.json({ error: 'driveFileId is required' }, { status: 400 })
  try {
    const ctx = await loadMappingContext(gate.supabase!, driveFileId)
    if (!ctx) return NextResponse.json({ error: 'This file is not in the sync ledger.' }, { status: 404 })
    return NextResponse.json(ctx)
  } catch (err) {
    return fail(err, 'Loading the mapping')
  }
}

// Save an admin's mapping and re-sync the file into Preview.
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error
  let body: { driveFileId?: unknown; subtest?: unknown; skillCategory?: unknown; columns?: unknown } | null = null
  try { body = await req.json() } catch { /* handled below */ }
  const driveFileId = typeof body?.driveFileId === 'string' ? body.driveFileId : ''
  if (!DRIVE_FILE_ID.test(driveFileId)) return NextResponse.json({ error: 'driveFileId is required' }, { status: 400 })
  try {
    const db = gate.supabase!
    const out = await saveMapping(db, driveFileId, body, driveResync(db))
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status })
    return NextResponse.json({ mapping: out.mapping, summary: out.summary })
  } catch (err) {
    return fail(err, 'Saving the mapping')
  }
}

// Forget the saved mapping (the file-name rule, or AI, decides again) and re-sync.
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error
  const driveFileId = req.nextUrl.searchParams.get('driveFileId') ?? ''
  if (!DRIVE_FILE_ID.test(driveFileId)) return NextResponse.json({ error: 'driveFileId is required' }, { status: 400 })
  try {
    const db = gate.supabase!
    return NextResponse.json({ summary: await clearMapping(db, driveFileId, driveResync(db)) })
  } catch (err) {
    return fail(err, 'Clearing the mapping')
  }
}
