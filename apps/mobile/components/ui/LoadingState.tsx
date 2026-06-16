import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

interface LoadingStateProps {
  label?: string
}

export function LoadingState({ label }: LoadingStateProps) {
  const { theme: t, typo } = useTheme()

  return (
    <View style={styles.container}>
      <ActivityIndicator color={t.accent} size="small" />
      {label ? (
        <Text
          style={[styles.label, { color: t.textSecondary, fontSize: typo.sm }]}
          maxFontSizeMultiplier={1.4}
        >
          {label}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 8,
  },
  label: {
    fontFamily: 'Lexend_400Regular',
    textAlign: 'center',
  },
})
