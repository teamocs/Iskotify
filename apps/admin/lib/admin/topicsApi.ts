import { apiRequest } from '@/lib/apiRequest'

type SimpleResult = { ok: true } | { ok: false; error: string }

/**
 * TopicCardSection's rename/delete-topic/save-card/delete-card handlers used
 * to be `try { fetch... } finally { setSaving(false) }` with no `catch` — a
 * thrown network error became an unhandled promise rejection instead of
 * surfacing to the admin. `apiRequest` never throws.
 */
export async function renameTopic(id: string, name: string): Promise<SimpleResult> {
  const result = await apiRequest(`/api/flashcards/topics/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

export async function deleteTopic(id: string): Promise<SimpleResult> {
  const result = await apiRequest(`/api/flashcards/topics/${id}`, { method: 'DELETE' })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

interface CardEdit {
  question: string
  answer: string
  explanation: string | null
}

export async function updateCard(id: string, payload: CardEdit): Promise<SimpleResult> {
  const result = await apiRequest(`/api/flashcards/cards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

export async function deleteCard(id: string): Promise<SimpleResult> {
  const result = await apiRequest(`/api/flashcards/cards/${id}`, { method: 'DELETE' })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}
