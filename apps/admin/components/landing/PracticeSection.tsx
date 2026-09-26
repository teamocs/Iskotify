import type { ReactNode } from 'react'
import {
  DiagnosticCard, FlashcardStack, MockExamScreen, Preview, ReviewSheet, SubtestResults,
} from './AppPreviews'
import { H2, LEAD, SECTION_Y, WRAP } from './styles'

type CellProps = {
  title: string; body: ReactNode; label: string; preview: ReactNode; className?: string
  /** Let the preview grow to fill a tall bento cell instead of floating at the bottom. */
  fill?: boolean
}

function Cell({ title, body, label, preview, className = '', fill = false }: CellProps) {
  return (
    <article className={`flex flex-col gap-5 rounded-lg border border-subtle bg-surface p-5 md:p-6 ${className}`}>
      <div>
        <h3 className="font-heading text-xl font-bold tracking-[-0.01em] text-ink">{title}</h3>
        <p className="mt-2 max-w-prose font-body text-sm leading-relaxed text-ink-muted">{body}</p>
      </div>
      <Preview label={label} className={fill ? 'flex flex-1 flex-col' : 'mt-auto'}>
        {preview}
      </Preview>
    </article>
  )
}

export function PracticeSection() {
  return (
    <section id="practice" aria-labelledby="practice-title" className={`bg-surface-2 ${SECTION_Y}`}>
      <div className={WRAP}>
        <h2 id="practice-title" className={`${H2} max-w-3xl`}>
          Practice that feels like exam day.
        </h2>
        <p className={LEAD}>
          Timed mock exams, subject drills, flashcards and a diagnostic, in one Practice tab. Sample screens below.
        </p>

        {/*
          Bento: 6 columns on desktop. Row 1–2: mock (4×2) beside review (2) and
          results (2). Row 3: flashcards (3) + diagnostic (3). Two columns at
          tablet width, one on phones. Dense flow, no empty cells at any width.
        */}
        <div className="mt-14 grid grid-flow-dense grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Cell
            className="md:col-span-2 lg:col-span-4 lg:row-span-2"
            fill
            title="Mock exams that save as you go"
            body={
              <>
                Full timed mocks built from each exam&apos;s blueprint. Every answer saves on your device as you go, so if
                you close the app halfway you can resume where you left off. Questions with figures and diagrams zoom
                in with a tap.
              </>
            }
            label="Sample mock exam: question 14 of 50 in Mathematics, answers saved, with a triangle figure and four choices."
            preview={<MockExamScreen />}
          />
          <Cell
            className="lg:col-span-2"
            title="Review before you submit"
            body="See every question at a glance, jump back to the ones you skipped, then submit on purpose."
            label="Sample review sheet: 20 questions, 3 unanswered and 1 flagged, with a Submit exam button."
            preview={<ReviewSheet />}
          />
          <Cell
            className="lg:col-span-2"
            title="Results per subtest"
            body="Neutral results with a per-subtest breakdown: your raw score in each part, no red-and-green verdicts."
            label="Sample results: raw scores per subtest in Mathematics, Science, Reading and Language."
            preview={<SubtestResults />}
          />
          <Cell
            className="lg:col-span-3"
            title="Flashcards with spaced review"
            body="Cards come back on a spaced schedule, right before you would forget them. Today shows how many are due."
            label="Sample flashcard: a Biology question with 12 cards due today."
            preview={<FlashcardStack />}
          />
          <Cell
            className="lg:col-span-3"
            title="A diagnostic to start from"
            body="A short diagnostic finds your starting point in each subject, so your first drills aim at the right place."
            label="Sample diagnostic card covering Mathematics, Science, Reading and Language."
            preview={<DiagnosticCard />}
          />
        </div>
      </div>
    </section>
  )
}
