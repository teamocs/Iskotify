// apps/admin/app/admin/flashcards/page.tsx
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { SubjectsView } from '@/components/admin/SubjectsView'
import { GenerateExplanationsButton } from '@/components/admin/GenerateExplanationsButton'
import { RegenerateDistractorsPanel } from '@/components/admin/RegenerateDistractorsPanel'
import { PageBody } from '@/components/ui/Page'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export const dynamic = 'force-dynamic'

type Topic = {
  id: string
  name: string
  status: string
  flashcards: { id: string; status: string }[]
}

export default async function FlashcardsPage() {
  const db = createServerClient()

  // Independent reads: run them together.
  const [
    { data: subjectsRaw, error: subjectsError },
    { data: listingsRaw, error: listingsError },
  ] = await Promise.all([
    db
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
      .order('name'),
    db
      .from('listings')
      .select('id, slug, title, provider, type')
      .in('status', ['active', 'upcoming'])
      .order('type')
      .order('title'),
  ])

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
      <Topbar title="Knowledge base" exportHref="/api/admin/flashcards/export" />
      <PageBody intro="Subjects, their topics and the flashcards students review in the app. Open a subject to manage its cards.">
        {subjectsError ? (
          <ErrorBanner
            title="Couldn’t load subjects"
            message={subjectsError.message}
          />
        ) : (
          <>
            {listingsError && (
              <ErrorBanner
                title="Couldn’t load scholarships and exams"
                message={`${listingsError.message} Linked listings won’t show until this loads.`}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <GenerateExplanationsButton source="flashcards" label="Generate explanations for cards" />
              <RegenerateDistractorsPanel
                subjects={subjects.map(s => ({
                  id: s.id,
                  name: s.name,
                  topics: s.topics.map(t => ({ id: t.id, name: t.name })),
                }))}
              />
            </div>
            <SubjectsView subjects={subjects} listings={listings} />
          </>
        )}
      </PageBody>
    </>
  )
}
