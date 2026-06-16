import type { ReactNode } from 'react'

type Step = {
  number: string
  title: string
  description: string
  icon: ReactNode
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: '#800000',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const steps: Step[] = [
  {
    number: '01',
    title: 'Tell us about yourself',
    description:
      'Add your name, school or university, and grade level (Philippine K–12, Grade 9–12). This personalizes everything that follows.',
    icon: (
      <svg {...iconProps}>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    number: '02',
    title: "Pick what you're preparing for",
    description:
      'Search and select your target university entrance exams — ranked smartly, with top national schools first, then schools in your region — plus any scholarships you’re eyeing.',
    icon: (
      <svg {...iconProps}>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Choose your target courses',
    description:
      'Pick up to 3 courses you’re considering. Iskotify recommends courses based on the exams and universities you selected.',
    icon: (
      <svg {...iconProps}>
        <path d="M22 10 12 5 2 10l10 5 10-5Z" />
        <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Match scholarships to you',
    description:
      'Add your household income bracket, GWA, and province so Iskotify can show which scholarships you actually qualify for. All optional.',
    icon: (
      <svg {...iconProps}>
        <path d="M12 2 4 6v6c0 5 3.4 7.7 8 10 4.6-2.3 8-5 8-10V6l-8-4Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    number: '05',
    title: 'Take a quick pre-assessment',
    description:
      'A short diagnostic calibrates your starting level per subject, so your reviewers and practice are tailored from day one.',
    icon: (
      <svg {...iconProps}>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#f5f5f7] py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">
            Getting Started
          </p>
          <h2 className="font-heading font-bold text-[#1d1d1f] text-3xl md:text-4xl leading-tight">
            Your first few minutes in Iskotify
          </h2>
          <p className="text-[#6e6e73] font-body text-base md:text-lg leading-relaxed mt-4 max-w-2xl mx-auto">
            A guided setup mirrors the real onboarding flow — then you land on a dashboard built around your goals.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
          {steps.map((step) => (
            <div key={step.number} className="relative">
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-heading font-extrabold text-[#800000]/20 text-7xl leading-none select-none">
                    {step.number}
                  </span>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#800000]/10">
                    {step.icon}
                  </span>
                </div>
                <h3 className="font-heading font-bold text-[#1d1d1f] text-xl mb-3">{step.title}</h3>
                <p className="text-[#6e6e73] font-body text-sm leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
