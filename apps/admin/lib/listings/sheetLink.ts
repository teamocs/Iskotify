/**
 * Parses a pasted Google Sheets link (or a bare id) into the sheet id and an
 * optional tab (gid). We never fetch the pasted URL itself — only URLs we
 * build from the validated id (see readSheet.ts) — so this doubles as the
 * SSRF guard: only docs.google.com is accepted, and the id must look like a
 * real Google Drive file id.
 */

const ID_RE = /^[A-Za-z0-9_-]{25,}$/

export interface SheetLink {
  sheetId: string
  gid?: string
}

function extractGid(raw: string): string | undefined {
  // gid can arrive as a query param (?gid=123) or a hash fragment (#gid=123).
  const hashMatch = raw.match(/[#&]gid=(\d+)/)
  if (hashMatch) return hashMatch[1]
  try {
    // Digits only: the gid is spliced into the export URL we build.
    const gid = new URL(raw).searchParams.get('gid')
    return gid && /^\d+$/.test(gid) ? gid : undefined
  } catch {
    return undefined
  }
}

export function parseSheetLink(input: string): SheetLink | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Bare id (no scheme, no slashes) — accept directly.
  if (ID_RE.test(trimmed)) return { sheetId: trimmed }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.hostname !== 'docs.google.com') return null

  const match = url.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)
  if (!match) return null
  const sheetId = match[1]
  if (!sheetId || !ID_RE.test(sheetId)) return null

  return { sheetId, gid: extractGid(trimmed) }
}
