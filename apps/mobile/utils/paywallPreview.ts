// Paywall preview (web): turns the free limits and the upgrade screen on in THIS browser
// only, so staff can test the live site while the paywall is off for students. It can
// only restrict the person who sets it; it never grants anything.
// Open /upgrade?preview=on or /upgrade?preview=off.
const KEY = 'iskotify:paywall-preview'

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null // blocked site data
  }
}

export function isPaywallPreview(): boolean {
  try {
    return storage()?.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setPaywallPreview(on: boolean): void {
  try {
    if (on) storage()?.setItem(KEY, '1')
    else storage()?.removeItem(KEY)
  } catch { /* blocked site data: the preview stays as it was */ }
}
