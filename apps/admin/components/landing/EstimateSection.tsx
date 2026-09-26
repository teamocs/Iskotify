import { EstimateCard, Preview, SampleCaption } from './AppPreviews'
import { H2, LEAD, SECTION_Y, WRAP } from './styles'

/*
 * Compliance framing mirrors apps/mobile (estimator compliance test): always
 * "Estimated Admission Score", always "based on historical cutoffs", never an
 * official score, a prediction, or pass/qualify language.
 */
const FACTS = [
  {
    title: 'Based on historical cutoffs',
    body: 'It compares your grades and your real practice answers with cutoffs from past years.',
  },
  {
    title: 'Computed on your phone',
    body: 'The calculation runs on your own device, using the grades you saved there.',
  },
  {
    title: 'Steadier the more you practice',
    body: 'It waits for enough answers in each subject, and firms up as you answer more.',
  },
]

export function EstimateSection() {
  return (
    <section id="estimate" aria-labelledby="estimate-title" className={`bg-surface ${SECTION_Y}`}>
      <div className={`${WRAP} grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20`}>
        <div>
          <h2 id="estimate-title" className={H2}>
            An Estimated Admission Score, with honest limits.
          </h2>
          <p className={LEAD}>
            Preparing for UPCAT? Add your grades and keep practicing, and Iskotify shows an Estimated Admission Score
            with a likely range. It is only an estimate: it cannot tell you whether you will get in, and you read a
            short disclaimer in English and Filipino before you first see it.
          </p>
          <ul className="mt-10 grid max-w-2xl gap-6 sm:grid-cols-3 lg:grid-cols-1">
            {FACTS.map(f => (
              <li key={f.title} className="border-t-2 border-maroon pt-4">
                <h3 className="font-heading text-base font-bold text-ink">{f.title}</h3>
                <p className="mt-1.5 font-body text-sm leading-relaxed text-ink-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Preview label="Sample Estimated Admission Score of 2.35 with a likely range of 2.15 to 2.55, based on historical cutoffs and computed on this device. Only an estimate.">
            <EstimateCard />
          </Preview>
          <SampleCaption>Sample values</SampleCaption>
        </div>
      </div>
    </section>
  )
}
