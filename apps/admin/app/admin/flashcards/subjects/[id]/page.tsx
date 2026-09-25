// apps/admin/app/admin/flashcards/subjects/[id]/page.tsx
import { createServerClient } from '@iskotify/utils'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { AddTopicButton } from '@/components/admin/AddTopicButton'
import { SubjectCardsView } from '@/components/admin/SubjectCardsView'
import { PageBody } from '@/components/ui/Page'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { NAV_GROUPS } from '@/lib/nav/adminNav'

// The section name comes from the sidebar so the two never disagree.
const SECTION_LABEL = NAV_GROUPS.flatMap(g => g.items).find(i => i.href === '/admin/flashcards')?.label ?? 'Knowledge base'

export const dynamic = 'force-dynamic'

export default async function SubjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ topic?: string }>
}) {
  const { id } = await params
  const { topic: defaultOpenTopicId } = await searchParams
  const db = createServerClient()

  const { data: subject } = await db
    .from('flashcard_subjects')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!subject) return notFound()

  const { data: topicsRaw, error: topicsError } = await db
    .from('flashcard_topics')
    .select('id, name, status, flashcards (id)')
    .eq('subject_id', id)
    .order('name')

  const topics = (topicsRaw ?? []) as Array<{
    id: string
    name: string
    status: 'published' | 'draft'
    flashcards: { id: string }[]
  }>

  const topicsWithCount = topics.map(t => ({
    id: t.id,
    name: t.name,
    status: t.status,
    cardCount: t.flashcards?.length ?? 0,
  }))

  return (
    <>
      <Topbar title={subject.name} actions={<AddTopicButton subjectId={id} />} />
      <PageBody>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <Breadcrumb items={[
            { label: SECTION_LABEL, href: '/admin/flashcards' },
            { label: subject.name },
          ]} />
          {!topicsError && (
            <p className="text-ui text-ink-muted tabular-nums">{topics.length} topic{topics.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        {topicsError ? (
          <ErrorBanner title="Couldn’t load topics" message={topicsError.message} />
        ) : (
          <SubjectCardsView subjectId={id} subjectName={subject.name} topics={topicsWithCount} defaultOpenTopicId={defaultOpenTopicId} />
        )}
      </PageBody>
    </>
  )
}
