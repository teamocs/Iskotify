import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { BUG_SCREENSHOT_BUCKET, SIGNED_URL_TTL_SEC, bugScreenshotPath } from '@/lib/admin/bugScreenshot'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/admin/app-reports/[id]/screenshot → { url, expiresIn }
// ADMIN-ONLY (401 signed out, 403 non-admin). Looks the screenshot up by report
// id (a caller can't name an arbitrary object) and returns a short-lived signed
// URL for it from the private bucket. The service-role key stays on the server;
// only the signed link is sent back.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const { id } = await params

  const { data: report, error } = await supabase
    .from('app_bug_reports')
    .select('image_url')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[admin/app-reports screenshot] lookup error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500, headers: NO_STORE })
  }

  const path = bugScreenshotPath((report as { image_url?: string | null } | null)?.image_url)
  if (!path) return NextResponse.json({ error: 'No screenshot' }, { status: 404, headers: NO_STORE })

  const { data: signed, error: signError } = await supabase.storage
    .from(BUG_SCREENSHOT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC)
  if (signError || !signed?.signedUrl) {
    console.error('[admin/app-reports screenshot] sign error:', signError)
    return NextResponse.json({ error: 'Could not open screenshot' }, { status: 500, headers: NO_STORE })
  }

  return NextResponse.json({ url: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SEC }, { headers: NO_STORE })
}
