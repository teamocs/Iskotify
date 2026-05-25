import { createServerClient } from '@iskotify/utils'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { SubjectCardsView } from '@/components/admin/SubjectCardsView'

export const dynamic = 'force-dynamic'

export default async function SubjectCardsPage({
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

  if (!subject) notFound()

  const { data: topicsRaw } = await db
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
      <Topbar title={`${subject.name} — Cards`} />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <Breadcrumb
          items={[
            { label: 'Subjects', href: '/admin/flashcards' },
            { label: subject.name, href: `/admin/flashcards/subjects/${id}` },
            { label: 'Cards' },
          ]}
        />
        <SubjectCardsView
          subjectId={id}
          topics={topicsWithCount}
          defaultOpenTopicId={defaultOpenTopicId}
        />
      </div>
    </>
  )
}
