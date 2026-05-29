import React, { useState, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { SubjectGroup } from '../utils/groupTopicsBySubject'
import { useTheme } from '../theme/ThemeContext'

interface Props<T> {
  groups: SubjectGroup<T>[]
  emptyText?: string
  initiallyExpanded?: 'first' | 'all' | 'none'
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
    emptyContainer: { paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center' },
    emptyText: { color: t.textTertiary, fontSize: 14, textAlign: 'center' },
    group: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.divider },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      gap: 8,
    },
    chevron: { fontSize: 12, color: t.textSecondary, width: 14 },
    name: { fontSize: 16, fontWeight: '700', color: t.textPrimary, flex: 1 },
    summary: { fontSize: 12, color: t.textTertiary },
    body: { paddingLeft: 12, paddingBottom: 8 },
    rowWrap: { paddingHorizontal: 4 },
  }), [t])

  const initial = useMemo<Record<string, boolean>>(() => {
    if (groups.length === 0) return {}
    if (initiallyExpanded === 'all') {
      return Object.fromEntries(groups.map(g => [g.subjectId, true]))
    }
    if (initiallyExpanded === 'none') {
      return Object.fromEntries(groups.map(g => [g.subjectId, false]))
    }
    // 'first'
    return Object.fromEntries(groups.map((g, i) => [g.subjectId, i === 0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map(g => g.subjectId).join('|'), initiallyExpanded])

  const [expanded, setExpanded] = useState<Record<string, boolean>>(initial)

  if (groups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{emptyText ?? 'Nothing to show'}</Text>
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
              style={styles.header}
              onPress={() => toggle(group.subjectId)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={styles.chevron}>{isOpen ? '▼' : '▶'}</Text>
              <Text style={styles.name}>{group.subjectName}</Text>
              {group.summary ? <Text style={styles.summary}>{group.summary}</Text> : null}
            </Pressable>
            {isOpen ? (
              <View style={styles.body}>
                {group.rows.map((row, idx) => (
                  <View key={keyExtractor ? keyExtractor(row, idx) : idx} style={styles.rowWrap}>
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
