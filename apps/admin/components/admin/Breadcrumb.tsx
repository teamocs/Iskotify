import Link from 'next/link'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface Props {
  items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: Props) {
  return (
    <nav className="flex items-center gap-1 text-sm text-[#6e6e73] flex-wrap">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <span key={idx} className="flex items-center gap-1">
            {idx > 0 && <span className="text-[#aeaeb2]">›</span>}
            {isLast || !item.href ? (
              <span className={isLast ? 'font-semibold text-[#1d1d1f]' : ''}>{item.label}</span>
            ) : (
              <Link href={item.href} className="hover:text-[#1d1d1f] transition-colors">
                {item.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
