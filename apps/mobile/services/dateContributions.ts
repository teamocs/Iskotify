import { supabase } from './supabase'

// ── Listing key-date corrections (user → Supabase) ────────────────────────────
// Signed-in users can suggest a correction to an exam/scholarship listing's key
// dates (exam date, application deadline, results date). Rows land in
// public.listing_date_contributions as status='pending' and are triaged in the
// admin console. RLS allows an authenticated INSERT only when auth.uid() =
// user_id; a partial UNIQUE index blocks a 2nd pending row for the same
// (user_id, listing_slug, field) → Postgres error code '23505'. This helper
// NEVER throws — it always resolves a discriminated result the UI can render.

export type ContribField = 'exam_date' | 'deadline' | 'results_date'

export interface DateContributionInput {
  listingSlug: string
  field: ContribField
  /** ISO calendar date, 'YYYY-MM-DD'. */
  date: string
  note?: string
  sourceUrl?: string
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string; needsAuth?: boolean }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * True only for a syntactically valid AND real calendar date. Round-trips the
 * parts through a UTC Date so rollovers (2026-02-30 → Mar 2, month 13, day 00)
 * are rejected rather than silently normalized.
 */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  // Fixed positions are safe now that the YYYY-MM-DD shape is confirmed.
  const y = Number(value.slice(0, 4))
  const m = Number(value.slice(5, 7))
  const d = Number(value.slice(8, 10))
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Submit one key-date correction. Validates the date locally, requires a
 * signed-in user, then inserts to Supabase. Never throws — maps every failure
 * mode to a friendly result:
 *   - bad date        → { ok:false, error:'Enter a valid date' }
 *   - signed out      → { ok:false, needsAuth:true, error:'Please sign in…' }
 *   - duplicate (23505) → { ok:false, error:"…already suggested…pending review." }
 *   - anything else   → { ok:false, error:'Could not submit — please try again.' }
 */
export async function submitDateContribution(input: DateContributionInput): Promise<SubmitResult> {
  const { listingSlug, field, date, note, sourceUrl } = input

  if (!isRealDate(date)) {
    return { ok: false, error: 'Enter a valid date' }
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false, needsAuth: true, error: 'Please sign in to suggest a correction.' }
    }

    const { error } = await supabase.from('listing_date_contributions').insert({
      listing_slug: listingSlug,
      user_id: user.id,
      field,
      suggested_date: date,
      note: note || null,
      source_url: sourceUrl || null,
    })

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return { ok: false, error: "You've already suggested a date for this — it's pending review." }
      }
      return { ok: false, error: 'Could not submit — please try again.' }
    }

    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not submit — please try again.' }
  }
}
