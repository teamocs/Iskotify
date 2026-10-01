import { AppState, Platform } from 'react-native'
import { flushPendingPush } from './pushScheduler'

/**
 * Sends any debounced backup edit as soon as the app can no longer be trusted
 * to stay alive: web `pagehide` / tab hidden, native AppState -> background.
 * Best effort (a closing page may still cut the request). Returns a disposer.
 */
export function installPushFlushListeners(): () => void {
  const flush = () => { void flushPendingPush().catch(() => { /* push logs its own errors */ }) }

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }

  const sub = AppState.addEventListener('change', (state) => { if (state === 'background') flush() })
  return () => sub.remove()
}
