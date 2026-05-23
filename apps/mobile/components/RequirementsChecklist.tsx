import { useEffect, useState, useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useDb } from '../hooks/useDb'
import { useTheme } from '../theme/ThemeContext'
import {
  getAcquiredRequirementIndices,
  toggleRequirement,
} from '../services/coachQueue'

interface Props {
  listingSlug: string
  requirements: string[]
  onAcquiredCountChange?: (acquired: number, total: number) => void
}

export function RequirementsChecklist({ listingSlug, requirements, onAcquiredCountChange }: Props) {
  const db = useDb()
  const { theme: t, typo } = useTheme()
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

  const s = useMemo(() => StyleSheet.create({
    container: {},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: t.surfaceSubtle,
    },
    rowLast: { borderBottomWidth: 0 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxAcquired: {
      backgroundColor: t.accent,
      borderColor: t.accent,
    },
    checkmark: {
      color: '#fff',
      fontSize: 14,
      fontFamily: 'Outfit_700Bold',
    },
    rowText: {
      flex: 1,
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textPrimary,
    },
    rowTextAcquired: {
      color: t.textTertiary,
      textDecorationLine: 'line-through',
    },
  }), [t, typo])

  if (!requirements || requirements.length === 0) return null

  return (
    <View style={s.container}>
      {requirements.map((req, i) => {
        const isAcquired = acquired.has(i)
        const isLast = i === requirements.length - 1
        return (
          <Pressable
            key={`${i}-${req}`}
            style={[s.row, isLast && s.rowLast]}
            onPress={() => { void onToggle(i) }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isAcquired }}
            accessibilityLabel={req}
          >
            <View style={[s.checkbox, isAcquired && s.checkboxAcquired]}>
              {isAcquired && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={[s.rowText, isAcquired && s.rowTextAcquired]}>{req}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
