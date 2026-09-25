export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }

/**
 * Client-side fetch wrapper shared by admin mutating actions.
 *
 * This exists because several admin components previously called `fetch`
 * directly inside a `try { ... } finally { ... }` with no `catch` — a thrown
 * network error became an unhandled promise rejection and the UI (a "Saving…"
 * button, a stuck delete confirmation) never recovered. Routing every mutating
 * call through `apiRequest` means that class of bug is structurally
 * impossible: it never throws, and it always tells the caller whether the
 * request actually succeeded, per the server's own `res.ok`.
 */
export async function apiRequest<T = unknown>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch {
    return { ok: false, error: 'Network error' }
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request failed (${res.status})`
    return { ok: false, error: message, status: res.status }
  }

  return { ok: true, data: body as T }
}
