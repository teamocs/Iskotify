import React, { useState, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
import type { SubjectGroup } from '../utils/groupTopicsBySubject'
import { useTheme } from '../theme/ThemeContext'
import { spacing, textStyle } from '../theme/tokens'
import { decorative, focusRing, type WebPressableState } from './ui/a11y'

interface Props<T> {
  groups: SubjectGroup<T>[]
  emptyText?: string
  initiallyExpanded?: 'first' | 'all' | 'none' | 'focused'
  renderRow: (row: T) => React.ReactNode
  keyExtractor?: (row: T, index: number) => string
}

export function SubjectAccordion<T>({
  groups,
  emptyText,
  initiallyExpanded = 'first',
  renderRow,
  keyExtractor,
}: Props<T>) {
  const { theme: t } = useTheme()

  const styles = useMemo(() => StyleSheet.create({
    emptyContainer: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, alignItems: 'center' },
    group: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.divider },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  }), [t])

  const initial = useMemo<Record<string, boolean>>(() => {
    if (groups.length === 0) return {}
    if (initiallyExpanded === 'all') {
      return Object.fromEntries(groups.map(g => [g.subjectId, true]))
    }
    if (initiallyExpanded === 'none') {
      return Object.fromEntries(groups.map(g => [g.subjectId, false]))
    }
    if (initiallyExpanded === 'focused') {
      // Expand all groups marked focused=true. If none are focused, fall back to 'first'.
      const anyFocused = groups.some(g => g.focused === true)
      if (anyFocused) {
        return Object.fromEntries(groups.map(g => [g.subjectId, g.focused === true]))
      }
      return Object.fromEntries(groups.map((g, i) => [g.subjectId, i === 0]))
    }
    // 'first'
    return Object.fromEntries(groups.map((g, i) => [g.subjectId, i === 0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map(g => `${g.subjectId}:${g.focused === true ? 1 : 0}`).join('|'), initiallyExpanded])

  const [expanded, setExpanded] = useState<Record<string, boolean>>(initial)

  if (groups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[textStyle('body', t.textSecondary), { textAlign: 'center' }]} maxFontSizeMultiplier={2}>
          {emptyText ?? 'Nothing to show'}
        </Text>
      </View>
    )
  }

  function toggle(subjectId: string) {
    setExpanded(prev => ({ ...prev, [subjectId]: !prev[subjectId] }))
  }

  return (
    <View>
      {groups.map(group => {
        const isOpen = !!expanded[group.subjectId]
        return (
          <View key={group.subjectId} style={styles.group}>
            <Pressable
              style={(state) => {
                const { pressed, hovered, focused } = state as WebPressableState
                return [
                  styles.header,
                  pressed || hovered ? { backgroundColor: t.surface2 } : null,
                  focusRing(t.focusRing, focused),
                ]
              }}
              onPress={() => toggle(group.subjectId)}
              accessibilityRole="button"
              accessibilityLabel={group.summary ? `${group.subjectName}, ${group.summary}` : group.subjectName}
              aria-expanded={isOpen}
            >
              <View {...decorative} style={{ transform: [{ rotate: isOpen ? '-90deg' : '180deg' }] }}>
                <Lineicons icon={ChevronLeftOutlined} size={16} color={t.textSecondary} />
              </View>
              <Text style={[textStyle('titleSm', t.textPrimary), { flex: 1, minWidth: 0 }]} maxFontSizeMultiplier={2}>
                {group.subjectName}
              </Text>
              {group.summary ? (
                <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={2}>{group.summary}</Text>
              ) : null}
            </Pressable>
            {isOpen ? (
              <View style={styles.body}>
                {group.rows.map((row, idx) => (
                  <View key={keyExtractor ? keyExtractor(row, idx) : idx}>
                    {renderRow(row)}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
