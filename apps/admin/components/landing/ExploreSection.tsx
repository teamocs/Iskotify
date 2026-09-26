import type { Listing } from '@iskotify/utils'
import { Award, Book, Calendar, Plane, School } from './Icons'
import { ListingGrid } from './ListingGrid'
import { H2, LEAD, SECTION_Y, WRAP } from './styles'

const AREAS = [
  { icon: School, title: 'Schools & exams', body: 'Entrance exams and the schools behind them, with their dates.' },
  { icon: Award, title: 'Scholarships', body: 'Grants matched to your course, school and province.' },
  { icon: Book, title: 'Courses', body: 'College courses by field, and how AI is changing each one.' },
  { icon: Plane, title: 'Destinations', body: 'Countries where each course is in demand abroad.' },
  { icon: Calendar, title: 'News & dates', body: 'Admission news and deadlines, so nothing slips past.' },
]

export function ExploreSection({ listings }: { listings: Listing[] }) {
  return (
    <section id="explore" aria-labelledby="explore-title" className={`bg-surface-2 ${SECTION_Y}`}>
      <div className={WRAP}>
        <h2 id="explore-title" className={`${H2} max-w-3xl`}>
          Find your schools, exams and scholarships.
        </h2>
        <p className={LEAD}>
          Explore keeps the decisions next to the studying. Add an exam or scholarship to your focus and its countdown
          shows up on Today.
        </p>

        <ul className="mt-12 grid gap-px overflow-hidden rounded-lg border border-subtle bg-neutral-soft sm:grid-cols-2 lg:grid-cols-5">
          {AREAS.map(({ icon: I, title, body }) => (
            <li key={title} className="bg-surface p-5 last:sm:col-span-2 last:lg:col-span-1">
              <I className="size-6 text-maroon" />
              <h3 className="mt-4 font-heading text-base font-bold text-ink">{title}</h3>
              <p className="mt-1 font-body text-sm leading-relaxed text-ink-muted">{body}</p>
            </li>
          ))}
        </ul>

        <h3 className="mt-16 font-heading text-2xl font-bold tracking-[-0.01em] text-ink">Open right now</h3>
        <p className="mt-2 font-body text-base text-ink-muted">
          Live scholarships and entrance exams, updated from official sources.
        </p>
      </div>
      <ListingGrid listings={listings} limit={6} />
    </section>
  )
}
