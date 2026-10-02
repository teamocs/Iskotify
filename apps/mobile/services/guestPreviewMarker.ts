/**
 * The web glimpse (P4): a tab-scoped note that THIS tab just ran the guest
 * preview (services/guestPreview.ts). sessionStorage dies with the tab, so a
 * guest's diagnostic left on a shared browser (library, school lab, internet
 * cafe) is never merged into whoever signs in there later, and the next visitor
 * is never offered the earlier visitor's run (RA 10173).
 *
 * Fresh = set in this tab within GUEST_PREVIEW_MARKER_TTL_MS. 6 hours covers a
 * full diagnostic plus a sign-up detour, and still ends a tab left open on a
 * shared machine the same day. Anything else (missing, stale, a garbage or
 * future value, storage that throws, native) reads as "no marker": the caller
 * then resets instead of merging. Native never has web guests: always false.
 */
import { Platform } from 'react-native'

export const GUEST_PREVIEW_MARKER_KEY = 'iskotify.guestPreviewAt'
export const GUEST_PREVIEW_MARKER_TTL_MS = 6 * 60 * 60 * 1000

type TabStorage = Pick<Storage, 'getItem' | 'setItem'>

function tabStorage(): TabStorage | null {
  if (Platform.OS !== 'web') return null
  const s = (globalThis as { sessionStorage?: TabStorage }).sessionStorage
  return s ?? null
}

/** Records that this tab is running the guest preview. Never throws. */
export function markGuestPreview(now: number = Date.now()): void {
  try {
    tabStorage()?.setItem(GUEST_PREVIEW_MARKER_KEY, String(now))
  } catch {
    // Storage blocked: the run simply will not be merged (the safe side).
  }
}

/** True only when this tab set the marker within the TTL. */
export function hasFreshGuestPreviewMarker(now: number = Date.now()): boolean {
  try {
    const raw = tabStorage()?.getItem(GUEST_PREVIEW_MARKER_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    const age = now - at
    return age >= 0 && age <= GUEST_PREVIEW_MARKER_TTL_MS
  } catch {
    return false
  }
}
