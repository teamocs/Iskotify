type Step = {
  number: string
  title: string
  description: string
}

const steps: Step[] = [
  {
    number: '01',
    title: 'Pick Your Goals',
    description:
      'Choose the scholarships and exams you\'re targeting. Iskotify builds your personalized dashboard so you always know what\'s coming up.',
  },
  {
    number: '02',
    title: 'Study with Flashcards',
    description:
      'Practice with AI-generated MCQ flashcards. Track your weak spots and improve daily with spaced repetition science.',
  },
  {
    number: '03',
    title: 'Never Miss a Deadline',
    description:
      'Get reminders for scholarship deadlines and exam dates automatically — so you can focus on studying, not calendar watching.',
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
            Ready in 3 Simple Steps
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {/* Connector line (desktop only, between steps) */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-8 left-[calc(100%+20px)] right-[-20px] h-[1px] bg-gradient-to-r from-[#800000]/30 to-transparent w-[calc(100%-40px)] z-0" />
              )}

              <div className="relative z-10">
                <span className="font-heading font-extrabold text-[#800000]/20 text-7xl leading-none block mb-4 select-none">
                  {step.number}
                </span>
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
