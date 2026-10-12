import { useEffect, useState, useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckCircle1Solid } from '@lineiconshq/free-icons'
import { useDb } from '../hooks/useDb'
import { useTheme } from '../theme/ThemeContext'
import { layout, radius, spacing } from '../theme/tokens'
import { PressableScale } from './ui/Pressable'
import { Text } from './ui/Text'
import { decorative, focusRing } from './ui/a11y'
import {
  getAcquiredRequirementIndices,
  toggleRequirement,
} from '../services/coachQueue'

interface Props {
  /** The key ticks are saved under: a listing slug, or a school's focus slug. */
  listingSlug: string
  requirements: string[]
  onAcquiredCountChange?: (acquired: number, total: number) => void
}

const CIRCLE = 24

/**
 * A requirements checklist as an inset grouped list: one row per document, a
 * check circle that fills when the student has it, a hairline between rows.
 * Each row is a checkbox (aria-checked) that toggles on tap and settles to
 * 0.97 (PressableScale). Ticks persist to user_requirements, so the listing
 * page and the Requirements screen stay in sync.
 */
export function RequirementsChecklist({ listingSlug, requirements, onAcquiredCountChange }: Props) {
  const db = useDb()
  const { theme: t } = useTheme()
  const [acquired, setAcquired] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const indices = await getAcquiredRequirementIndices(db, listingSlug)
        if (!cancelled) setAcquired(new Set(indices))
      } catch (e) {
        console.warn('[RequirementsChecklist] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [db, listingSlug])

  useEffect(() => {
    onAcquiredCountChange?.(acquired.size, requirements.length)
  }, [acquired, requirements.length, onAcquiredCountChange])

  const onToggle = useCallback(async (index: number) => {
    let wasAcquired = false
    setAcquired(prev => {
      wasAcquired = prev.has(index)
      const next = new Set(prev)
      if (wasAcquired) next.delete(index)
      else next.add(index)
      return next
    })
    try {
      await toggleRequirement(db, listingSlug, index, !wasAcquired)
    } catch (e) {
      console.warn('[RequirementsChecklist] toggle failed:', e)
      // Revert only this index so concurrent toggles on other rows aren't clobbered
      setAcquired(prev => {
        const reverted = new Set(prev)
        if (wasAcquired) reverted.add(index)
        else reverted.delete(index)
        return reverted
      })
    }
  }, [db, listingSlug])

  if (!requirements || requirements.length === 0) return null

  return (
    <View
      testID="requirements-checklist"
      style={{ backgroundColor: t.surface, borderRadius: radius.group, borderCurve: 'continuous', overflow: 'hidden' }}
    >
      {requirements.map((req, i) => {
        const isAcquired = acquired.has(i)
        const isLast = i === requirements.length - 1
        return (
          <PressableScale
            key={`${i}-${req}`}
            onPress={() => { void onToggle(i) }}
            accessibilityRole="checkbox"
            aria-checked={isAcquired}
            accessibilityLabel={req}
            style={({ pressed, hovered, focused }) => [
              {
                minHeight: layout.rowMinHeight,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingLeft: spacing.lg,
                backgroundColor: pressed ? t.surface2 : hovered ? t.surfaceSubtle : 'transparent',
              },
              focusRing(t.focusRing, focused),
            ]}
          >
            <View
              testID={isAcquired ? 'check-circle-on' : 'check-circle-off'}
              {...decorative}
              style={{
                width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: isAcquired ? 0 : 2,
                borderColor: t.inputBorder,
              }}
            >
              {isAcquired ? <Lineicons icon={CheckCircle1Solid} size={CIRCLE} color={t.accent} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingVertical: spacing.md, paddingRight: spacing.lg }}>
              <Text
                role="body"
                color={isAcquired ? t.textTertiary : t.textPrimary}
                style={isAcquired ? { textDecorationLine: 'line-through' } : null}
              >
                {req}
              </Text>
              {isLast ? null : (
                <View
                  {...decorative}
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.divider }}
                />
              )}
            </View>
          </PressableScale>
        )
      })}
    </View>
  )
}
