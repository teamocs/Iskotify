import { useId, type ReactNode } from 'react'

interface CardProps {
  title?: string
  description?: ReactNode
  /** Controls placed at the right of the header (buttons, filters). */
  actions?: ReactNode
  headingLevel?: 2 | 3
  id?: string
  className?: string
  /** Remove body padding, e.g. when the body is a full-bleed table. */
  flush?: boolean
  children: ReactNode
}

/**
 * A bordered surface. Elevation is declared once — a hairline border, no
 * shadow — so cards read as regions of one page, not floating tiles.
 * With a title it becomes a labelled <section> with a real heading.
 */
export function Card({ title, description, actions, headingLevel = 2, id, className, flush = false, children }: CardProps) {
  const headingId = useId()
  const frame = ['bg-surface border border-subtle rounded-md overflow-hidden', className].filter(Boolean).join(' ')
  const body = flush ? children : <div className="p-4">{children}</div>

  if (!title) return <div id={id} className={frame}>{body}</div>

  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section id={id} aria-labelledby={headingId} className={frame}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 border-b border-subtle">
        <div className="min-w-0">
          <H id={headingId} className="font-heading font-semibold text-[15px] leading-6 text-ink">{title}</H>
          {description && <p className="text-xs text-ink-muted mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {body}
    </section>
  )
}
