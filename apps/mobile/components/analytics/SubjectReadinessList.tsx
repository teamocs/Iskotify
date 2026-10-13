import { View } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { layout, spacing } from '../../theme/tokens'
import { ProgressBar } from '../ui/ProgressBar'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Text } from '../ui/Text'
import { PressableScale } from '../ui/Pressable'
import { focusRing } from '../ui/a11y'
import type { SubjectReadiness } from '../../hooks/useSubjectReadiness'
import { DIAGNOSTIC_SUBTESTS } from '../../utils/diagnosticExam'

/**
 * Readiness by subject (moved from Today): a neutral number and a bar, one
 * accent colour for every subject. No verdict word and no traffic-light tone
 * (owner, 2026-10-13): the percentage speaks for itself. A subject with too
 * little practice says "Not started" instead of a 0%. Tapping one of the four
 * UPCAT subtests opens its diagnostic; any other subject (the diagnostic would
 * silently run all four subtests for it) opens its own topics page.
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
        // null = not enough answered questions yet: say so instead of showing 0%.
        const pctText = s.pct == null ? 'Not started' : `${s.pct}%`
        const hasDiagnostic = DIAGNOSTIC_SUBTESTS.includes(s.name)
        return (
          <PressableScale
            key={s.id}
            onPress={() => router.push((hasDiagnostic
              ? `/practice/diagnostic?subject=${encodeURIComponent(s.name)}`
              : `/subjects/${encodeURIComponent(s.id)}`) as never)}
            accessibilityRole="button"
            accessibilityLabel={s.pct == null ? `${s.name}, not started` : `${s.name}, ${s.pct}%`}
            accessibilityHint={hasDiagnostic ? 'Opens a diagnostic for this subject' : 'Opens this subject\'s topics to practise'}
            style={({ pressed, hovered, focused }) => [
              {
                minHeight: layout.rowMinHeight + 12, paddingVertical: spacing.md, gap: spacing.sm,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider,
                backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
              },
              focusRing(t.focusRing, focused),
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
              <Text role="headline" numberOfLines={2} style={{ flex: 1 }}>
                {s.name}
              </Text>
              <Text
                role={s.pct == null ? 'footnote' : 'headline'}
                color={s.pct == null ? t.textSecondary : t.textPrimary}
                maxFontSizeMultiplier={1.5}
                style={{ fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' }}
              >
                {pctText}
              </Text>
            </View>
            <ProgressBar value={(s.pct ?? 0) / 100} label={`${s.name} readiness`} tone="accent" />
          </PressableScale>
        )
      })}
    </View>
  )
}
