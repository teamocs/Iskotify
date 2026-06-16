import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

interface WebRefreshButtonProps {
  onRefresh: () => void | Promise<void>
  refreshing: boolean
}

function WebRefreshButtonInner({ onRefresh, refreshing }: WebRefreshButtonProps) {
  const { theme: t, typo } = useTheme()

  return (
    <Pressable
      onPress={() => { void onRefresh() }}
      disabled={refreshing}
      accessibilityRole="button"
      accessibilityLabel="Refresh data"
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          opacity: refreshing ? 0.6 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {refreshing ? (
        <ActivityIndicator size="small" color={t.textSecondary} style={styles.indicator} />
      ) : (
        <Text
          style={[styles.glyph, { color: t.textSecondary, fontSize: typo.base }]}
          maxFontSizeMultiplier={1.4}
        >
          ↻
        </Text>
      )}
    </Pressable>
  )
}

export function WebRefreshButton(props: WebRefreshButtonProps) {
  if (Platform.OS !== 'web') return null
  return <WebRefreshButtonInner {...props} />
}

const styles = StyleSheet.create({
  pill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  glyph: {
    lineHeight: 22,
    textAlign: 'center',
  },
  indicator: {
    width: 20,
    height: 20,
  },
})
