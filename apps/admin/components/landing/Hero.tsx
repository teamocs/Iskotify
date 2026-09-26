import { WEB_APP_URL } from '../../lib/links'
import { Preview, SampleCaption, TodayScreen } from './AppPreviews'
import { Android, ArrowRight } from './Icons'
import { BTN_PRIMARY, BTN_SECONDARY, WRAP } from './styles'

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="overflow-hidden bg-surface-2 pb-20 pt-12 md:pb-28 md:pt-20">
      <div className={`${WRAP} grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20`}>
        <div>
          <h1
            id="hero-title"
            className="max-w-3xl font-heading text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.03em] text-ink text-balance sm:text-6xl lg:text-7xl"
          >
            Know your <span className="text-maroon">one next step</span>, every day.
          </h1>
          <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-ink-muted text-pretty md:text-xl">
            A study coach built for UPCAT and other college entrance exams. Free entrance-exam practice and a
            scholarship finder, in one app.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href={WEB_APP_URL} className={BTN_PRIMARY}>
              Start studying free
              <ArrowRight className="size-5" />
            </a>
            <a href="#early-access" className={BTN_SECONDARY}>
              <Android className="size-5" />
              Get Android early access
            </a>
          </div>
          <p className="mt-4 font-body text-sm text-ink-muted">
            Opens in your browser, no install. The Android app is in early access.
          </p>
        </div>

        <div className="flex flex-col items-center">
          <Preview label="Sample Today screen: one next step, an Algebra drill of 15 questions, above the day's plan and an upcoming scholarship deadline.">
            <TodayScreen />
          </Preview>
          <SampleCaption />
        </div>
      </div>
    </section>
  )
}
