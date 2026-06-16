// Pre-launch: reviews open once Iskotify ships to the stores. Until then, route
// feedback to the team inbox so early users can still shape the app.
const FEEDBACK_EMAIL = 'teamocsph@gmail.com'
const FEEDBACK_URL = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Iskotify feedback')}`

export function Testimonials() {
  return (
    <section id="testimonials" className="bg-white py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">
            Student Reviews
          </p>
          <h2 className="font-heading font-bold text-[#1d1d1f] text-3xl md:text-4xl leading-tight">
            What Students Are Saying
          </h2>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center text-center max-w-md mx-auto py-6">
          <span
            className="w-14 h-14 rounded-2xl bg-[#800000]/[0.08] flex items-center justify-center mb-5"
            aria-hidden="true"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#800000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 0 1-1-4A8.38 8.38 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5z" />
            </svg>
          </span>
          <h3 className="font-heading font-bold text-[#1d1d1f] text-xl mb-3">
            Be the first to review Iskotify
          </h3>
          <p className="text-[#6e6e73] font-body text-sm leading-relaxed mb-8">
            We&apos;re in Early Access. Try Iskotify and tell us what you think — your feedback helps shape the app for fellow Iskolars.
          </p>
          <a
            href={FEEDBACK_URL}
            aria-label="Share your feedback with the Iskotify team"
            className="inline-flex items-center gap-2.5 bg-[#800000] text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-[#a00000] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4h16v12H5.17L4 17.17z" /><path d="M8 9h8M8 12h5" />
            </svg>
            Share your feedback
          </a>
        </div>
      </div>
    </section>
  )
}
