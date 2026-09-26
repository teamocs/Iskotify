/**
 * Row density for every admin table: "comfortable" (the default) or "compact".
 * One console-wide preference, kept in localStorage so an operator who works
 * compact sets it once. Pure apart from the storage handed in, so it tests in
 * node; `useTableDensity` (components/ui/DataTable) binds it to React.
 */

export type Density = 'comfortable' | 'compact'

export const DENSITY_KEY = 'iskotify.admin.tableDensity'
const DEFAULT: Density = 'comfortable'

type Readable = Pick<Storage, 'getItem'>
type Writable = Pick<Storage, 'setItem'>

/** Storage can be missing or throw (private mode, blocked site data): fall back to the default. */
export function readDensity(storage: Readable | null | undefined): Density {
  try {
    return storage?.getItem(DENSITY_KEY) === 'compact' ? 'compact' : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function writeDensity(storage: Writable | null | undefined, density: Density): void {
  try {
    storage?.setItem(DENSITY_KEY, density)
  } catch {
    // Not persisted; the choice still applies for this page view.
  }
}

/** A tiny external store for useSyncExternalStore. */
export function createDensityStore(getStorage: () => (Readable & Writable) | null) {
  const listeners = new Set<() => void>()
  let current = readDensity(getStorage())
  const emit = () => listeners.forEach(l => l())
  return {
    getSnapshot: () => current,
    /** The server cannot see localStorage; hydrate with the default, then follow the store. */
    getServerSnapshot: (): Density => DEFAULT,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next: Density) {
      if (next === current) return
      current = next
      writeDensity(getStorage(), next)
      emit()
    },
    /** Another tab changed the preference. */
    sync() {
      const next = readDensity(getStorage())
      if (next !== current) { current = next; emit() }
    },
  }
}
