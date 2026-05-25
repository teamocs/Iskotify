// apps/admin/app/admin/flashcards/subjects/[id]/cards/page.tsx
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SubjectCardsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ topic?: string }>
}) {
  const { id } = await params
  const { topic } = await searchParams
  const qs = topic ? `?topic=${encodeURIComponent(topic)}` : ''
  redirect(`/admin/flashcards/subjects/${id}${qs}`)
}
