import { describe, it, expect, vi } from 'vitest'
import { parseTableState } from '@/lib/table/tableState'
import { APP_REPORTS_QUEUE, FEEDBACK_QUEUE, QUEUE_PAGE_SIZE, REPORTS_QUEUE, queueTableOptions } from '../queueSpecs'
import { buildQueueUrl, createRequestGuard, loadQueuePage } from '../queueClient'

const viewFrom = (qs: string, spec = REPORTS_QUEUE) => parseTableState(new URLSearchParams(qs), queueTableOptions(spec))
const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams)

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response

describe('queue table options', () => {
  it('match what each route allow-lists, so the table and the route agree', () => {
    expect(queueTableOptions(REPORTS_QUEUE).sortable).toEqual(['question', 'source', 'reason', 'status', 'reported'])
    expect(queueTableOptions(REPORTS_QUEUE).filters).toEqual(['status', 'reason', 'source'])
    expect(queueTableOptions(APP_REPORTS_QUEUE).filters).toEqual(['status', 'platform'])
    expect(queueTableOptions(FEEDBACK_QUEUE).sortable).toEqual(['rating', 'status', 'submitted'])
    expect(queueTableOptions(FEEDBACK_QUEUE).defaultSort).toEqual({ id: 'submitted', dir: 'desc' })
  })
})

describe('buildQueueUrl', () => {
  it('asks for the first page, newest first, when the URL is empty', () => {
    const url = buildQueueUrl('/api/admin/reports', viewFrom(''))
    expect(url.startsWith('/api/admin/reports?')).toBe(true)
    expect(params(url)).toEqual({ page: '0', limit: String(QUEUE_PAGE_SIZE), sort: 'reported', dir: 'desc' })
  })

  it('passes q (trimmed), sort, dir, page and every filter from the URL state', () => {
    const url = buildQueueUrl('/api/admin/reports', viewFrom('q=%20capital%20&sort=-question&status=new&source=flashcards&reason=other&page=3'))
    expect(params(url)).toEqual({
      page: '2', limit: '50', sort: 'question', dir: 'desc',
      q: 'capital', status: 'new', source: 'flashcards', reason: 'other',
    })
  })

  it('drops URL params that are not this queue’s filters or sorts', () => {
    const url = buildQueueUrl('/api/admin/feedback', viewFrom('sort=message&platform=ios&rating=5', FEEDBACK_QUEUE))
    expect(params(url)).toEqual({ page: '0', limit: '50', sort: 'submitted', dir: 'desc', rating: '5' })
  })

  it('can ask for a specific page', () => {
    expect(params(buildQueueUrl('/api/admin/feedback', viewFrom('page=4', FEEDBACK_QUEUE), 7)).page).toBe('6')
  })
})

describe('loadQueuePage', () => {
  const always = () => true

  it('returns the page rows and the total the route counted', async () => {
    const fetcher = vi.fn(async (_url: string) => json({ rows: [{ id: 'a' }], count: 120 }))
    const out = await loadQueuePage({ listUrl: '/api/admin/reports', view: viewFrom('page=2'), fetcher, isCurrent: always })
    expect(out).toEqual({ status: 'ok', rows: [{ id: 'a' }], total: 120 })
    expect(params(fetcher.mock.calls[0]![0]).page).toBe('1')
  })

  it('surfaces the route error', async () => {
    const fetcher = vi.fn(async () => json({ error: 'Invalid sort' }, false))
    expect(await loadQueuePage({ listUrl: '/x', view: viewFrom(''), fetcher, isCurrent: always }))
      .toEqual({ status: 'error', error: 'Invalid sort' })
  })

  it('reports a network error', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline') })
    expect(await loadQueuePage({ listUrl: '/x', view: viewFrom(''), fetcher, isCurrent: always }))
      .toEqual({ status: 'error', error: 'Network error' })
  })

  it('falls back to the last page when the requested page is past the end (e.g. after a bulk change emptied it)', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const page = params(url).page
      if (page === '4') return json({ rows: [], count: null, outOfRange: true })
      if (page === '0') return json({ rows: [{ id: 'first' }], count: 60 })
      return json({ rows: [{ id: 'last' }], count: 60 })
    })
    const out = await loadQueuePage({ listUrl: '/x', view: viewFrom('page=5'), fetcher, isCurrent: always })
    expect(out).toEqual({ status: 'ok', rows: [{ id: 'last' }], total: 60 })
    expect(fetcher.mock.calls.map(c => params(c[0] as string).page)).toEqual(['4', '0', '1'])
  })

  it('stays on page 1 when everything fits on it after the fallback', async () => {
    const fetcher = vi.fn(async (url: string) => params(url).page === '0'
      ? json({ rows: [{ id: 'only' }], count: 1 })
      : json({ rows: [], count: null, outOfRange: true }))
    const out = await loadQueuePage({ listUrl: '/x', view: viewFrom('page=3'), fetcher, isCurrent: always })
    expect(out).toEqual({ status: 'ok', rows: [{ id: 'only' }], total: 1 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('createRequestGuard (out-of-order responses)', () => {
  it('drops an older response that arrives after a newer one', async () => {
    const guard = createRequestGuard()
    const slow = deferred<Response>()
    const fetcher = vi.fn()
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(async () => json({ rows: [{ id: 'new' }], count: 1 }))

    const first = loadQueuePage({ listUrl: '/x', view: viewFrom('q=a'), fetcher, isCurrent: guard.begin() })
    const second = loadQueuePage({ listUrl: '/x', view: viewFrom('q=ab'), fetcher, isCurrent: guard.begin() })
    expect(await second).toEqual({ status: 'ok', rows: [{ id: 'new' }], total: 1 })

    slow.resolve(json({ rows: [{ id: 'old' }], count: 1 }))
    expect(await first).toEqual({ status: 'stale' })
  })

  it('re-checks after the body is read: a request superseded while parsing is dropped', async () => {
    const guard = createRequestGuard()
    const body = deferred<unknown>()
    const fetcher = vi.fn(async () => ({ ok: true, json: () => body.promise }) as unknown as Response)

    const first = loadQueuePage({ listUrl: '/x', view: viewFrom(''), fetcher, isCurrent: guard.begin() })
    await Promise.resolve()
    await Promise.resolve()
    guard.begin() // a newer request starts while the first is still parsing
    body.resolve({ rows: [{ id: 'old' }], count: 1 })
    expect(await first).toEqual({ status: 'stale' })
  })

  it('a stale network failure is dropped too, not shown as an error', async () => {
    const guard = createRequestGuard()
    const fail = deferred<Response>()
    const fetcher = vi.fn(() => fail.promise)
    const first = loadQueuePage({ listUrl: '/x', view: viewFrom(''), fetcher, isCurrent: guard.begin() })
    guard.begin()
    fail.resolve(Promise.reject(new Error('offline')) as unknown as Response)
    expect(await first).toEqual({ status: 'stale' })
  })
})
