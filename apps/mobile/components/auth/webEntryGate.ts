import { webGateRedirect, type EntryTarget } from '../../utils/webEntryTarget'

export interface WebGateDeps {
  /** Whether a Supabase session exists right now. */
  hasSession(): Promise<boolean>
  /**
   * Pull the student's data and decide where a signed-in student belongs.
   * `reason` lets the caller run launch-only or sign-in-only side effects.
   */
  resolveTarget(reason: 'launch' | 'signed-in'): Promise<EntryTarget>
  /** Subscribe to auth changes; returns the unsubscribe. */
  subscribe(listener: (event: string, hasSession: boolean) => void): () => void
  /** The path the browser is on (window.location.pathname). */
  currentPath(): string
  replace(href: string): void
  /** Hide the launch splash. */
  onReady(): void
  onSignedOut(): void
}

/**
 * The web build's entry gate. The session decides the route, but a page that
 * already finishes its own job is left where it is (see webGateRedirect).
 * The auth listener is ALWAYS registered — a visitor who arrives signed out
 * and then signs in on the form must be routed on.
 */
export async function runWebEntryGate(d: WebGateDeps): Promise<() => void> {
  const go = (target: EntryTarget) => {
    const href = webGateRedirect(d.currentPath(), target)
    if (href) d.replace(href)
  }

  try {
    const signedIn = await d.hasSession()
    go(signedIn ? await d.resolveTarget('launch') : '/auth/sign-in')
  } catch (e) {
    console.error('[webEntryGate] launch check failed:', e)
    go('/auth/sign-in')
  } finally {
    d.onReady()
  }

  return d.subscribe((event, hasSession) => {
    if (event === 'SIGNED_IN' && hasSession) {
      d.resolveTarget('signed-in')
        .then(go)
        .catch(e => console.warn('[webEntryGate] sign-in routing failed:', e))
    } else if (event === 'SIGNED_OUT') {
      d.onSignedOut()
      d.replace('/auth/sign-in')
    }
  })
}
