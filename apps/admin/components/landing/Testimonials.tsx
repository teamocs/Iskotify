type Testimonial = {
  quote: string
  name: string
  detail: string
}

const testimonials: Testimonial[] = [
  {
    quote:
      'Nakakuha ako ng DOST scholarship dahil sa Iskotify! Hindi ko napalampas ang deadline ng application.',
    name: 'Maria Santos',
    detail: 'BS Computer Science, UP Diliman',
  },
  {
    quote:
      'The UPCAT flashcards are so helpful. Nag-improve ang score ko from 60% to 85% in 2 weeks!',
    name: 'Juan dela Cruz',
    detail: 'Grade 12, Quezon City',
  },
  {
    quote:
      'Kuya Baw explained difficult Math concepts better than my review center. And it\'s FREE!',
    name: 'Ana Reyes',
    detail: 'BS Nursing Applicant',
  },
]

function StarRating() {
  return (
    <div className="flex gap-0.5 mb-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-white rounded-[20px] p-6 border border-[#f0f0f0] shadow-[0_8px_32px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] flex flex-col"
            >
              <StarRating />
              <blockquote className="flex-1 text-[#1d1d1f] text-sm font-body italic leading-relaxed mb-5">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="border-t border-[#f5f5f7] pt-4">
                <p className="font-heading font-bold text-[#1d1d1f] text-sm">{t.name}</p>
                <p className="text-[#6e6e73] text-xs font-body mt-0.5">{t.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
