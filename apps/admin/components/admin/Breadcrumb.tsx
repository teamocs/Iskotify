import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface Props {
  items: BreadcrumbItem[]
}

/** WAI-ARIA breadcrumb: a labelled nav, an ordered list, the current page marked. */
export function Breadcrumb({ items }: Props) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1
          return (
            <li key={idx} className="flex items-center gap-1">
              {idx > 0 && <Icon name="chevron-right" size={14} className="text-ink-subtle" />}
              {isLast ? (
                <span aria-current="page" className="font-semibold text-ink">{item.label}</span>
              ) : item.href ? (
                <Link href={item.href} className="rounded-sm transition-colors hover:text-ink">
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
