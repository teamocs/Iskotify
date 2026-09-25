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

interface BulkRun {
  listUrl: string
  ids: string[]
  status: ReviewStatus
  noun: { one: string; many: string }
  /** Reloads the page on screen; called once when anything changed. */
  refetch: () => void
  fetcher?: typeof fetch
}

/**
 * A bulk status change end to end: PATCH every id, summarise the outcome, and
 * refetch the current page if any row changed. `failed` is what should stay
 * selected, so a retry is one click.
 */
export async function runBulkStatus({ listUrl, ids, status, noun, refetch, fetcher = fetch }: BulkRun) {
  const outcome = await patchStatuses(listUrl, ids, status, fetcher)
  if (outcome.ok.length > 0) refetch()
  return { ...bulkMessage(outcome, noun), failed: outcome.failed }
}
