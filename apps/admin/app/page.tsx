import { createServerClient } from '@iskotify/utils'
import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { ListingGrid } from '@/components/landing/ListingGrid'
import { Testimonials } from '@/components/landing/Testimonials'
import { FAQ } from '@/components/landing/FAQ'
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

export default async function HomePage() {
  const listings = await getListings()
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <main id="listings">
        <div className="max-w-6xl mx-auto px-6 pt-10 pb-4">
          <h2 className="font-heading font-bold text-2xl text-[#1d1d1f]">Browse Scholarships &amp; Exams</h2>
          <p className="text-sm text-[#6e6e73] mt-1 mb-2">Updated weekly from official sources</p>
        </div>
        <ListingGrid listings={listings} />
      </main>
      <Testimonials />
      <FAQ />
      <FooterCTA />
    </div>
  )
}
