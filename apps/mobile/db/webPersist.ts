/**
 * Web persist scheduler — isolated from React so this file can be imported
 * by pure services (sync.ts, settings.ts) in the node jest environment.
 *
 * The real `_scheduleFn`/`_flushFn` are registered by WebDrizzleProvider
 * (db/index.tsx) once the web db handle is ready. On native, this module is
 * a no-op.
 */

let _scheduleFn: (() => void) | null = null
let _flushFn: (() => void) | null = null

/**
 * Called by WebDrizzleProvider once the web db handle is ready.
 * `flushFn` (review finding #3) forces an immediate, un-debounced persist —
 * used by the exam screens' beforeunload handler so the last answer isn't
 * lost to the schedule's ~2s debounce window on tab close. Defaults to
 * `scheduleFn` when not given (still better than nothing).
 */
export function registerWebPersist(scheduleFn: () => void, flushFn?: () => void): void {
  _scheduleFn = scheduleFn
  _flushFn = flushFn ?? scheduleFn
}

/** Call after any write to schedule a debounced IndexedDB persist. No-op on native. */
export function scheduleWebPersist(): void {
  _scheduleFn?.()
}

/** Force an immediate persist, bypassing the debounce. No-op on native. */
export function flushWebPersist(): void {
  _flushFn?.()
}
