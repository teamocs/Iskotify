/**
 * Web persist scheduler — isolated from React so this file can be imported
 * by pure services (sync.ts, settings.ts) in the node jest environment.
 *
 * The real `_scheduleWebPersist` function is registered by WebDrizzleProvider
 * (db/index.tsx) on web. On native, this module is a no-op.
 */

let _fn: (() => void) | null = null

/** Called by WebDrizzleProvider once the web db handle is ready. */
export function registerWebPersist(fn: () => void): void {
  _fn = fn
}

/** Call after any write to schedule a debounced IndexedDB persist. No-op on native. */
export function scheduleWebPersist(): void {
  _fn?.()
}
