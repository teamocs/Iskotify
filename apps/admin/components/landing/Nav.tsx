import Image from 'next/image'
import Link from 'next/link'
import { WEB_APP_URL } from '../../lib/links'

// Root-relative anchors so the nav also works from /listings.
const LINKS = [
  { href: '/#practice', label: 'Practice' },
  { href: '/#explore', label: 'Explore' },
  { href: '/#progress', label: 'Progress' },
  { href: '/#faq', label: 'FAQ' },
]

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-subtle bg-surface/85 backdrop-blur-xl backdrop-saturate-150">
      <nav aria-label="Main" className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm">
          <Image src="/logo.svg" alt="" width={28} height={28} className="rounded-[20%]" />
          <span translate="no" className="font-heading text-lg font-extrabold tracking-[-0.02em] text-maroon">Iskotify</span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map(l => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-flex min-h-11 items-center rounded-sm px-3 font-body text-sm text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <a
          href={WEB_APP_URL}
          className="inline-flex min-h-11 shrink-0 items-center rounded-sm bg-maroon px-4 font-body text-sm font-semibold text-ink-inverse transition-colors hover:bg-maroon-hover"
        >
          Start studying
        </a>
      </nav>
    </header>
  )
}
