import { View, Text, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Layers1Outlined, Book1Outlined, StopwatchOutlined, Flag1Outlined, CheckOutlined, ChevronLeftOutlined,
} from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Card } from '../ui/Card'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { planItemCopy, type PlanItemLike } from '../../utils/todayNextStep'
import type { StudyPlanItemKind } from '../../utils/studyPlan'

const KIND_ICON: Record<StudyPlanItemKind, typeof Book1Outlined> = {
  srs_review: Layers1Outlined,
  topic_practice: Book1Outlined,
  mock_section: StopwatchOutlined,
  diagnostic: Flag1Outlined,
}

interface Props {
  items: PlanItemLike[]
  /** topicId → display name, from the already-loaded topic catalog. */
  topicNameById: Map<string, string>
  onMarkComplete: (id: number) => void
}

/**
 * Today's plan as a checklist: each row opens its task, and a separate
 * 44pt checkbox marks it done. Renders nothing without items — the hero
 * (NextStepCard) owns the loading, error and all-caught-up states.
 */
export function TodaysPlanFold({ items, topicNameById, onMarkComplete }: Props) {
  const { theme: t } = useTheme()
  if (items.length === 0) return null

  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={[textStyle('titleSm', t.textPrimary), { minHeight: 32, textAlignVertical: 'center', paddingTop: spacing.xs }]} maxFontSizeMultiplier={2}>
        Today's plan
      </Text>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {items.map((item, i) => {
          const done = item.completedAt != null
          const copy = planItemCopy(item, topicNameById)
          return (
            <View
              key={item.id}
              style={{
                flexDirection: 'row', alignItems: 'center',
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider,
              }}
            >
              <Pressable
                onPress={() => { if (!done) onMarkComplete(item.id) }}
                accessibilityRole="checkbox"
                accessibilityLabel={copy.title}
                accessibilityHint={done ? undefined : 'Marks this as done'}
                accessibilityState={{ checked: done }}
                style={(state) => {
                  const { focused } = state as WebPressableState
                  return [{ width: 52, minHeight: 56, alignItems: 'center', justifyContent: 'center' }, focusRing(t.focusRing, focused)]
                }}
              >
                <View
                  style={{
                    width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2,
                    borderColor: done ? t.success : t.textTertiary,
                    backgroundColor: done ? t.success : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {done ? <Lineicons icon={CheckOutlined} size={14} color={t.bg} /> : null}
                </View>
              </Pressable>
              <Pressable
                onPress={() => router.push(copy.route as never)}
                accessibilityRole="button"
                accessibilityLabel={`${copy.title}, ${copy.detail}`}
                style={(state) => {
                  const { pressed, hovered, focused } = state as WebPressableState
                  return [
                    {
                      flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      paddingVertical: spacing.md, paddingRight: spacing.lg,
                      backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
                    },
                    focusRing(t.focusRing, focused),
                  ]
                }}
              >
                <View {...decorative}>
                  <Lineicons icon={KIND_ICON[item.kind]} size={20} color={done ? t.textTertiary : t.accentText} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text
                    style={[textStyle('titleSm', done ? t.textSecondary : t.textPrimary), done ? { textDecorationLine: 'line-through' } : null]}
                    numberOfLines={2}
                    maxFontSizeMultiplier={2}
                  >
                    {copy.title}
                  </Text>
                  <Text style={textStyle('bodySm', t.textSecondary)} numberOfLines={2} maxFontSizeMultiplier={2}>
                    {done ? 'Done' : copy.detail}
                  </Text>
                </View>
                <View {...decorative} style={{ transform: [{ scaleX: -1 }] }}>
                  <Lineicons icon={ChevronLeftOutlined} size={16} color={t.textTertiary} />
                </View>
              </Pressable>
            </View>
          )
        })}
      </Card>
    </View>
  )
}
