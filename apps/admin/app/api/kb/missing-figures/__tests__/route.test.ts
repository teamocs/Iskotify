import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))

function dbWith(row: unknown) {
  return {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: row ? [row] : [], error: null }) }) }),
  }
}

const req = (qs: string) => new Request(`http://localhost/api/kb/missing-figures${qs}`) as unknown as import('next/server').NextRequest
const load = async () => (await import('../route')).GET

describe('GET /api/kb/missing-figures', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
  })

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const res = await (await load())(req('?driveFileId=f1'))
    expect(res.status).toBe(403)
  })

  it('requires a valid driveFileId', async () => {
    mockRequireAdmin.mockResolvedValue({ supabase: dbWith(null) })
    expect((await (await load())(req(''))).status).toBe(400)
  })

  it('returns 404 for a file not in the ledger', async () => {
    mockRequireAdmin.mockResolvedValue({ supabase: dbWith(null) })
    expect((await (await load())(req('?driveFileId=f9'))).status).toBe(404)
  })

  it('downloads the full missing-figures list as CSV, quoting captions safely', async () => {
    mockRequireAdmin.mockResolvedValue({
      supabase: dbWith({
        name: 'UPCAT-Science-600-Questions.csv',
        missing_figures: [
          { question_id: 'upcat-science-600-questions:UPCAT-SCI-003', file: 'diagrams/circuit_3.png', caption: 'Series circuit, 3 cells' },
          { question_id: 'q2', file: 'figures/va01.png', caption: '=HYPERLINK("x")' },
        ],
      }),
    })
    const res = await (await load())(req('?driveFileId=f1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('UPCAT-Science-600-Questions-missing-figures.csv')
    const body = await res.text()
    expect(body.split('\r\n')).toEqual([
      'question_id,file,caption',
      'upcat-science-600-questions:UPCAT-SCI-003,diagrams/circuit_3.png,"Series circuit, 3 cells"',
      // Spreadsheet formula injection neutralised.
      `q2,figures/va01.png,"'=HYPERLINK(""x"")"`,
      '',
    ])
  })
})
