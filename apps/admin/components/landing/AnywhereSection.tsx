import { Access, Cloud, Devices, Route, Wifi } from './Icons'
import { SECTION_Y, WRAP } from './styles'

const ITEMS = [
  {
    icon: Wifi,
    title: 'Works offline on Android',
    body: 'On the Android app, questions, flashcards and your progress live on your phone, so you can study without data. The web app needs a connection to open, then saves your answers as you go.',
  },
  {
    icon: Cloud,
    title: 'Backed up to your account',
    body: 'Sign in with Google and your progress is backed up to your account. Change phones and it comes back.',
  },
  {
    icon: Devices,
    title: 'Phone, tablet and desktop',
    body: 'One app that fits your screen, from a small phone to a laptop browser.',
  },
  {
    icon: Access,
    title: 'Built to be accessible',
    body: 'Works with screen readers and larger text sizes, with big tap targets and clear contrast.',
  },
  {
    icon: Route,
    title: 'A guided tour to start',
    body: 'Setup asks a few short questions about you and your goal. Then a one-minute guided tour shows you Today, Practice, Explore and Progress. Replay it anytime from Help.',
  },
]

export function AnywhereSection() {
  return (
    <section id="anywhere" aria-labelledby="anywhere-title" className={`bg-ink ${SECTION_Y}`}>
      <div className={WRAP}>
        <h2
          id="anywhere-title"
          className="max-w-3xl font-heading text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-ink-inverse text-balance md:text-5xl"
        >
          Study on the bus, at night, on whatever you have.
        </h2>
        <ul className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(({ icon: I, title, body }) => (
            <li key={title} className="border-t border-ink-inverse/15 pt-6 last:sm:col-span-2 last:lg:col-span-2">
              <I className="size-6 text-ink-inverse" />
              <h3 className="mt-4 font-heading text-lg font-bold text-ink-inverse">{title}</h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-ink-inverse/75">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
