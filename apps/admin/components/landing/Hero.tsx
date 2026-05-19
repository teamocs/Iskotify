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

          {/* Download buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start mb-8">
            <a
              href="#download"
              className="inline-flex items-center gap-2.5 bg-[#1d1d1f] text-white rounded-xl px-6 py-3 text-sm font-medium hover:bg-black transition-colors shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Download on App Store
            </a>
            <a
              href="#download"
              className="inline-flex items-center gap-2.5 bg-[#1d1d1f] text-white rounded-xl px-6 py-3 text-sm font-medium hover:bg-black transition-colors shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3.18 23.76c.3.17.64.22.99.14l12.49-7.21-2.79-2.79-10.69 9.86zM.35 1.09A1.5 1.5 0 0 0 0 2.06v19.88a1.5 1.5 0 0 0 .35.97l.05.05 11.14-11.14v-.26L.4 1.04l-.05.05zM23.15 10.56l-2.79-1.61-3.12 3.12 3.12 3.12 2.81-1.62c.8-.46.8-1.55-.02-2.01zM4.17.1l12.49 7.21-2.79 2.79L3.18.24A1.18 1.18 0 0 1 4.17.1z"/>
              </svg>
              Get it on Google Play
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
        </div>

        {/* Right column — 3D phone mockup */}
        <div className="flex-shrink-0 flex justify-center" style={{ perspective: '1000px' }}>
          <div style={{ transform: 'rotateY(-18deg) rotateX(4deg)', transformStyle: 'preserve-3d' }}>
            {/* Phone body */}
            <div className="bg-[#0f0f1a] rounded-[40px] w-[220px] h-[460px] border-[6px] border-[#2a2a3a] shadow-2xl relative overflow-hidden">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#0f0f1a] rounded-b-[14px] z-10" />

              {/* App screen */}
              <div className="absolute inset-0 bg-[#1a1a2e] flex flex-col pt-7 px-3 pb-2 overflow-hidden">

                {/* Status bar */}
                <div className="flex justify-between items-center px-1 mb-4">
                  <span className="text-white text-[9px] font-semibold font-body">9:41</span>
                  <div className="flex gap-1 items-center">
                    <div className="w-3 h-1.5 rounded-sm bg-white/60" />
                    <div className="w-1 h-1.5 rounded-sm bg-white/60" />
                    <div className="w-3 h-1.5 rounded-[2px] border border-white/60 relative">
                      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/60 rounded-r-sm" />
                    </div>
                  </div>
                </div>

                {/* Greeting */}
                <div className="mb-3 px-1">
                  <p className="text-white font-heading font-bold text-sm leading-tight">Good morning! 🌤️</p>
                  <p className="text-white/50 text-[9px] font-body mt-0.5">1 listing in focus</p>
                </div>

                {/* Stat chips */}
                <div className="flex gap-2 mb-3 px-1">
                  <div className="bg-[#800000]/30 border border-[#800000]/50 rounded-[8px] px-2 py-1 flex items-center gap-1">
                    <span className="text-[9px]">🔥</span>
                    <span className="text-white text-[9px] font-body font-medium">5-day streak</span>
                  </div>
                  <div className="bg-white/[0.07] rounded-[8px] px-2 py-1">
                    <span className="text-white/70 text-[9px] font-body">12 sessions</span>
                  </div>
                </div>

                {/* Focus card */}
                <div className="bg-gradient-to-br from-[#800000] to-[#5a0000] rounded-[14px] p-3 mb-3 mx-1">
                  <p className="text-red-200 text-[8px] font-body uppercase tracking-wide mb-1">Your Focus</p>
                  <p className="text-white font-heading font-bold text-xs leading-tight">UPCAT 2026</p>
                  <p className="text-white/60 text-[8px] font-body mt-1">Exam date: Aug 2026</p>
                  <div className="mt-2 h-1 bg-white/10 rounded-full">
                    <div className="h-1 bg-white/50 rounded-full w-[42%]" />
                  </div>
                </div>

                {/* Recommended topics */}
                <div className="px-1 flex-1">
                  <p className="text-white/40 text-[8px] font-body uppercase tracking-wide mb-2">Recommended Topics</p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between bg-white/[0.06] rounded-[10px] px-2.5 py-2">
                      <span className="text-white text-[9px] font-body">General Math</span>
                      <div className="w-4 h-4 rounded-full bg-[#800000]/40 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[4px] border-l-white/80 border-y-[3px] border-y-transparent ml-0.5" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white/[0.06] rounded-[10px] px-2.5 py-2">
                      <span className="text-white text-[9px] font-body">Science</span>
                      <div className="w-4 h-4 rounded-full bg-[#800000]/40 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[4px] border-l-white/80 border-y-[3px] border-y-transparent ml-0.5" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom nav */}
                <div className="flex justify-around items-center pt-2 pb-1 border-t border-white/[0.08] mt-2">
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
