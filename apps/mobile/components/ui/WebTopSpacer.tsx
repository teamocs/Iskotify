import { Platform, View } from 'react-native'
import { spacing } from '../../theme/tokens'

/**
 * Web-only vertical breathing room at the very top of a screen.
 *
 * On native, SafeAreaView supplies the status-bar / notch inset so headers sit
 * comfortably below the top edge. On web that inset is 0, so a screen's title/
 * header renders flush against the browser viewport's top edge (cramped). This
 * renders a small spacer on web only — nothing on native (returns null before
 * any layout cost).
 */
export function WebTopSpacer() {
  if (Platform.OS !== 'web') return null
  return <View style={{ height: spacing.md }} />
}
