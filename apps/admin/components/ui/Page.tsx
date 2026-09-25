import type { ReactNode } from 'react'

const WIDTHS = { full: '', wide: 'mx-auto max-w-6xl', narrow: 'mx-auto max-w-3xl' } as const

/**
 * The scrollable page region under the Topbar. The Topbar owns the page's one
 * h1; a page never repeats that title as its own heading. `intro` is a single
 * sentence of orientation (what this page is for), not a second title.
 */
export function PageBody({ intro, width = 'full', className, children }: {
  intro?: ReactNode
  width?: keyof typeof WIDTHS
  className?: string
  children: ReactNode
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className={['space-y-4 px-3 py-4 sm:px-4 md:px-6 md:py-5', WIDTHS[width], className].filter(Boolean).join(' ')}>
        {intro && <p className="max-w-prose text-ui text-ink-muted">{intro}</p>}
        {children}
      </div>
    </div>
  )
}
