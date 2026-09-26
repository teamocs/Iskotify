// Bug-report screenshots live in the PRIVATE 'app-bug-reports' storage bucket
// (migration 062). The app stores the object path in app_bug_reports.image_url;
// rows filed before that change hold a full public URL. Staff view a screenshot
// through a short-lived signed URL made server-side by
// app/api/admin/app-reports/[id]/screenshot, never through a public link.

export const BUG_SCREENSHOT_BUCKET = 'app-bug-reports'

/** Signed-URL lifetime: long enough to look, short enough not to leak (10 min). */
export const SIGNED_URL_TTL_SEC = 600

const PUBLIC_URL_MARKER = `/storage/v1/object/public/${BUG_SCREENSHOT_BUCKET}/`

/**
 * The object path inside the bug-report bucket for a stored image_url, or null
 * when there is none or it points anywhere else. Accepts a bare path (new rows)
 * or an old public URL (extracts the part after the bucket name, decoded, minus
 * any query string). Rejects "..", so a stored value can't reach other objects.
 */
export function bugScreenshotPath(imageUrl: string | null | undefined): string | null {
  const value = imageUrl?.trim()
  if (!value) return null

  let path: string
  if (/^https?:\/\//i.test(value)) {
    let url: URL
    try { url = new URL(value) } catch { return null }
    const at = url.pathname.indexOf(PUBLIC_URL_MARKER)
    if (at === -1) return null
    try { path = decodeURIComponent(url.pathname.slice(at + PUBLIC_URL_MARKER.length)) } catch { return null }
  } else {
    path = value
  }

  path = path.replace(/^\/+/, '')
  if (!path || path.split('/').some(seg => seg === '..' || seg === '.')) return null
  return path
}
