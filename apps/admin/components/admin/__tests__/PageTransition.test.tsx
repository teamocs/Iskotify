import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageTransition } from '../PageTransition'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/listings',
}))

describe('PageTransition', () => {
  it('renders children inside animate-slideUp wrapper', () => {
    const html = renderToStaticMarkup(
      <PageTransition><p>hello</p></PageTransition>
    )
    expect(html).toContain('animate-slideUp')
    expect(html).toContain('hello')
  })
})
