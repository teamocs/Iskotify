'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { WEB_APP_URL } from '../../lib/links'

// Root-relative anchors so the nav also works from /listings.
const LINKS = [
  { href: '/#practice', label: 'Practice' },
  { href: '/#explore', label: 'Explore' },
  { href: '/#progress', label: 'Progress' },
  { href: '/#faq', label: 'FAQ' },
]

const CTA = 'inline-flex h-8 shrink-0 items-center rounded-capsule bg-maroon px-4 font-body text-sm font-semibold text-ink-inverse transition-colors hover:bg-maroon-hover'
const FOCUSABLE = 'a[href], button:not([disabled])'

/**
 * Apple-style header: a 52px frosted strip, the four section links centred,
 * a small maroon capsule CTA. Below md the links fold into a two-line menu
 * button that opens a full-screen frosted menu (Escape closes, focus moves in
 * and comes back, page scroll is locked, a link click closes it).
 */
export function Nav() {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Return focus to the button only for closes that keep the user here
  // (Escape, the button). A link click navigates; focus follows the page.
  const returnFocus = useRef(false)

  function close(restore: boolean) {
    returnFocus.current = restore
    setOpen(false)
  }

  useEffect(() => {
    if (!open) {
      if (returnFocus.current) buttonRef.current?.focus()
      returnFocus.current = false
      return
    }
    menuRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return }
      // While open, Tab cycles the menu button and the menu's items only.
      if (e.key !== 'Tab' || !menuRef.current || !buttonRef.current) return
      const items = [buttonRef.current, ...Array.from(menuRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))]
      const at = items.indexOf(document.activeElement as HTMLElement)
      const last = items.length - 1
      if (e.shiftKey && at <= 0) { e.preventDefault(); items[last]!.focus() }
      else if (!e.shiftKey && (at === last || at === -1)) { e.preventDefault(); items[0]!.focus() }
    }
    // Growing past md shows the inline links again; the menu has nothing left to do.
    const wide = window.matchMedia?.('(min-width: 768px)')
    const onWide = (e: MediaQueryListEvent) => { if (e.matches) close(false) }
    window.addEventListener('keydown', onKey)
    wide?.addEventListener?.('change', onWide)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      wide?.removeEventListener?.('change', onWide)
    }
  }, [open])

  return (
    // The frosted strip is a child, not the header itself: backdrop-filter makes
    // an element the containing block of fixed descendants, which would trap the
    // full-screen menu inside the 52px bar.
    <header className="sticky top-0 z-50 w-full">
      <div className="glass relative z-10 w-full">
        <nav
          aria-label="Main"
          className="mx-auto grid h-[52px] w-full max-w-[1080px] grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]"
        >
          <Link href="/" className="flex min-h-11 items-center gap-2 justify-self-start rounded-sm">
            <Image src="/logo.svg" alt="" width={28} height={28} className="rounded-[20%]" />
            <span translate="no" className="font-heading text-lg font-extrabold tracking-[-0.02em] text-maroon">Iskotify</span>
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {LINKS.map(l => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex min-h-11 items-center rounded-sm px-3 font-body text-sm text-ink/[0.88] transition-colors hover:text-ink"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1 justify-self-end">
            <a href={WEB_APP_URL} className={CTA}>Start studying</a>
            <button
              ref={buttonRef}
              type="button"
              aria-label="Menu"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => (open ? close(true) : setOpen(true))}
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-sm text-ink md:hidden"
            >
              <span aria-hidden="true" className="relative block h-3 w-[18px]">
                <span
                  data-line=""
                  className={`absolute left-0 h-[1.5px] w-full rounded-capsule bg-current transition-transform duration-280 ease-smooth ${open ? 'top-[5px] rotate-45' : 'top-0.5'}`}
                />
                <span
                  data-line=""
                  className={`absolute left-0 h-[1.5px] w-full rounded-capsule bg-current transition-transform duration-280 ease-smooth ${open ? 'top-[5px] -rotate-45' : 'top-2'}`}
                />
              </span>
            </button>
          </div>
        </nav>
      </div>

      <div
        ref={menuRef}
        id={menuId}
        hidden={!open}
        className="glass fixed inset-0 overflow-y-auto pt-[52px] md:hidden"
      >
        <ul className="mx-auto flex max-w-[1080px] flex-col px-8 pt-6">
          {LINKS.map((l, i) => (
            <li
              key={l.href}
              className="motion-safe:animate-slideUp [animation-fill-mode:both]"
              style={{ animationDelay: `${40 + i * 40}ms` }}
            >
              <Link
                href={l.href}
                onClick={() => close(false)}
                className="flex min-h-14 items-center font-heading text-[28px] font-semibold leading-tight tracking-tight text-ink"
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li
            className="motion-safe:animate-slideUp pt-8 [animation-fill-mode:both]"
            style={{ animationDelay: `${40 + LINKS.length * 40}ms` }}
          >
            <a href={WEB_APP_URL} onClick={() => close(false)} className={CTA}>Start studying</a>
          </li>
        </ul>
      </div>
    </header>
  )
}
