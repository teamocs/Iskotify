import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'

export const runtime = 'nodejs'

// Moderation API for user-submitted listing key-date corrections.
// Rows live in public.listing_date_contributions (status pending/approved/rejected).
// ADMIN-ONLY: the middleware only checks a session EXISTS, so every handler here
// MUST call requireAdmin() to enforce the role — otherwise any signed-in app user
// could approve corrections and rewrite live listing dates.

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const CONTRIB_STATUSES = new Set(['pending', 'approved', 'rejected'])

// Field-injection guard: a user-submitted `field` may ONLY map to one of these
// three real listings columns. We NEVER interpolate `field` into a column name;
// the listings UPDATE is built from this fixed mapping. Anything not a key here
// is rejected before any write.
const FIELD_COLUMN = {
  exam_date: 'exam_date',
  deadline: 'deadline',
  results_date: 'results_date',
} as const
type ContribField = keyof typeof FIELD_COLUMN

interface ContributionRow {
  id: string
  listing_slug: string
  user_id: string | null
  field: string
  suggested_date: string | null
  note: string | null
  source_url: string | null
  status: string
  created_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
}

// GET /api/admin/date-contributions?status=&page=&limit=
// Lists contributions (default status=pending), newest first, paginated.
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const supabase = gate.supabase

  const url = new URL(req.url)
  const status = (url.searchParams.get('status')?.trim() || 'pending')
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10) || 0)
  const rawLimit = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit))

  if (!CONTRIB_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
  }

  const from = page * limit
  const to = from + limit - 1

  // Unique tiebreaker (.order('id')) so paginated ranges are deterministic when
  // many rows share the same created_at (audit finding).
  const { data, error, count } = await supabase
    .from('listing_date_contributions')
    .select('*', { count: 'exact', head: false })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to)

  if (error) {
    console.error('[admin/date-contributions GET] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const rows = (data ?? []) as ContributionRow[]

  // Best-effort listing-title lookup so the UI can show a human label per slug.
  // Non-fatal: on any error we fall back to slugs only.
  const titles: Record<string, string> = {}
  const slugs = Array.from(new Set(rows.map((r) => r.listing_slug).filter(Boolean)))
  if (slugs.length > 0) {
    const { data: listingData, error: listingError } = await supabase
      .from('listings')
      .select('slug,title')
      .in('slug', slugs)
    if (listingError) {
      console.error('[admin/date-contributions GET] listing title lookup error:', listingError)
    } else {
      for (const l of (listingData ?? []) as { slug: string; title: string | null }[]) {
        if (l.slug && l.title) titles[l.slug] = l.title
      }
    }
  }

  const rowsWithTitle = rows.map((r) => ({ ...r, listing_title: titles[r.listing_slug] ?? null }))

  return NextResponse.json({ rows: rowsWithTitle, count: count ?? 0 })
}

// POST /api/admin/date-contributions
// Body: { id: string, action: 'approve' | 'reject' }
// approve → write listings.<field> = suggested_date WHERE slug, then mark approved
// reject  → mark rejected
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const supabase = gate.supabase

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const b = (body ?? {}) as Record<string, unknown>
  const id = typeof b.id === 'string' ? b.id.trim() : ''
  const action = b.action

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  // Load the contribution row.
  const { data: row, error: rowError } = await supabase
    .from('listing_date_contributions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (rowError) {
    console.error('[admin/date-contributions POST] row lookup error:', rowError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'Contribution not found' }, { status: 404 })
  }

  const contribution = row as ContributionRow
  const now = new Date().toISOString()

  if (action === 'approve') {
    // Validate the field against the fixed allow-list BEFORE any write, then
    // resolve the target column from the mapping (never from the raw string).
    if (!(contribution.field in FIELD_COLUMN)) {
      return NextResponse.json({ error: 'Unsupported field for this contribution' }, { status: 400 })
    }
    const column = FIELD_COLUMN[contribution.field as ContribField]

    // Apply the corrected date to the listing. .select('id') returns the updated
    // rows so we can detect a slug that matched nothing → 404.
    const { data: updated, error: updateError } = await supabase
      .from('listings')
      .update({ [column]: contribution.suggested_date })
      .eq('slug', contribution.listing_slug)
      .select('id')

    if (updateError) {
      console.error('[admin/date-contributions POST] listings update error:', updateError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Listing not found for this contribution' }, { status: 404 })
    }

    const { error: markError } = await supabase
      .from('listing_date_contributions')
      .update({ status: 'approved', reviewed_at: now })
      .eq('id', id)

    if (markError) {
      console.error('[admin/date-contributions POST] mark approved error:', markError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  // action === 'reject'
  const { error: rejectError } = await supabase
    .from('listing_date_contributions')
    .update({ status: 'rejected', reviewed_at: now })
    .eq('id', id)

  if (rejectError) {
    console.error('[admin/date-contributions POST] mark rejected error:', rejectError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
