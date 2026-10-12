import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

/**
 * The light selection tick for a changed choice: a tab, a segment, a switch.
 * A no-op on web, and it never throws: a missing haptics engine (simulator,
 * older Android, battery saver) must never break the tap that triggered it.
 */
export function selection(): void {
  if (Platform.OS === 'web') return
  try {
    void Haptics.selectionAsync().catch(() => {})
  } catch {
    // no haptics on this device
  }
}
