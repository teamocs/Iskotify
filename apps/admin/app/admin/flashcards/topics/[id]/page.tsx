// apps/admin/app/admin/flashcards/topics/[id]/page.tsx
import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@iskotify/utils'

export const dynamic = 'force-dynamic'

export default async function TopicRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = createServerClient()

  const { data: topic } = await db
    .from('flashcard_topics')
    .select('subject_id')
    .eq('id', id)
    .single()

  if (!topic) return notFound()
  if (!topic.subject_id) redirect('/admin/flashcards')

  redirect(`/admin/flashcards/subjects/${topic.subject_id}`)
}
