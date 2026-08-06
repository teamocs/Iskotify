import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { SectionHeader } from '../ui/SectionHeader'
import { InfoBanner } from '../ui/InfoBanner'
import { subjectColor } from '../../utils/subjectColors'
import { readinessTone } from '../../utils/readinessTone'
import { subjectPreparedness, type SubjectTopicRow } from '../../utils/subjectPreparedness'

interface Props {
  subjects: Array<{ id: string; name: string }>
  topicRows: SubjectTopicRow[]
  perTopicBestById: Map<string, number>
  subjectBestByName: Map<string, number>
}

export function SubjectPreparednessGrid({ subjects, topicRows, perTopicBestById, subjectBestByName }: Props) {
  const { theme: t, typo } = useTheme()

  const entries = useMemo(
    () => subjectPreparedness(topicRows, subjects, perTopicBestById, subjectBestByName),
    [topicRows, subjects, perTopicBestById, subjectBestByName],
  )

  const s = useMemo(() => StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    card: {
      position: 'relative',
      overflow: 'hidden',
      flexBasis: '31%',
      flexGrow: 1,
      height: 110,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      padding: spacing.sm,
      justifyContent: 'space-between',
    },
    fill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    content: { position: 'relative', zIndex: 1, flex: 1, justifyContent: 'space-between' },
    dot: { width: 10, height: 10, borderRadius: 5 },
    name: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    pct: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', letterSpacing: -0.3 },
    cta: { fontSize: typo.xs, fontWeight: '700', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
  }), [t, typo])

  const toneFill = (pct: number): string | null => {
    switch (readinessTone(pct)) {
      case 'strong': return t.successSurface
      case 'fair': return t.warningSurface
      case 'weak': return t.dangerSurface
      default: return null
    }
  }

  return (
    <View style={{ marginTop: spacing.xl }}>
      <SectionHeader
        title="Subject preparedness"
        subtitle="Your readiness by subject"
      />
      {entries.length > 0 ? (
        <View style={s.grid}>
          {entries.map(subject => {
            const { accent } = subjectColor(subject.id)
            const fill = toneFill(subject.pct)
            const fillPct = Math.max(0, Math.min(100, subject.pct))
            return (
              <Pressable
                key={subject.id}
                style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}
                onPress={() => router.push(`/practice/diagnostic?subject=${encodeURIComponent(subject.name)}` as never)}
                accessibilityRole="button"
                accessibilityLabel={subject.name}
              >
                {fill != null ? <View style={[s.fill, { height: `${fillPct}%`, backgroundColor: fill }]} /> : null}
                <View style={s.content}>
                  <View style={[s.dot, { backgroundColor: accent }]} />
                  <Text style={s.name} numberOfLines={2} maxFontSizeMultiplier={1.4}>{subject.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={s.pct} maxFontSizeMultiplier={1.4}>{subject.pct}%</Text>
                    <Text style={s.cta} maxFontSizeMultiplier={1.4}>Take exam ›</Text>
                  </View>
                </View>
              </Pressable>
            )
          })}
        </View>
      ) : (
        <InfoBanner
          icon={<Text style={{ fontSize: 16 }}>📚</Text>}
          message="Practice a subject to see your preparedness here."
          actionLabel="Practice"
          onAction={() => router.push('/(tabs)/practice')}
          tone="neutral"
        />
      )}
    </View>
  )
}
