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
      <section id="listings" className="bg-white py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-[#800000] mb-3">Live Opportunities</p>
            <h2 className="font-heading font-bold text-[#1d1d1f] text-3xl md:text-4xl leading-tight">
              Browse Scholarships &amp; Exams
            </h2>
            <p className="text-[#6e6e73] font-body text-base mt-3">
              Updated weekly from official sources — filtered for Filipino students.
            </p>
          </div>
        </div>
        <ListingGrid listings={listings} limit={6} />
      </section>
      <Testimonials />
      <FAQ />
      <FooterCTA />
    </div>
  )
}
