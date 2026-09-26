import Image from 'next/image'
import Link from 'next/link'
import { WEB_APP_URL } from '../../lib/links'
import { Android, ArrowRight } from './Icons'
import { WRAP } from './styles'

const FOOTER_LINK =
  'inline-flex min-h-11 items-center rounded-sm px-2 font-body text-sm text-ink-inverse/75 transition-colors hover:text-ink-inverse'

export function FooterCTA() {
  return (
    <>
      <section id="start" aria-labelledby="start-title" className="bg-maroon py-20 md:py-28">
        <div className={`${WRAP} flex flex-col items-center text-center`}>
          <Image src="/kuya-baw-waving.png" alt="" width={96} height={96} className="drop-shadow-xl" />
          <h2
            id="start-title"
            className="mt-6 max-w-4xl font-heading text-[2.5rem] font-extrabold leading-[1.02] tracking-[-0.03em] text-ink-inverse text-balance md:text-7xl"
          >
            Para sa mga Iskolar ng Bayan.
          </h2>
          <p className="mt-5 max-w-xl font-body text-lg leading-relaxed text-ink-inverse/85">
            Start with today&apos;s step. Free entrance-exam practice and a scholarship finder, ready in your browser.
            Kaya mo &apos;to.
          </p>
          <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <a
              href={WEB_APP_URL}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sm bg-surface px-6 font-body text-base font-semibold text-maroon shadow-sm transition-colors hover:bg-surface-2"
            >
              Start studying free
              <ArrowRight className="size-5" />
            </a>
            <Link
              href="/#early-access"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sm border border-ink-inverse/40 px-6 font-body text-base font-semibold text-ink-inverse transition-colors hover:bg-ink-inverse/10"
            >
              <Android className="size-5" />
              Android early access
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-maroon-hover py-6">
        <div className={`${WRAP} flex flex-col items-center justify-between gap-4 sm:flex-row`}>
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="" width={20} height={20} className="rounded-[20%]" />
            <span className="font-body text-sm text-ink-inverse/75">© 2026 Iskotify</span>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center justify-center gap-x-3">
              <li><Link href="/privacy" className={FOOTER_LINK}>Privacy Policy</Link></li>
              <li><Link href="/terms" className={FOOTER_LINK}>Terms of Service</Link></li>
              <li><Link href="/contact" className={FOOTER_LINK}>Contact</Link></li>
              <li>
                <a
                  href="https://www.facebook.com/share/g/193aUvEccE/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={FOOTER_LINK}
                >
                  Community<span className="sr-only"> (Facebook group, opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  )
}
