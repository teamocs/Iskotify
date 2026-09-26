import { Plus } from './Icons'
import { H2, SECTION_Y } from './styles'

type FAQItem = { question: string; answer: string }

// Answers follow the current app (Today · Practice · Explore · Progress) and
// the mobile Help screen. No admission promises; the estimate stays an estimate.
export const faqs: FAQItem[] = [
  {
    question: 'How much does Iskotify cost?',
    answer:
      'It is free during Early Access: no subscription and no hidden fees. You can start studying in your browser right now.',
  },
  {
    question: 'Which exams can I practice for?',
    answer:
      'Iskotify is built around UPCAT, and its mock exams follow the blueprints of other college entrance exams too, such as ACET, DCAT and USTET. Pick the ones you are taking during setup, and Today paces your practice to your exam date.',
  },
  {
    question: 'Is the Estimated Admission Score my real score?',
    answer:
      'No. It is an estimate based on historical cutoffs, your grades and your practice answers, computed on your device. It cannot tell you whether you will get in, and it gets steadier the more questions you answer in each subject.',
  },
  {
    question: 'What happens if I leave a mock exam halfway?',
    answer:
      'Your answers are saved on your device as you go. Open the same mock exam again and choose Resume to pick up where you left off.',
  },
  {
    question: 'Can I use Iskotify offline?',
    answer:
      'Yes, on the Android app: practice questions, flashcards and your progress are stored on your phone. Connect now and then to get new questions and updates. The web app needs a connection to open.',
  },
  {
    question: 'Will I lose my progress if I change phones?',
    answer:
      'Not if you sign in. Sign in with Google and your progress is backed up to your account; sign in on the new phone and it comes back.',
  },
  {
    question: 'Which scholarships are listed?',
    answer:
      'Government scholarships such as CHED and DOST, plus private and school grants, gathered from official sources. Explore shows the ones that match your course, school and province.',
  },
  {
    question: 'How do I get the app?',
    answer:
      'Use it in any browser at app.iskotify.ph, on your phone, tablet or computer. The Android app is in early access and not yet on the Play Store: sign up below and we will email it to you. iOS is not available yet.',
  },
]

export function FAQ() {
  return (
    <section id="faq" aria-labelledby="faq-title" className={`bg-surface ${SECTION_Y}`}>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <h2 id="faq-title" className={H2}>
          Questions students ask
        </h2>

        <div className="mt-10 border-t border-subtle">
          {faqs.map(item => (
            <details key={item.question} className="group border-b border-subtle">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-heading text-lg font-semibold text-ink transition-colors hover:text-maroon [&::-webkit-details-marker]:hidden">
                {item.question}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-pill border border-strong text-ink-muted transition-transform duration-200 group-open:rotate-45 group-open:border-maroon group-open:text-maroon">
                  <Plus className="size-4" />
                </span>
              </summary>
              <p className="max-w-prose pb-6 font-body text-base leading-relaxed text-ink-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
