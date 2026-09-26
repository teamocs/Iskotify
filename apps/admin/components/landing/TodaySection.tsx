import { ArrowRight, Calendar, Chart, Flag } from './Icons'
import { H2, LEAD, SECTION_Y, WRAP } from './styles'

const INPUTS = [
  { icon: Calendar, title: 'Your exam date', body: 'How many days you have left, so the pace fits.' },
  { icon: Flag, title: 'Your focus', body: 'The entrance exams and scholarships you chose to follow.' },
  { icon: Chart, title: 'What you have practiced', body: 'Which subjects need work, and which flashcards are due.' },
]

export function TodaySection() {
  return (
    <section id="today" aria-labelledby="today-title" className={`bg-surface ${SECTION_Y}`}>
      <div className={WRAP}>
        <h2 id="today-title" className={`${H2} max-w-3xl`}>
          Open the app. Do one thing. You&apos;re on pace.
        </h2>
        <p className={LEAD}>
          Reviewing for college entrance exams is a lot to hold in your head. Today does the planning: it weighs three
          things and hands you a single action, with the screen&apos;s only big button. Finish it, and the next one is ready.
        </p>

        {/* The mechanism: three inputs resolve into One Next Step. */}
        <div className="mt-14 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_minmax(0,22rem)] lg:gap-6">
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {INPUTS.map(({ icon: I, title, body }) => (
              <li key={title} className="flex gap-4 rounded-md border border-subtle bg-surface-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-maroon-dim text-maroon">
                  <I className="size-5" />
                </span>
                <div>
                  <h3 className="font-heading text-base font-bold text-ink">{title}</h3>
                  <p className="mt-1 font-body text-sm leading-relaxed text-ink-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-center text-maroon" aria-hidden="true">
            <ArrowRight className="size-8 rotate-90 lg:rotate-0" />
          </div>

          <div className="flex flex-col justify-center rounded-lg bg-maroon p-7 text-ink-inverse shadow-card">
            <p className="font-heading text-sm font-semibold text-ink-inverse/80">One Next Step</p>
            <p className="mt-3 font-heading text-3xl font-bold leading-tight tracking-[-0.02em]">
              One action, picked for today.
            </p>
            <p className="mt-3 font-body text-sm leading-relaxed text-ink-inverse/85">
              A drill, a mock exam, or the flashcards due today. Below it: your plan for the day, your exam countdown,
              and deadlines coming up.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
