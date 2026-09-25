import { apiRequest, type ApiResult } from '@/lib/apiRequest'

/**
 * UpdatesView's save/delete handlers previously called `fetch` directly with
 * no `try`/`catch` at all — a thrown network error left the drawer's "Saving…"
 * button stuck forever. `apiRequest` never throws.
 */
export async function saveUpdate(payload: Record<string, unknown>): Promise<ApiResult<unknown>> {
  const method = 'id' in payload && payload.id ? 'PATCH' : 'POST'
  return apiRequest('/api/admin/updates', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteUpdate(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiRequest(`/api/admin/updates?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}
