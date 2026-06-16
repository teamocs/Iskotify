import { createServerClient } from '@iskotify/utils'
import { Nav } from '@/components/landing/Nav'
import { ListingsExplorer } from '@/components/landing/ListingsExplorer'
import { FooterCTA } from '@/components/landing/FooterCTA'
import { aggregateDestinationCountries, type CountryWithCount } from '@/lib/destinations'
import type { Listing } from '@iskotify/utils'

export const revalidate = 3600

type Course = { courseId: string; name: string; cluster: string }
type Destination = CountryWithCount

async function getListings(): Promise<Listing[]> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('listings')
      .select('id, title, slug, type, status, provider, region, grant_amount, coverage, deadline, exam_date, external_url')
      .order('deadline', { ascending: true, nullsFirst: false })
    return (data as Listing[]) ?? []
  } catch {
    return []
  }
}

async function getCourses(): Promise<Course[]> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('career_courses')
      .select('course_id, name, cluster')
      .order('name', { ascending: true })
    const rows = (data as { course_id: string | null; name: string | null; cluster: string | null }[]) ?? []
    return rows
      .filter((r): r is { course_id: string; name: string; cluster: string } => !!r.course_id && !!r.name && !!r.cluster)
      .map((r) => ({ courseId: r.course_id, name: r.name, cluster: r.cluster }))
  } catch {
    return []
  }
}

async function getDestinations(): Promise<Destination[]> {
  try {
    const supabase = createServerClient()
    const [destRes, countryRes] = await Promise.all([
      supabase.from('career_destinations').select('course_id, country'),
      supabase.from('career_countries').select('code, name, region'),
    ])

    const destRows =
      (destRes.data as { course_id: string | null; country: string | null }[]) ?? []
    const countryRows =
      (countryRes.data as { code: string | null; name: string | null; region: string | null }[]) ?? []

    const countries = countryRows
      .filter((c): c is { code: string; name: string | null; region: string | null } => !!c.code)
      .map((c) => ({ code: c.code, name: c.name ?? c.code, region: c.region ?? '' }))
    const dests = destRows
      .filter((d): d is { course_id: string; country: string } => !!d.course_id && !!d.country)
      .map((d) => ({ courseId: d.course_id, country: d.country }))

    // Normalize qualified country names ("Canada (PNP/EE)") to the canonical
    // career_countries.code before counting DISTINCT courses — mirrors the mobile
    // "Lists" screen so one country = one card with the correct demand count.
    return aggregateDestinationCountries(countries, dests)
  } catch {
    return []
  }
}

export default async function ListingsPage() {
  const [listings, courses, destinations] = await Promise.all([
    getListings(),
    getCourses(),
    getDestinations(),
  ])

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Nav />

      {/* Page hero */}
      <section className="bg-white border-b border-black/[0.06] py-14 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">
            Explore Iskotify
          </p>
          <h1 className="font-heading font-extrabold text-[#1d1d1f] text-4xl md:text-5xl leading-tight mb-4">
            Lists
          </h1>
          <p className="text-[#6e6e73] font-body text-base max-w-xl mx-auto">
            Universities, scholarships, courses &amp; career destinations — everything you can
            explore in the Iskotify app.
          </p>
        </div>
      </section>

      {/* 4-tab explorer mirroring the mobile "Lists" screen */}
      <main className="py-8">
        <ListingsExplorer listings={listings} courses={courses} destinations={destinations} />
      </main>

      <FooterCTA />
    </div>
  )
}
