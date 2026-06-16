import Image from 'next/image'

const webAppUrl = process.env.NEXT_PUBLIC_WEB_APP_URL

export function Hero() {
  return (
    <section className="relative bg-[#f5f5f7] overflow-hidden py-16 md:py-24 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-16">

        {/* Left column */}
        <div className="flex-1 text-center md:text-left">
          <p className="text-xs tracking-[0.14em] text-[#800000] font-semibold uppercase mb-4 font-body">
            Para sa mga Iskolar ng Bayan
          </p>
          <h1 className="font-heading font-extrabold text-[#1d1d1f] text-4xl md:text-5xl lg:text-[3.25rem] leading-[1.08] tracking-tight mb-5">
            Your Scholarship &amp; Exam Journey —{' '}
            <span className="text-[#800000]">Made Effortlessly Simple</span>
          </h1>
          <p className="text-[#6e6e73] text-base md:text-lg mb-8 max-w-lg font-body leading-relaxed">
            Find scholarships, track deadlines, and prepare for your qualifying exams — all in one place.
          </p>

          {/* Download buttons — always side-by-side */}
          <div className="flex flex-row gap-2 justify-center md:justify-start mb-8">
            <a
              href="#download"
              className="w-1/2 sm:w-auto inline-flex items-center justify-center gap-2 bg-[#1d1d1f] text-white rounded-xl px-6 py-3 text-sm font-medium hover:bg-black transition-colors shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              App Store
            </a>
            <a
              href="#download"
              className="w-1/2 sm:w-auto inline-flex items-center justify-center gap-2 bg-[#1d1d1f] text-white rounded-xl px-6 py-3 text-sm font-medium hover:bg-black transition-colors shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3.18 23.76c.3.17.64.22.99.14l12.49-7.21-2.79-2.79-10.69 9.86zM.35 1.09A1.5 1.5 0 0 0 0 2.06v19.88a1.5 1.5 0 0 0 .35.97l.05.05 11.14-11.14v-.26L.4 1.04l-.05.05zM23.15 10.56l-2.79-1.61-3.12 3.12 3.12 3.12 2.81-1.62c.8-.46.8-1.55-.02-2.01zM4.17.1l12.49 7.21-2.79 2.79L3.18.24A1.18 1.18 0 0 1 4.17.1z"/>
              </svg>
              Google Play
            </a>
          </div>

          {/* Social proof strip */}
          <div className="flex items-center gap-3 justify-center md:justify-start flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[#800000]">✓</span>
              <span className="font-medium text-[#1d1d1f] text-sm font-body">One-time ₱129</span>
            </div>
            <span className="text-[#d2d2d7]">·</span>
            <span className="text-[#6e6e73] text-sm font-body">No subscription</span>
            <span className="text-[#d2d2d7]">·</span>
            <span className="text-[#6e6e73] text-sm font-body">Be among the first 🎉</span>
          </div>

          {/* "Try on Web" link — only rendered when NEXT_PUBLIC_WEB_APP_URL is set */}
          {webAppUrl && (
            <div className="mt-5 flex justify-center md:justify-start">
              <a
                href={webAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the Iskotify web app"
                className="inline-flex items-center gap-1.5 text-sm text-[#800000] font-medium font-body hover:underline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                Or try it on the web
              </a>
            </div>
          )}
        </div>

        {/* Right column — 3D phone mockup */}
        <div className="flex-shrink-0 flex justify-center" style={{ perspective: '1000px' }}>
          <div style={{ transform: 'rotateY(-18deg) rotateX(4deg)', transformStyle: 'preserve-3d' }}>
            {/* Phone body */}
            <div className="bg-[#0f0f1a] rounded-[40px] w-[220px] h-[460px] border-[6px] border-[#2a2a3a] shadow-2xl relative overflow-hidden">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#0f0f1a] rounded-b-[14px] z-10" />

              {/* App screen */}
              <div className="absolute inset-0 bg-[#1a1a2e] flex flex-col pt-7 px-3 pb-1 overflow-hidden">

                {/* Status bar */}
                <div className="flex justify-between items-center px-1 mb-2">
                  <span className="text-white text-[9px] font-semibold font-body">9:41</span>
                  <div className="flex gap-1 items-center">
                    <div className="w-3 h-1.5 rounded-sm bg-white/60" />
                    <div className="w-3 h-1.5 rounded-[2px] border border-white/60 relative">
                      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/60 rounded-r-sm" />
                    </div>
                  </div>
                </div>

                {/* App header: greeting + bell + gear */}
                <div className="flex items-center justify-between px-1 mb-2">
                  <div>
                    <p className="text-white font-bold text-[10px] leading-tight font-heading">Good morning! 🌤️</p>
                    <p className="text-white/50 text-[8px] font-body">Hi, Chris</p>
                  </div>
                  <div className="flex gap-1">
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" opacity="0.7" aria-hidden="true">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                    </div>
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" opacity="0.7" aria-hidden="true">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Kuya Baw AI Coach card */}
                <div className="bg-white/[0.07] rounded-[10px] p-2 mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    <Image src="/kuya-baw-mascot.svg" alt="Kuya Baw" width={32} height={32} className="object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-white text-[8px] font-bold font-heading">Kuya Baw</span>
                      <span className="bg-[#800000] text-white text-[6px] px-1 py-0.5 rounded font-body leading-none">AI Coach</span>
                    </div>
                    <p className="text-white/50 text-[7px] font-body leading-tight">Keep it up — you&apos;re on a great streak! 🔥</p>
                  </div>
                </div>

                {/* Calendar strip */}
                <div className="mb-2">
                  <p className="text-white/40 text-[7px] font-body uppercase tracking-wide mb-1 px-0.5">May 2026</p>
                  <div className="flex gap-0.5">
                    {[
                      { d: 'M', n: 19 },
                      { d: 'T', n: 20, active: true },
                      { d: 'W', n: 21 },
                      { d: 'T', n: 22, dot: true },
                      { d: 'F', n: 23 },
                      { d: 'S', n: 24 },
                      { d: 'S', n: 25 },
                    ].map((item, i) => (
                      <div key={i} className={`flex flex-col items-center rounded-[6px] flex-1 py-1 ${item.active ? 'bg-[#800000]' : ''}`}>
                        <span className="text-white/40 text-[6px] font-body">{item.d}</span>
                        <span className={`text-[8px] font-medium font-body ${item.active ? 'text-white' : 'text-white/70'}`}>{item.n}</span>
                        {item.dot && <div className="w-1 h-1 rounded-full bg-[#fca5a5] mt-0.5" />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex gap-1 mb-2">
                  <div className="flex-1 bg-[#fca5a5]/20 rounded-[8px] px-1.5 py-1.5">
                    <p className="text-[#fca5a5] text-[6px] font-body uppercase tracking-wide leading-tight">Days Left</p>
                    <p className="text-white font-bold text-[12px] font-heading">87</p>
                  </div>
                  <div className="flex-1 bg-white/[0.07] rounded-[8px] px-1.5 py-1.5">
                    <p className="text-white/40 text-[6px] font-body uppercase tracking-wide leading-tight">Accuracy</p>
                    <p className="text-white font-bold text-[12px] font-heading">72%</p>
                  </div>
                  <div className="flex-1 bg-[#fbbf24]/10 rounded-[8px] px-1.5 py-1.5">
                    <p className="text-[#fbbf24] text-[6px] font-body uppercase tracking-wide leading-tight">Streak</p>
                    <p className="text-white font-bold text-[11px] font-heading">5 🔥</p>
                  </div>
                </div>

                {/* Quick Practice */}
                <div className="bg-[#800000] rounded-[8px] py-1.5 mb-2 flex items-center justify-center">
                  <span className="text-white text-[8px] font-medium font-body">⚡ Quick Practice</span>
                </div>

                {/* Weak Areas */}
                <div className="flex-1 min-h-0">
                  <p className="text-white/40 text-[7px] font-body uppercase tracking-wide mb-1">Weak Areas</p>
                  <div className="flex flex-col gap-1.5">
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-white text-[8px] font-body">Math</span>
                        <span className="text-white/50 text-[7px] font-body">48%</span>
                      </div>
                      <div className="h-[3px] bg-white/10 rounded-full">
                        <div className="h-[3px] bg-[#800000] rounded-full w-[48%]" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-white text-[8px] font-body">Science</span>
                        <span className="text-white/50 text-[7px] font-body">61%</span>
                      </div>
                      <div className="h-[3px] bg-white/10 rounded-full">
                        <div className="h-[3px] bg-[#800000] rounded-full w-[61%]" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom nav */}
                <div className="flex justify-around items-center pt-1 pb-1 border-t border-white/[0.08] mt-1">
                  <div className="w-5 h-5 flex flex-col items-center justify-center gap-[2px]">
                    <div className="w-3 h-[2px] bg-[#800000] rounded-full" />
                    <div className="w-3 h-[2px] bg-[#800000] rounded-full" />
                    <div className="w-2 h-[2px] bg-[#800000] rounded-full" />
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                </div>
              </div>
            </div>

            {/* Subtle bottom reflection */}
            <div
              className="mx-6 h-8 rounded-b-[30px] opacity-20"
              style={{
                background: 'linear-gradient(to bottom, rgba(128,0,0,0.4), transparent)',
                filter: 'blur(8px)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Decorative background shapes */}
      <div className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-[#800000]/[0.05] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 w-[320px] h-[320px] rounded-full bg-[#800000]/[0.04] blur-2xl" />
    </section>
  )
}
