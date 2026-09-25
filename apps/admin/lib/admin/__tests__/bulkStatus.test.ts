import { describe, it, expect, vi } from 'vitest'
import { patchStatuses, bulkMessage, fetchAllPages, REVIEW_STATUS_LABEL } from '../bulkStatus'

const okRes = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }) as Response
const failRes = () => ({ ok: false, status: 500, json: async () => ({ error: 'Database error' }) }) as Response

describe('patchStatuses', () => {
  it('PATCHes the per-item route once per id with the status body', async () => {
    const fetcher = vi.fn(async () => okRes())
    await patchStatuses('/api/admin/reports', ['a', 'b'], 'resolved', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledWith('/api/admin/reports/a', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    })
    expect(fetcher).toHaveBeenCalledWith('/api/admin/reports/b', expect.objectContaining({ method: 'PATCH' }))
  })

  it('encodes ids in the URL', async () => {
    const fetcher = vi.fn(async () => okRes())
    await patchStatuses('/api/admin/feedback', ['x/y'], 'reviewed', fetcher)
    expect(fetcher).toHaveBeenCalledWith('/api/admin/feedback/x%2Fy', expect.anything())
  })

  it('counts non-ok responses and network errors as failed', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/b')) return failRes()
      if (url.endsWith('/c')) throw new TypeError('Failed to fetch')
      return okRes()
    })
    const out = await patchStatuses('/api/admin/app-reports', ['a', 'b', 'c'], 'new', fetcher as unknown as typeof fetch)
    expect(out).toEqual({ status: 'new', ok: ['a'], failed: ['b', 'c'] })
  })
})

describe('bulkMessage', () => {
  const noun = { one: 'report', many: 'reports' }

  it('reports full success in past tense with the count', () => {
    expect(bulkMessage({ status: 'resolved', ok: ['1', '2', '3', '4'], failed: [] }, noun))
      .toEqual({ ok: true, message: 'Marked 4 reports resolved' })
  })

  it('uses the singular for one item', () => {
    expect(bulkMessage({ status: 'reviewed', ok: ['1'], failed: [] }, noun))
      .toEqual({ ok: true, message: 'Marked 1 report reviewed' })
  })

  it('names how many failed on partial failure', () => {
    expect(bulkMessage({ status: 'resolved', ok: ['1', '2', '3'], failed: ['4'] }, noun))
      .toEqual({ ok: false, message: 'Marked 3 reports resolved, but 1 report failed. It is still selected; try again.' })
  })

  it('says nothing changed when every request failed', () => {
    expect(bulkMessage({ status: 'new', ok: [], failed: ['1', '2'] }, { one: 'item', many: 'items' }))
      .toEqual({ ok: false, message: 'Couldn’t mark 2 items new. They are still selected; try again.' })
  })
})

describe('fetchAllPages', () => {
  it('pages through the list endpoint until it has every row', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const page = Number(new URL(url, 'http://x').searchParams.get('page'))
      const rows = page === 0 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'c' }]
      return { ok: true, json: async () => ({ rows, count: 3 }) } as Response
    })
    const out = await fetchAllPages<{ id: string }>('/api/admin/reports', fetcher as unknown as typeof fetch, 2)
    expect(out).toEqual({ ok: true, rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], count: 3 })
    expect(fetcher).toHaveBeenCalledWith('/api/admin/reports?page=0&limit=2')
    expect(fetcher).toHaveBeenCalledWith('/api/admin/reports?page=1&limit=2')
  })

  it('returns the server error instead of rows', async () => {
    const fetcher = vi.fn(async () => failRes())
    expect(await fetchAllPages('/api/admin/feedback', fetcher)).toEqual({ ok: false, error: 'Database error' })
  })

  it('returns a network error when the request throws', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    expect(await fetchAllPages('/api/admin/feedback', fetcher)).toEqual({ ok: false, error: 'Network error' })
  })
})

describe('REVIEW_STATUS_LABEL', () => {
  it('has a human label per status', () => {
    expect(REVIEW_STATUS_LABEL).toEqual({ new: 'New', reviewed: 'Reviewed', resolved: 'Resolved' })
  })
})
