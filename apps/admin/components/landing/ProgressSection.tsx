import { Preview, ProgressPanel, SampleCaption } from './AppPreviews'
import { Pencil } from './Icons'
import { H2, LEAD, SECTION_Y, WRAP } from './styles'

export function ProgressSection() {
  return (
    <section id="progress" aria-labelledby="progress-title" className={`bg-surface ${SECTION_Y}`}>
      <div className={WRAP}>
        <h2 id="progress-title" className={`${H2} max-w-3xl`}>
          See what&apos;s getting better.
        </h2>
        <p className={LEAD}>
          Progress shows readiness by subject from your real answers, plus the stats and trends behind it: how many
          you have answered, your time per question, and how your accuracy moves week to week.
        </p>

        <div className="mt-14">
          <Preview label="Sample progress: readiness by subject from 48 to 72 percent, and an accuracy trend rising over eight weeks.">
            <ProgressPanel />
          </Preview>
          <SampleCaption>Sample values</SampleCaption>
        </div>

        <div className="mt-12 flex flex-col gap-5 rounded-lg bg-surface-2 p-6 sm:flex-row sm:items-start md:p-8">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-surface text-maroon">
            <Pencil className="size-6" />
          </span>
          <div>
            <h3 className="font-heading text-xl font-bold text-ink">Notes, next to your practice</h3>
            <p className="mt-2 max-w-2xl font-body text-base leading-relaxed text-ink-muted">
              Write down the formula you keep forgetting or the tip from your reviewer. Label notes by subject, archive
              the old ones, and set a reminder to look again before the exam.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
