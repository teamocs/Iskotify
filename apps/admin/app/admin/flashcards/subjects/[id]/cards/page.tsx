// apps/admin/app/admin/flashcards/subjects/[id]/cards/page.tsx
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SubjectCardsRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/flashcards/subjects/${id}`)
}
