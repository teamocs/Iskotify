import Image from 'next/image'
import Link from 'next/link'
import { WEB_APP_URL } from '../../lib/links'

export function FooterCTA() {
  return (
    <>
      {/* Download CTA section */}
      <section
        id="download"
        className="relative bg-gradient-to-br from-[#800000] via-[#9a0000] to-[#5a0000] py-20 px-6 overflow-hidden"
      >
        {/* Decorative background circles */}
        <div className="pointer-events-none absolute -top-20 -left-20 w-64 h-64 rounded-full bg-white/[0.04] blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 right-1/3 w-80 h-80 rounded-full bg-white/[0.03] blur-3xl" />

        <div className="max-w-6xl mx-auto relative">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            {/* Kuya Baw mascot — left */}
            <div className="flex-shrink-0 order-first">
              <Image
                src="/kuya-baw-waving.png"
                alt="Kuya Baw"
                width={120}
                height={120}
                className="drop-shadow-2xl"
              />
            </div>

            {/* Text + buttons */}
            <div className="flex-1 text-center md:text-left">
              <h2 className="font-heading font-extrabold text-white text-3xl md:text-4xl lg:text-5xl leading-tight mb-4">
                Start Your Scholarship Journey Today
              </h2>
              <p className="text-red-200 font-body text-base mb-8">
                Start for free on Early access · No subscription ever.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <a
                  href="#early-access"
                  aria-label="Request early access to the free Iskotify Android app"
                  className="inline-flex items-center justify-center gap-2 bg-white text-[#800000] rounded-xl px-6 py-3 text-sm font-semibold hover:bg-red-50 transition-colors shadow-sm"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3.18 23.76c.3.17.64.22.99.14l12.49-7.21-2.79-2.79-10.69 9.86zM.35 1.09A1.5 1.5 0 0 0 0 2.06v19.88a1.5 1.5 0 0 0 .35.97l.05.05 11.14-11.14v-.26L.4 1.04l-.05.05zM23.15 10.56l-2.79-1.61-3.12 3.12 3.12 3.12 2.81-1.62c.8-.46.8-1.55-.02-2.01zM4.17.1l12.49 7.21-2.79 2.79L3.18.24A1.18 1.18 0 0 1 4.17.1z" />
                  </svg>
                  Start free trial — Android
                </a>
                <a
                  href={WEB_APP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open the Iskotify web app"
                  className="inline-flex items-center justify-center gap-2 border border-white/45 text-white rounded-xl px-6 py-3 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Try on Web
                </a>
              </div>
              <p className="text-red-200/80 font-body text-xs mt-4">
                Android Early Access · Also available in your browser · iOS coming soon
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#5a0000] border-t border-white/10 px-6 py-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Iskotify" width={20} height={20} className="rounded-[20%]" />
            <span className="text-white/60 font-body text-sm">© 2026 Iskotify. All rights reserved.</span>
          </div>
          <nav className="flex items-center gap-5">
            <Link href="/privacy" className="text-white/50 hover:text-white/80 text-sm font-body transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-white/50 hover:text-white/80 text-sm font-body transition-colors">
              Terms of Service
            </Link>
            <Link href="/contact" className="text-white/50 hover:text-white/80 text-sm font-body transition-colors">
              Contact
            </Link>
            <a
              href="https://www.facebook.com/share/g/193aUvEccE/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join the private Iskotify beta community on Facebook"
              className="text-white/50 hover:text-white/80 text-sm font-body transition-colors"
            >
              Community
            </a>
          </nav>
        </div>
      </footer>
    </>
  )
}
