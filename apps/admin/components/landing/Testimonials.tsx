import React from 'react'

// Replace with live App Store / Google Play review URLs when the app is published
const APP_STORE_REVIEW_URL = '#'
const PLAY_STORE_REVIEW_URL = '#'

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
          <span className="text-5xl mb-5" aria-hidden="true">💬</span>
          <h3 className="font-heading font-bold text-[#1d1d1f] text-xl mb-3">
            Be the first to review Iskotify
          </h3>
          <p className="text-[#6e6e73] font-body text-sm leading-relaxed mb-8">
            Downloaded the app? Share your experience and help other Filipino students discover their scholarship path.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={APP_STORE_REVIEW_URL}
              className="inline-flex items-center gap-2.5 bg-[#1d1d1f] text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-black transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Leave a review on App Store
            </a>
            <a
              href={PLAY_STORE_REVIEW_URL}
              className="inline-flex items-center gap-2.5 bg-[#01875f] text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-[#016e4e] transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3.18 23.76c.3.17.64.22.99.14l12.49-7.21-2.79-2.79-10.69 9.86zM.35 1.09A1.5 1.5 0 0 0 0 2.06v19.88a1.5 1.5 0 0 0 .35.97l.05.05 11.14-11.14v-.26L.4 1.04l-.05.05zM23.15 10.56l-2.79-1.61-3.12 3.12 3.12 3.12 2.81-1.62c.8-.46.8-1.55-.02-2.01zM4.17.1l12.49 7.21-2.79 2.79L3.18.24A1.18 1.18 0 0 1 4.17.1z" />
              </svg>
              Rate on Google Play
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
