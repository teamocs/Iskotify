/**
 * Status triage shared by the three inbox queues (reported questions, bug
 * reports, feedback). Each has the same `new → reviewed → resolved` status and
 * the same per-item PATCH route; bulk changes reuse that route once per id.
 */

export type ReviewStatus = 'new' | 'reviewed' | 'resolved'

export const REVIEW_STATUSES: ReviewStatus[] = ['new', 'reviewed', 'resolved']

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  resolved: 'Resolved',
}

export interface BulkOutcome {
  status: ReviewStatus
  ok: string[]
  failed: string[]
}

/** PATCH `${baseUrl}/${id}` with `{ status }` for every id, in parallel. Never throws. */
export async function patchStatuses(
  baseUrl: string,
  ids: string[],
  status: ReviewStatus,
  fetcher: typeof fetch = fetch,
): Promise<BulkOutcome> {
  const results = await Promise.all(ids.map(async id => {
    try {
      const res = await fetcher(`${baseUrl}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      return res.ok
    } catch {
      return false
    }
  }))
  return {
    status,
    ok: ids.filter((_, i) => results[i]),
    failed: ids.filter((_, i) => !results[i]),
  }
}

const count = (n: number, noun: { one: string; many: string }) => `${n} ${n === 1 ? noun.one : noun.many}`

/** The one summary toast for a bulk change: success, partial failure, or total failure. */
export function bulkMessage(outcome: BulkOutcome, noun: { one: string; many: string }): { ok: boolean; message: string } {
  const { status, ok, failed } = outcome
  if (failed.length === 0) return { ok: true, message: `Marked ${count(ok.length, noun)} ${status}` }
  if (ok.length === 0) {
    return { ok: false, message: `Couldn’t mark ${count(failed.length, noun)} ${status}. ${failed.length === 1 ? 'It is' : 'They are'} still selected; try again.` }
  }
  return {
    ok: false,
    message: `Marked ${count(ok.length, noun)} ${status}, but ${count(failed.length, noun)} failed. ${failed.length === 1 ? 'It is' : 'They are'} still selected; try again.`,
  }
}

export type PagedResult<T> = { ok: true; rows: T[]; count: number } | { ok: false; error: string }

/**
 * Read a whole queue from a paged list endpoint (`?page=&limit=` → `{ rows, count }`),
 * so search, filters and sort can run over every row. Stops at `maxPages` as a safety cap.
 */
export async function fetchAllPages<T>(
  listUrl: string,
  fetcher: typeof fetch = fetch,
  limit = 200,
  maxPages = 25,
): Promise<PagedResult<T>> {
  const rows: T[] = []
  let total = 0
  try {
    for (let page = 0; page < maxPages; page++) {
      const res = await fetcher(`${listUrl}?page=${page}&limit=${limit}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false, error: body.error ?? 'Failed to load' }
      }
      const body = await res.json()
      const batch: T[] = body.rows ?? []
      total = body.count ?? 0
      rows.push(...batch)
      if (batch.length < limit || rows.length >= total) break
    }
  } catch {
    return { ok: false, error: 'Network error' }
  }
  return { ok: true, rows, count: total }
}
