import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { serviceAccountEmail } from '@/lib/google/serviceAccount'
import { isUuid } from '@/lib/isUuid'
import { isDriveContentType, parseDriveFolderInput, CONTENT_TYPE_LABEL, type DriveSourceRow } from '@/lib/driveSources/sources'

export const runtime = 'nodejs'

// The Drive folders the sync reads (drive_sources, migration 068). Admin-only;
// the table is service-role only. The service account's email is returned so
// the console can say who to share a folder with — never the key itself.

const COLUMNS = 'id, content_type, folder_id, label, enabled, created_at, updated_at'
const MAX_LABEL = 80

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function dbFailure(where: string, err: { message?: string } | null) {
  console.error(`[admin/drive-sources ${where}] failed:`, err)
  return NextResponse.json({ error: err?.message ?? 'Database error' }, { status: 500 })
}

/** undefined = not given; null = invalid; '' clears it. */
function parseLabel(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length > MAX_LABEL ? null : s
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error
  const { data, error } = await gate.supabase!.from('drive_sources').select(COLUMNS).order('created_at')
  if (error) return dbFailure('GET', error)
  return NextResponse.json({ sources: (data ?? []) as DriveSourceRow[], serviceAccountEmail: serviceAccountEmail() })
}

// Add a folder: { folder: link or id, contentType, label? }.
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const body = await readBody(req)
  const folderId = typeof body?.folder === 'string' ? parseDriveFolderInput(body.folder) : null
  if (!folderId) return bad('Paste a Google Drive folder link (drive.google.com/drive/folders/…) or a folder id.')
  if (!isDriveContentType(body?.contentType)) return bad('Choose what the folder holds: questions, listings or announcements.')
  const label = parseLabel(body?.label)
  if (label === null) return bad(`Keep the name under ${MAX_LABEL} characters.`)

  const { data, error } = await gate.supabase!
    .from('drive_sources')
    .insert({ folder_id: folderId, content_type: body.contentType, label: label || null, enabled: true })
    .select(COLUMNS)
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return bad(`That folder is already a ${CONTENT_TYPE_LABEL[body.contentType].toLowerCase()} source.`, 409)
    }
    return dbFailure('POST', error)
  }
  revalidatePath('/admin/sync')
  return NextResponse.json(data, { status: 201 })
}

// Enable/disable or rename: { id, enabled?, label? }.
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const body = await readBody(req)
  const id = body?.id
  if (!isUuid(id)) return bad('A valid source id is required.')
  const patch: { enabled?: boolean; label?: string | null } = {}
  if (body!.enabled !== undefined) {
    if (typeof body!.enabled !== 'boolean') return bad('enabled must be true or false.')
    patch.enabled = body!.enabled
  }
  const label = parseLabel(body!.label)
  if (label === null) return bad(`Keep the name under ${MAX_LABEL} characters.`)
  if (label !== undefined) patch.label = label || null
  if (Object.keys(patch).length === 0) return bad('Nothing to change.')

  const { data, error } = await gate.supabase!.from('drive_sources').update(patch).eq('id', id).select(COLUMNS).maybeSingle()
  if (error) return dbFailure('PATCH', error)
  if (!data) return bad('Drive source not found.', 404)
  revalidatePath('/admin/sync')
  return NextResponse.json(data)
}

// Remove: ?id=<uuid>. Files already synced from it keep their previews/history.
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!isUuid(id)) return bad('A valid source id is required.')
  const { data, error } = await gate.supabase!.from('drive_sources').delete().eq('id', id).select('id')
  if (error) return dbFailure('DELETE', error)
  if (!data || (data as unknown[]).length === 0) return bad('Drive source not found.', 404)
  revalidatePath('/admin/sync')
  return NextResponse.json({ ok: true })
}
