import { createServerClient } from '@iskotify/utils'
import { Nav } from '@/components/landing/Nav'
import { ListingGrid } from '@/components/landing/ListingGrid'
import { FooterCTA } from '@/components/landing/FooterCTA'
import type { Listing } from '@iskotify/utils'

export const revalidate = 3600

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

export default async function ListingsPage() {
  const listings = await getListings()

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Nav />

      {/* Page hero */}
      <section className="bg-white border-b border-black/[0.06] py-14 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">
            Live Opportunities
          </p>
          <h1 className="font-heading font-extrabold text-[#1d1d1f] text-4xl md:text-5xl leading-tight mb-4">
            All Scholarships &amp; Exams
          </h1>
          <p className="text-[#6e6e73] font-body text-base max-w-xl mx-auto">
            Browse every active opportunity — scholarships, grants, and qualifying exams updated weekly from official sources.
          </p>
        </div>
      </section>

      {/* Full listing grid with filters */}
      <main className="py-8">
        <ListingGrid listings={listings} />
      </main>

      <FooterCTA />
    </div>
  )
}
