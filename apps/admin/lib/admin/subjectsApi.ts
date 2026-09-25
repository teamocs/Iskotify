import { apiRequest, type ApiResult } from '@/lib/apiRequest'

interface SubjectPayload {
  id: string
  name: string
  listing_slugs: string[]
}

/**
 * These three used to be inline `try { fetch... } finally { setSaving(false) }`
 * blocks in SubjectsView with no `catch` — a thrown network error became an
 * unhandled promise rejection: `finally` still ran (so the button stopped
 * spinning) but nothing told the admin the save/delete never happened.
 * `apiRequest` never throws, so callers can react to `ok: false` instead.
 */
export async function createSubject(name: string, listingSlugs: string[]): Promise<ApiResult<SubjectPayload>> {
  return apiRequest<SubjectPayload>('/api/flashcards/subjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), listing_slugs: listingSlugs }),
  })
}

export async function updateSubject(id: string, name: string, listingSlugs: string[]): Promise<ApiResult<SubjectPayload>> {
  return apiRequest<SubjectPayload>(`/api/flashcards/subjects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), listing_slugs: listingSlugs }),
  })
}

export async function deleteSubject(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiRequest(`/api/flashcards/subjects/${id}`, { method: 'DELETE' })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}
