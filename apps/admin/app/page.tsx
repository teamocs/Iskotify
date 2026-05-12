import { createServerClient } from '@iskotify/utils'
import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { KuyaBawCTA } from '@/components/landing/KuyaBawCTA'
import { ListingGrid } from '@/components/landing/ListingGrid'
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

export default async function HomePage() {
  const listings = await getListings()
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Nav />
      <Hero />
      <main id="listings">
        <ListingGrid listings={listings} />
      </main>
      <KuyaBawCTA />
    </div>
  )
}
