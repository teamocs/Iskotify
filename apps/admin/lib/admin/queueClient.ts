/**
 * Client side of the moderation queues: turn the table's URL state into a
 * list-route request and load one page, dropping responses that a newer
 * request has superseded. No React here, so it is tested directly.
 */

import type { TableState } from '@/lib/table/tableState'
import { QUEUE_PAGE_SIZE } from './queueSpecs'

/** The route URL for one page. `page` is the table's 1-based page; the route's is 0-based. */
export function buildQueueUrl(listUrl: string, view: TableState, page = view.page): string {
  const p = new URLSearchParams({ page: String(Math.max(0, page - 1)), limit: String(QUEUE_PAGE_SIZE) })
  if (view.sort) {
    p.set('sort', view.sort.id)
    p.set('dir', view.sort.dir)
  }
  const q = view.q.trim()
  if (q) p.set('q', q)
  for (const [id, value] of Object.entries(view.filters)) if (value) p.set(id, value)
  return `${listUrl}?${p}`
}

/** Hands out request tokens; only the newest token stays current. */
export function createRequestGuard() {
  let latest = 0
  return {
    begin(): () => boolean {
      const id = ++latest
      return () => id === latest
    },
  }
}

export type QueuePage<T> =
  | { status: 'ok'; rows: T[]; total: number }
  | { status: 'error'; error: string }
  | { status: 'stale' }

interface LoadOptions {
  listUrl: string
  view: TableState
  fetcher?: (url: string) => Promise<Response>
  /** False once a newer request has started; its result is then dropped. */
  isCurrent: () => boolean
}

type Fetched<T> =
  | { status: 'ok'; rows: T[]; total: number; outOfRange: boolean }
  | { status: 'error'; error: string }
  | { status: 'stale' }

export async function loadQueuePage<T>({ listUrl, view, fetcher = url => fetch(url), isCurrent }: LoadOptions): Promise<QueuePage<T>> {
  const stale = { status: 'stale' } as const

  async function get(page: number): Promise<Fetched<T>> {
    const res = await fetcher(buildQueueUrl(listUrl, view, page))
    if (!isCurrent()) return stale
    const body = await res.json().catch(() => ({}))
    // Re-check after the body is read: a newer request may have started meanwhile.
    if (!isCurrent()) return stale
    if (!res.ok) return { status: 'error', error: body.error ?? 'Failed to load' }
    return { status: 'ok', rows: body.rows ?? [], total: body.count ?? 0, outOfRange: Boolean(body.outOfRange) }
  }

  try {
    let result = await get(view.page)
    if (result.status !== 'ok') return result
    if (result.outOfRange || (result.rows.length === 0 && result.total > 0)) {
      // The page is past the end (a change emptied it): show the last page
      // instead. The route can't count a refused range, so page 1 tells us the total.
      const first = result.outOfRange ? await get(1) : result
      if (first.status !== 'ok') return first
      const last = Math.max(1, Math.ceil(first.total / QUEUE_PAGE_SIZE))
      result = result.outOfRange && last === 1 ? first : await get(last)
      if (result.status !== 'ok') return result
    }
    return { status: 'ok', rows: result.rows, total: result.total }
  } catch {
    return isCurrent() ? { status: 'error', error: 'Network error' } : stale
  }
}
