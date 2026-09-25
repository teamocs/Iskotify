import { Alert, Platform } from 'react-native'

export interface ConfirmOptions {
  cancelLabel?: string
  /** Style the confirm button as destructive (native) — e.g. leaving/submitting mid-exam. */
  destructive?: boolean
}

/**
 * Cross-platform confirm dialog. Native uses `Alert.alert` (same convention
 * as app/(tabs)/profile.tsx's sign-out/reset confirmations). Web falls back
 * to `window.confirm` because react-native-web's `Alert.alert` is a no-op —
 * see app/(tabs)/__tests__/profile.test.tsx's "WEB sign-out & reset" suite
 * for the established precedent this mirrors.
 *
 * Used by the exam-safety leave/submit confirmations so the same call site
 * works on the native app and the shared web build.
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  options: ConfirmOptions = {},
): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm()
    }
    return
  }
  Alert.alert(title, message, [
    { text: options.cancelLabel ?? 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: options.destructive ? 'destructive' : 'default', onPress: onConfirm },
  ])
}
