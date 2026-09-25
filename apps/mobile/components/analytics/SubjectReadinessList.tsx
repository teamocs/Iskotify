import { View, Text, Pressable } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { ProgressBar } from '../ui/ProgressBar'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { focusRing, type WebPressableState } from '../ui/a11y'
import { readinessTone } from '../../utils/readinessTone'
import type { SubjectReadiness } from '../../hooks/useSubjectReadiness'

const WORD = { strong: 'strong', fair: 'getting there', weak: 'needs work', none: 'not started' } as const
const BAR_TONE = { strong: 'success', fair: 'warning', weak: 'danger', none: 'accent' } as const

/**
 * Readiness by subject (moved from Today): percentage, a bar and a word, so
 * colour is never the only signal. Tapping a subject opens its diagnostic.
 */
export function SubjectReadinessList({ entries, loading, error, refresh }: SubjectReadiness) {
  const { theme: t } = useTheme()

  if (loading && entries.length === 0) {
    return (
      <View style={{ gap: spacing.md }}>
        <Skeleton accessible label="Loading readiness" height={40} />
        <Skeleton height={40} />
      </View>
    )
  }
  if (error && entries.length === 0) {
    return <ErrorState title="Couldn't load readiness" onRetry={() => void refresh()} />
  }
  if (entries.length === 0) {
    return <EmptyState title="No subjects yet" body="Practice a subject to see your readiness here." />
  }

  return (
    <View>
      {entries.map((s, i) => {
        const tone = readinessTone(s.pct)
        const word = WORD[tone]
        return (
          <Pressable
            key={s.id}
            onPress={() => router.push(`/practice/diagnostic?subject=${encodeURIComponent(s.name)}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`${s.name}, ${s.pct}%, ${word}`}
            accessibilityHint="Opens a diagnostic for this subject"
            style={(state) => {
              const { pressed, hovered, focused } = state as WebPressableState
              return [
                {
                  minHeight: 56, paddingVertical: spacing.md, gap: spacing.sm,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider,
                  backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
                },
                focusRing(t.focusRing, focused),
              ]
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
              <Text style={[textStyle('titleSm', t.textPrimary), { flex: 1 }]} numberOfLines={2} maxFontSizeMultiplier={2}>
                {s.name}
              </Text>
              <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{word}</Text>
              <Text style={[textStyle('titleSm', t.textPrimary), { fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' }]} maxFontSizeMultiplier={1.5}>
                {s.pct}%
              </Text>
            </View>
            <ProgressBar value={s.pct / 100} label={`${s.name} readiness`} tone={BAR_TONE[tone]} />
          </Pressable>
        )
      })}
    </View>
  )
}
