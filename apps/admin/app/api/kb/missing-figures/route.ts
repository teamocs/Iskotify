import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import type { MissingFigure } from '@/lib/kb/syncDriveFolder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// One CSV per Drive file listing every question whose figure the sync could
// not find, so the content author knows exactly which images to upload (and
// where: the path is relative to the CSV's own folder).

function csvCell(value: string): string {
  // Neutralise spreadsheet formula injection, then quote when needed.
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const driveFileId = new URL(req.url).searchParams.get('driveFileId') ?? ''
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(driveFileId)) {
    return NextResponse.json({ error: 'driveFileId is required' }, { status: 400 })
  }

  const { data, error } = await gate.supabase!
    .from('kb_drive_files')
    .select('name, missing_figures')
    .eq('drive_file_id', driveFileId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const file = (data ?? [])[0] as { name: string; missing_figures: MissingFigure[] | null } | undefined
  if (!file) return NextResponse.json({ error: 'File not found in the sync ledger' }, { status: 404 })

  const lines = [
    'question_id,file,caption',
    ...(file.missing_figures ?? []).map(m => [m.question_id, m.file, m.caption].map(csvCell).join(',')),
  ]
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]+/g, '-')
  return new NextResponse(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${base}-missing-figures.csv"`,
    },
  })
}
