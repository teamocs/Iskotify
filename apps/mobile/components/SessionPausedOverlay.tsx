import { StyleSheet, View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { PauseOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../theme/ThemeContext'
import { radius, spacing } from '../theme/tokens'
import { Button } from './ui/Button'
import { Text } from './ui/Text'
import { decorative } from './ui/a11y'

interface Props {
  visible: boolean
  timeRemainingSecs: number
  onResume: () => void
  onEnd: () => void
}

export function formatMinutes(secs: number): string {
  const minutes = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (minutes <= 0) return `${remSecs} sec`
  return `${minutes} min ${remSecs > 0 ? `${remSecs} sec` : ''}`.trim()
}

/**
 * The paused focus session (hooks/useFocusMode): an opaque page over the
 * runner, so no question shows while the app was in the background. Render it
 * as the LAST child of the screen's root view; it fills that view and is modal
 * for screen readers. One primary (Resume), End as a quiet secondary.
 *
 * iOS redesign P4: no raw Modal (the screen's own Back handling stays in
 * charge, as useFocusMode expects), a drawn pause icon instead of a glyph, and
 * text in the iOS roles.
 */
export function SessionPausedOverlay({ visible, timeRemainingSecs, onResume, onEnd }: Props) {
  const { theme: t } = useTheme()
  if (!visible) return null

  return (
    <View
      testID="session-paused"
      accessibilityViewIsModal
      aria-modal
      style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, zIndex: 10, alignItems: 'center', justifyContent: 'center' }]}
    >
      <View style={{ width: '100%', maxWidth: 420, paddingHorizontal: spacing.xxxl, alignItems: 'center', gap: spacing.xl }}>
        <View
          {...decorative}
          style={{
            width: 72, height: 72, borderRadius: radius.card, borderCurve: 'continuous',
            backgroundColor: t.accentSurface, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Lineicons icon={PauseOutlined} size={32} color={t.accentText} />
        </View>
        <View style={{ gap: spacing.sm, alignItems: 'center' }}>
          <Text role="title1" accessibilityRole="header" style={{ textAlign: 'center' }}>Session paused</Text>
          <Text role="body" color={t.textSecondary} style={{ textAlign: 'center' }}>
            {`Time remaining: ${formatMinutes(timeRemainingSecs)}`}
          </Text>
        </View>
        <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
          <Button label="Resume session" onPress={onResume} size="lg" fullWidth />
          <Button label="End session" variant="ghost" onPress={onEnd} fullWidth />
        </View>
      </View>
    </View>
  )
}
