import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/listings', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: { signOut: vi.fn() } }) }))

import { Toaster } from 'sonner'
import { AdminShell } from '../AdminShell'

describe('AdminShell', () => {
  it('mounts exactly one Toaster', () => {
    const spy = vi.mocked(Toaster)
    spy.mockClear()
    renderToStaticMarkup(
      <AdminShell userEmail="admin@test.com"><div>page content</div></AdminShell>
    )
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('configures the Toaster with bottom-right position and a close button', () => {
    const spy = vi.mocked(Toaster)
    spy.mockClear()
    renderToStaticMarkup(
      <AdminShell userEmail="admin@test.com"><div>page content</div></AdminShell>
    )
    const props = spy.mock.calls[0]![0] as { position?: string; closeButton?: boolean; richColors?: boolean }
    expect(props.position).toBe('bottom-right')
    expect(props.closeButton).toBe(true)
    expect(props.richColors).not.toBe(true)
  })

  it('still renders the page content passed as children', () => {
    const html = renderToStaticMarkup(
      <AdminShell userEmail="admin@test.com"><div>page content</div></AdminShell>
    )
    expect(html).toContain('page content')
  })
})
