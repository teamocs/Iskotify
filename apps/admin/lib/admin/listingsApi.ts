import { apiRequest, type ApiResult } from '@/lib/apiRequest'

/**
 * Deletes a listing. Previously this was an inline `await fetch(...)` in
 * ListingTable with no `res.ok` check at all — a 500 from the server looked
 * identical to a successful delete, so the row vanished from the UI (the
 * dialog closed, `router.refresh()` ran) even though nothing was deleted on
 * the server. Routing through `apiRequest` makes the failure visible instead.
 */
export async function deleteListing(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiRequest(`/api/admin/listings/${id}`, { method: 'DELETE' })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

/**
 * Creates (no `existingId`) or updates a listing. ListingDrawer used to call
 * `fetch` directly with no `try`/`catch` at all around it — a thrown network
 * error left the "Saving…" button stuck forever, since nothing ever reset
 * `saving` back to false. `apiRequest` never throws.
 */
export async function saveListing(payload: Record<string, unknown>, existingId: string | undefined): Promise<ApiResult<unknown>> {
  const url = existingId ? `/api/admin/listings/${existingId}` : '/api/admin/listings'
  const method = existingId ? 'PATCH' : 'POST'
  return apiRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
