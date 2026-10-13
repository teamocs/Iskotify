import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'
import { heading } from '../ui/a11y'

/** The ring's outer size and stroke (pt). */
const RING = 64
const STROKE = 6

export interface ExamReadinessItem {
  slug: string
  title: string
  /** Practice accuracy 0–100, or null before any practice. */
  pct: number | null
}

/** "UPCAT 2026, 72% practice accuracy" / "UPCAT 2026, no practice yet". */
export function examRingLabel({ title, pct }: ExamReadinessItem): string {
  return pct == null ? `${title}, no practice yet` : `${title}, ${pct}% practice accuracy`
}

/** One 64pt ring: the percent in tabular figures inside, the exam name under it. */
function ExamRing({ item }: { item: ExamReadinessItem }) {
  const { theme: t } = useTheme()
  const r = (RING - STROKE) / 2
  const c = 2 * Math.PI * r
  const progress = item.pct == null ? 0 : Math.max(0, Math.min(100, item.pct)) / 100
  return (
    <View
      testID="exam-ring"
      accessible
      accessibilityRole="image"
      accessibilityLabel={examRingLabel(item)}
      style={{ alignItems: 'center', gap: spacing.sm, width: 96 }}
    >
      <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={RING} height={RING} style={{ position: 'absolute' }}>
          <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={t.surface2} strokeWidth={STROKE} fill="none" />
          {progress > 0 ? (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={t.accent}
              strokeWidth={STROKE}
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={c * (1 - progress)}
              strokeLinecap="round"
              fill="none"
              rotation={-90}
              origin={`${RING / 2}, ${RING / 2}`}
            />
          ) : null}
        </Svg>
        <Text
          role="headline"
          color={item.pct == null ? t.textSecondary : t.textPrimary}
          maxFontSizeMultiplier={1.2}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {item.pct == null ? '–' : `${item.pct}%`}
        </Text>
      </View>
      <Text role="footnote" color={t.textSecondary} numberOfLines={2} style={{ textAlign: 'center' }}>
        {item.title}
      </Text>
    </View>
  )
}

/**
 * Exam readiness: one ring per exam in focus, with its practice accuracy and
 * name. Numbers only — no pace, no status word, no verdict (owner, 2026-10-13:
 * pace stays hidden until there is real data behind it).
 */
export function ExamReadinessCard({ items }: { items: ExamReadinessItem[] }) {
  const { theme: t } = useTheme()
  return (
    <Card testID="exam-readiness-card">
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text role="headline" {...heading(2)}>Exam readiness</Text>
          <Text role="footnote" color={t.textSecondary}>Your practice accuracy for each exam in focus</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
          {items.map(item => <ExamRing key={item.slug} item={item} />)}
        </View>
      </View>
    </Card>
  )
}
