import type { Metadata, Viewport } from 'next'
import { createServerClient } from '@iskotify/utils'
import type { Listing } from '@iskotify/utils'
import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { TodaySection } from '@/components/landing/TodaySection'
import { PracticeSection } from '@/components/landing/PracticeSection'
import { EstimateSection } from '@/components/landing/EstimateSection'
import { ExploreSection } from '@/components/landing/ExploreSection'
import { ProgressSection } from '@/components/landing/ProgressSection'
import { AnywhereSection } from '@/components/landing/AnywhereSection'
import { FAQ } from '@/components/landing/FAQ'
import { EarlyAccessForm } from '@/components/landing/EarlyAccessForm'
import { FooterCTA } from '@/components/landing/FooterCTA'
import { H2, SECTION_Y, WRAP } from '@/components/landing/styles'

export const revalidate = 3600

const TITLE = 'Iskotify: free UPCAT and entrance-exam practice, plus a scholarship finder'
const DESCRIPTION =
  'Know your one next step every day. Free mock exams, flashcards and a diagnostic for UPCAT and other college entrance exams, plus scholarships, schools and deadlines, in one app. Para sa mga Iskolar ng Bayan.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Iskotify',
    type: 'website',
    locale: 'en_PH',
    images: [{ url: '/icon.png', width: 1024, height: 1024, alt: 'Iskotify' }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: 'Free UPCAT and entrance-exam practice plus a scholarship finder. Para sa mga Iskolar ng Bayan.',
    images: ['/icon.png'],
  },
}

// Browser chrome matches the hero's surface-2 ground.
export const viewport: Viewport = { themeColor: '#f5f5f7' }

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
    <div className="min-h-screen bg-surface-2">
      <Nav />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <Hero />
        <TodaySection />
        <PracticeSection />
        <EstimateSection />
        <ExploreSection listings={listings} />
        <ProgressSection />
        <AnywhereSection />
        <FAQ />
        <section id="early-access" aria-labelledby="early-access-title" className={`bg-surface-2 ${SECTION_Y}`}>
          <div className={`${WRAP} flex flex-col items-center text-center`}>
            <h2 id="early-access-title" className={H2}>
              Want it as an Android app?
            </h2>
            <p className="mb-8 mt-4 max-w-xl font-body text-base leading-relaxed text-ink-muted md:text-lg">
              The web app works on any phone today. If you would rather install Iskotify on Android, request early
              access below.
            </p>
            <div className="w-full text-left">
              <EarlyAccessForm />
            </div>
          </div>
        </section>
      </main>
      <FooterCTA />
    </div>
  )
}
