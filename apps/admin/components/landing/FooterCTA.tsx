import Image from 'next/image'
import Link from 'next/link'

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
                One-time ₱129 · Lifetime access · No subscription ever.
              </p>

              <div className="flex flex-row gap-2 justify-center md:justify-start">
                <a
                  href="#"
                  className="w-1/2 sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-[#1d1d1f] rounded-xl px-6 py-3 text-sm font-medium hover:bg-red-50 transition-colors shadow-sm"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  App Store
                </a>
                <a
                  href="#"
                  className="w-1/2 sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-[#1d1d1f] rounded-xl px-6 py-3 text-sm font-medium hover:bg-red-50 transition-colors shadow-sm"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3.18 23.76c.3.17.64.22.99.14l12.49-7.21-2.79-2.79-10.69 9.86zM.35 1.09A1.5 1.5 0 0 0 0 2.06v19.88a1.5 1.5 0 0 0 .35.97l.05.05 11.14-11.14v-.26L.4 1.04l-.05.05zM23.15 10.56l-2.79-1.61-3.12 3.12 3.12 3.12 2.81-1.62c.8-.46.8-1.55-.02-2.01zM4.17.1l12.49 7.21-2.79 2.79L3.18.24A1.18 1.18 0 0 1 4.17.1z" />
                  </svg>
                  Google Play
                </a>
              </div>
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
            <Link href="#" className="text-white/50 hover:text-white/80 text-sm font-body transition-colors">
              Privacy Policy
            </Link>
            <Link href="#" className="text-white/50 hover:text-white/80 text-sm font-body transition-colors">
              Terms of Service
            </Link>
            <Link href="#" className="text-white/50 hover:text-white/80 text-sm font-body transition-colors">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
