// apps/admin/app/admin/flashcards/subjects/[id]/page.tsx
import { createServerClient } from '@iskotify/utils'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { AddTopicButton } from '@/components/admin/AddTopicButton'
import { SubjectCardsView } from '@/components/admin/SubjectCardsView'

export const dynamic = 'force-dynamic'

export default async function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  const { data: subject } = await db
    .from('flashcard_subjects')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!subject) return notFound()

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
      <Topbar title={subject.name} />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Breadcrumb items={[
            { label: 'Subjects', href: '/admin/flashcards' },
            { label: subject.name },
          ]} />
          <AddTopicButton subjectId={id} />
        </div>
        <p className="text-sm text-[#6e6e73]">{topics.length} topic{topics.length !== 1 ? 's' : ''}</p>
        <SubjectCardsView subjectId={id} topics={topicsWithCount} />
      </div>
    </>
  )
}
