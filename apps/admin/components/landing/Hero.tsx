export function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-[#800000] via-[#a00000] to-[#600000] py-16 px-6 text-center overflow-hidden">
      <div className="absolute right-8 bottom-0 text-[8rem] opacity-[0.12] select-none pointer-events-none">🦜</div>
      <p className="text-xs tracking-[0.12em] text-red-300 font-semibold uppercase mb-2">
        Para sa mga Iskolar ng Bayan
      </p>
      <h1 className="font-heading font-extrabold text-white text-4xl md:text-5xl leading-tight tracking-tight mb-3">
        Find Scholarships &<br />Ace Your Exams
      </h1>
      <p className="text-red-200 text-base mb-8 max-w-md mx-auto">
        Iskotify tracks every scholarship and qualifying exam deadline so you don't miss your shot.
      </p>
      <div className="flex gap-3 justify-center">
        <a
          href="#listings"
          className="bg-white text-[#800000] rounded-[980px] px-6 py-2.5 text-sm font-semibold hover:bg-red-50 transition-colors shadow-sm"
        >
          Browse Scholarships
        </a>
        <a
          href="#download"
          className="bg-white/15 border border-white/30 text-white rounded-[980px] px-6 py-2.5 text-sm font-medium hover:bg-white/25 transition-colors"
        >
          Download App
        </a>
      </div>
    </section>
  )
}
