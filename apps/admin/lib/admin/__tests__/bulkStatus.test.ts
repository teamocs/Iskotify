import { describe, it, expect, vi } from 'vitest'
import { patchStatuses, bulkMessage, runBulkStatus, REVIEW_STATUS_LABEL } from '../bulkStatus'

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

describe('runBulkStatus', () => {
  const noun = { one: 'report', many: 'reports' }

  it('refetches the current page after a bulk change that changed something', async () => {
    const fetcher = vi.fn(async () => okRes())
    const refetch = vi.fn()
    const out = await runBulkStatus({ listUrl: '/api/admin/reports', ids: ['a', 'b'], status: 'resolved', noun, refetch, fetcher })
    expect(out).toEqual({ ok: true, message: 'Marked 2 reports resolved', failed: [] })
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('refetches on partial failure and hands back what failed, to keep it selected', async () => {
    const fetcher = vi.fn(async (url: string) => (url.endsWith('/b') ? failRes() : okRes()))
    const refetch = vi.fn()
    const out = await runBulkStatus({ listUrl: '/x', ids: ['a', 'b'], status: 'new', noun, refetch, fetcher: fetcher as unknown as typeof fetch })
    expect(out.ok).toBe(false)
    expect(out.failed).toEqual(['b'])
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('does not refetch when nothing changed', async () => {
    const fetcher = vi.fn(async () => failRes())
    const refetch = vi.fn()
    const out = await runBulkStatus({ listUrl: '/x', ids: ['a'], status: 'new', noun, refetch, fetcher })
    expect(out.failed).toEqual(['a'])
    expect(refetch).not.toHaveBeenCalled()
  })
})

describe('REVIEW_STATUS_LABEL', () => {
  it('has a human label per status', () => {
    expect(REVIEW_STATUS_LABEL).toEqual({ new: 'New', reviewed: 'Reviewed', resolved: 'Resolved' })
  })
})
