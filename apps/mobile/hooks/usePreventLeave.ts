import { usePreventRemove } from '@react-navigation/native'

/**
 * Exam safety Fix 1 — guards leaving the current screen (swipe-back gesture,
 * the Android hardware back button, and programmatic `router.back()`, which
 * are all the same "remove this screen" navigation action under the hood)
 * behind a confirmation callback while `shouldPrevent` is true.
 *
 * `onAttemptLeave` should show the confirmation (see utils/confirmAction.ts)
 * and, once the student confirms, flip whatever state made `shouldPrevent`
 * true to false and re-issue the navigation (e.g. `router.back()` again) —
 * this hook does not re-dispatch the blocked action itself, so the retried
 * navigation only needs `shouldPrevent` to already be false to go through.
 */
export function usePreventLeave(shouldPrevent: boolean, onAttemptLeave: () => void): void {
  usePreventRemove(shouldPrevent, () => onAttemptLeave())
}
