// apps/admin/app/admin/flashcards/page.tsx
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { SubjectsView } from '@/components/admin/SubjectsView'

export const dynamic = 'force-dynamic'

type Topic = {
  id: string
  name: string
  status: string
  flashcards: { id: string; status: string }[]
}

export default async function FlashcardsPage() {
  const db = createServerClient()

  const { data: subjectsRaw } = await db
    .from('flashcard_subjects')
    .select(`
      id,
      name,
      listing_slugs,
      flashcard_topics (
        id,
        name,
        status,
        flashcards (id, status)
      )
    `)
    .order('name')

  const { data: listingsRaw } = await db
    .from('listings')
    .select('id, slug, title, provider, type')
    .in('status', ['active', 'upcoming'])
    .order('type')
    .order('title')

  const subjects = (subjectsRaw ?? []).map(subject => {
    const topics = (subject.flashcard_topics ?? []) as Topic[]
    const totalCards = topics.reduce((sum, t) => sum + (t.flashcards?.length ?? 0), 0)
    const overallStatus = topics.some(t => t.status === 'published') ? 'published' : 'draft'
    return {
      id: subject.id,
      name: subject.name,
      listing_slugs: (subject.listing_slugs as string[]) ?? [],
      topics,
      totalCards,
      overallStatus,
    }
  })

  const listings = (listingsRaw ?? []) as {
    id: string
    slug: string
    title: string
    provider: string
    type: 'scholarship' | 'exam'
  }[]

  return (
    <>
      <Topbar title="Knowledge Base" />
      <SubjectsView subjects={subjects} listings={listings} />
    </>
  )
}
