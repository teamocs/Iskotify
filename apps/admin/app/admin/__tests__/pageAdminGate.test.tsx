import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pages that read with the service-role client check the admin session
// themselves — the layout's check alone doesn't stop a page's own data fetch.

const mockIsAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ isAdminSession: () => mockIsAdmin() }))

const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/admin',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

const createServerClient = vi.fn(() => { throw new Error('the service-role client must not be created') })
vi.mock('@iskotify/utils', async () => {
  const actual = await vi.importActual<typeof import('@iskotify/utils')>('@iskotify/utils')
  return { ...actual, createServerClient: () => createServerClient() }
})

const PAGES = {
  '/admin/sync': () => import('../sync/page'),
  '/admin/listings/import': () => import('../listings/import/page'),
  '/admin/updates': () => import('../updates/page'),
}

describe('admin pages that read with the service role', () => {
  beforeEach(() => {
    mockIsAdmin.mockReset()
    notFound.mockClear()
    createServerClient.mockClear()
  })

  it.each(Object.entries(PAGES))('%s answers 404 to a non-admin without touching the database', async (_path, load) => {
    mockIsAdmin.mockResolvedValue(false)
    const { default: Page } = await load()
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })
})
