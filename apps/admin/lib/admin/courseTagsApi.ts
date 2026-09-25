import { apiRequest } from '@/lib/apiRequest'

/**
 * The Course Tags page updates its local `rows` state optimistically before
 * this call resolves, with no rollback on failure — the checked cluster stayed
 * checked in the UI even when the server rejected the change. The page now
 * reverts its optimistic update when this resolves `ok: false`.
 */
export async function saveCourseTags(id: string, targetCourses: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiRequest('/api/admin/listings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, target_courses: targetCourses }),
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}
