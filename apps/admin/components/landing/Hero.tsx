import Image from 'next/image'
import { ANDROID_APP_URL, WEB_APP_URL } from '../../lib/links'

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

          {/* Primary CTAs — start the free Android trial, or open the web app */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start mb-7">
            <a
              href={ANDROID_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Start your free Iskotify trial on Android"
              className="inline-flex items-center justify-center gap-2 bg-[#800000] text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-[#a00000] transition-colors shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3.18 23.76c.3.17.64.22.99.14l12.49-7.21-2.79-2.79-10.69 9.86zM.35 1.09A1.5 1.5 0 0 0 0 2.06v19.88a1.5 1.5 0 0 0 .35.97l.05.05 11.14-11.14v-.26L.4 1.04l-.05.05zM23.15 10.56l-2.79-1.61-3.12 3.12 3.12 3.12 2.81-1.62c.8-.46.8-1.55-.02-2.01zM4.17.1l12.49 7.21-2.79 2.79L3.18.24A1.18 1.18 0 0 1 4.17.1z" />
              </svg>
              Start for free
            </a>
            <a
              href={WEB_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the Iskotify web app"
              className="inline-flex items-center justify-center gap-2 border border-[#800000] text-[#800000] rounded-xl px-6 py-3 text-sm font-medium hover:bg-[#800000]/[0.06] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Try on Web
            </a>
          </div>

          {/* Social proof strip */}
          <div className="flex items-center gap-3 justify-center md:justify-start flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[#800000]">✓</span>
              <span className="font-medium text-[#1d1d1f] text-sm font-body">Free on Early access</span>
            </div>
            <span className="text-[#d2d2d7]">·</span>
            <span className="text-[#6e6e73] text-sm font-body">No subscription</span>
            <span className="text-[#d2d2d7]">·</span>
            <span className="text-[#6e6e73] text-sm font-body">Be among the first 🎉</span>
          </div>
        </div>

        {/* Right column — 3D phone mockup mirroring the current Home dashboard */}
        <div className="flex-shrink-0 flex justify-center" style={{ perspective: '1000px' }}>
          <div style={{ transform: 'rotateY(-18deg) rotateX(4deg)', transformStyle: 'preserve-3d' }}>
            {/* Phone body */}
            <div className="bg-[#0f0f1a] rounded-[40px] w-[220px] h-[460px] border-[6px] border-[#2a2a3a] shadow-2xl relative overflow-hidden">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#0f0f1a] rounded-b-[14px] z-10" />

              {/* App screen — light theme (the app's default look) */}
              <div className="absolute inset-0 bg-[#faf7f5] flex flex-col pt-7 px-2.5 pb-0 overflow-hidden">

                {/* Status bar */}
                <div className="flex justify-between items-center px-1 mb-1.5">
                  <span className="text-[#1d1d1f] text-[9px] font-semibold font-body">9:41</span>
                  <div className="flex gap-1 items-center">
                    <div className="w-3 h-1.5 rounded-sm bg-[#1d1d1f]/50" />
                    <div className="w-3 h-1.5 rounded-[2px] border border-[#1d1d1f]/50 relative">
                      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-[#1d1d1f]/50 rounded-r-sm" />
                    </div>
                  </div>
                </div>

                {/* (1) Header row: logo tile (left) + action tiles (right) */}
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-[8px] bg-white border border-black/[0.06] flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <Image src="/logo.svg" alt="Iskotify" width={16} height={16} className="rounded-[4px]" />
                  </div>
                  <div className="flex gap-1.5">
                    {/* Bell (notifications — "on" = maroon) */}
                    <div className="w-7 h-7 rounded-[8px] bg-white border border-black/[0.06] flex items-center justify-center">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#800000" strokeWidth="2.2" aria-hidden="true">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </div>
                    {/* Profile */}
                    <div className="w-7 h-7 rounded-[8px] bg-white border border-black/[0.06] flex items-center justify-center">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="2.2" aria-hidden="true">
                        <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                      </svg>
                    </div>
                    {/* Settings */}
                    <div className="w-7 h-7 rounded-[8px] bg-white border border-black/[0.06] flex items-center justify-center">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="2.2" aria-hidden="true">
                        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* (1b) Date + greeting */}
                <p className="text-[#8a8a8e] text-[6px] font-semibold font-body uppercase tracking-[0.12em] mb-0.5">Monday, June 16</p>
                <p className="text-[#1d1d1f] text-[13px] font-body leading-tight mb-2">
                  Good morning, <span className="font-extrabold font-heading">Chris</span>!
                </p>

                {/* (2) Hero band — full-bleed maroon stripe with Kuya Baw + speech bubble */}
                <div className="relative -mx-2.5 h-[62px] mb-2">
                  <div className="absolute left-0 right-0 bottom-0 h-[50px] bg-[#800000]/95" />
                  <Image
                    src="/kuya-baw-waving.png"
                    alt="Kuya Baw"
                    width={46}
                    height={46}
                    className="absolute left-2 bottom-0 object-contain drop-shadow"
                  />
                  <div className="absolute left-[58px] right-2.5 top-1 bottom-1.5 bg-white rounded-[9px] border border-black/[0.05] px-1.5 py-1 flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.10)]">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[#800000] text-[7px] font-bold font-heading">Kuya Baw</span>
                      <span className="ml-auto bg-[#800000]/[0.08] border border-[#800000]/25 text-[#800000] text-[5px] px-1 py-px rounded font-body leading-none">AI Coach</span>
                    </div>
                    <p className="text-[#1d1d1f] text-[6px] font-body leading-[1.35]">Tara, let&apos;s review Math today — you&apos;ve got this! 💪</p>
                    <span className="mt-auto self-end text-[#800000] text-[5px] font-semibold font-body">Ask Kuya Baw ›</span>
                  </div>
                </div>

                {/* (3) Explore — 2×2 quick-links into the Lists tabs */}
                <p className="text-[#1d1d1f] text-[7px] font-bold font-heading mb-1">Explore</p>
                <div className="grid grid-cols-2 gap-1 mb-2">
                  {[
                    { e: '🎓', l: 'Universities' },
                    { e: '🏅', l: 'Scholarships' },
                    { e: '📈', l: 'Courses' },
                    { e: '🌏', l: 'Destinations' },
                  ].map((it) => (
                    <div key={it.l} className="flex items-center gap-1 bg-white border border-black/[0.06] rounded-[7px] px-1.5 py-1">
                      <span className="text-[8px] leading-none">{it.e}</span>
                      <span className="text-[#1d1d1f] text-[6px] font-body font-medium">{it.l}</span>
                    </div>
                  ))}
                </div>

                {/* (4) My Focus — readiness progress-bar cards + add-target ghost */}
                <p className="text-[#1d1d1f] text-[7px] font-bold font-heading mb-1">My Focus</p>
                <div className="flex flex-col gap-1 mb-2">
                  {[
                    { t: 'UPCAT', sub: '57 days · exam', pct: 72, w: 'w-[72%]', fill: 'bg-[#16a34a]/15', color: 'text-[#16a34a]' },
                    { t: 'DOST-SEI', sub: '21 days · scholarship', pct: 45, w: 'w-[45%]', fill: 'bg-[#d97706]/15', color: 'text-[#d97706]' },
                  ].map((f) => (
                    <div key={f.t} className="relative overflow-hidden bg-white border border-black/[0.06] rounded-[8px] px-1.5 py-1.5">
                      <div className={`absolute left-0 top-0 bottom-0 ${f.w} ${f.fill}`} />
                      <div className="relative flex items-center gap-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-[#1d1d1f] text-[7px] font-body font-semibold leading-tight truncate">{f.t}</p>
                          <p className="text-[#8a8a8e] text-[5px] font-body leading-tight">{f.sub}</p>
                        </div>
                        <span className={`text-[10px] font-extrabold font-heading ${f.color}`}>{f.pct}%</span>
                      </div>
                    </div>
                  ))}
                  <div className="border border-dashed border-black/15 rounded-[8px] py-1 flex items-center justify-center">
                    <span className="text-[#8a8a8e] text-[6px] font-body font-semibold">＋ Add exam or scholarship</span>
                  </div>
                </div>

                {/* (5) Subjects to improve — vertical readiness fill, distinct color per subject */}
                <p className="text-[#1d1d1f] text-[7px] font-bold font-heading mb-1">Subjects to improve</p>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { n: 'Math', pct: 48, h: 'h-[48%]', dot: 'bg-[#3b82f6]', fill: 'bg-[#3b82f6]/15' },
                    { n: 'Science', pct: 61, h: 'h-[61%]', dot: 'bg-[#8b5cf6]', fill: 'bg-[#8b5cf6]/15' },
                    { n: 'Reading', pct: 55, h: 'h-[55%]', dot: 'bg-[#0d9488]', fill: 'bg-[#0d9488]/15' },
                  ].map((sub) => (
                    <div key={sub.n} className="relative overflow-hidden bg-white border border-black/[0.06] rounded-[7px] h-[40px] p-1 flex flex-col justify-between">
                      <div className={`absolute left-0 right-0 bottom-0 ${sub.h} ${sub.fill}`} />
                      <div className={`relative w-1.5 h-1.5 rounded-full ${sub.dot}`} />
                      <span className="relative text-[#1d1d1f] text-[6px] font-body font-semibold">{sub.n}</span>
                      <span className="relative text-[#1d1d1f] text-[8px] font-extrabold font-heading leading-none">{sub.pct}%</span>
                    </div>
                  ))}
                </div>

                {/* (6) Bottom nav — Home / Review / [Ask Kuya Baw] / Exams / Updates */}
                <div className="mt-auto flex justify-around items-center pt-1 pb-1 border-t border-black/[0.06]">
                  {/* Home (active) */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#800000" strokeWidth="2.4" aria-hidden="true">
                    <path d="M3 11l9-8 9 8M5 10v10h14V10" />
                  </svg>
                  {/* Review */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b0b0b5" strokeWidth="2.2" aria-hidden="true">
                    <path d="M4 5h16M4 12h16M4 19h10" />
                  </svg>
                  {/* Center: Ask Kuya Baw (raised maroon) */}
                  <div className="w-6 h-6 -mt-3 rounded-full bg-[#800000] flex items-center justify-center shadow-md">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" aria-hidden="true">
                      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 0 1-1-4A8.38 8.38 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5z" />
                    </svg>
                  </div>
                  {/* Exams */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b0b0b5" strokeWidth="2.2" aria-hidden="true">
                    <path d="M6 2h9l5 5v15H6zM14 2v6h6" />
                  </svg>
                  {/* Updates */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b0b0b5" strokeWidth="2.2" aria-hidden="true">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
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
