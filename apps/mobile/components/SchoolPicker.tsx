import { useState, useCallback } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useSchoolSearch, MIN_QUERY_LENGTH } from '../hooks/useSchoolSearch'
import { useTheme } from '../theme/ThemeContext'
import { layout, radius, spacing, weight } from '../theme/tokens'
import type { SchoolResult } from '../hooks/useSchoolSearch'
import { Sheet } from './ui/Sheet'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { PressableScale } from './ui/Pressable'
import { SearchField } from './ui/SearchField'
import { Text } from './ui/Text'
import { focusRing } from './ui/a11y'

interface SchoolPickerProps {
  value: string
  onChange: (school: string) => void
  /** Fires with the picked school's region/province when known (DB results only). */
  onSelectMeta?: (meta: { region?: string; province?: string }) => void
}

/**
 * The student's school: a field-shaped trigger that opens a search on the P3
 * in-place Sheet (it has a text input, so not a routed formSheet). Results
 * are grouped rows; "Use …" keeps a school the directory does not know yet.
 */
export function SchoolPicker({ value, onChange, onSelectMeta }: SchoolPickerProps) {
  const [open, setOpen] = useState(false)
  const { query, setQuery, results, loading, error, errorMessage, retry, contributeSchool } = useSchoolSearch()
  const { theme: t } = useTheme()

  const close = useCallback(() => {
    setQuery('')
    setOpen(false)
  }, [setQuery])

  const selectResult = useCallback((r: SchoolResult) => {
    onChange(r.name)
    onSelectMeta?.({ region: r.region, province: r.province })
    setQuery('')
    setOpen(false)
    // Backfill user-selected Places results into the schools directory so
    // future users searching the same school find it in the DB layer.
    if (r.source === 'places') void contributeSchool(r)
  }, [onChange, onSelectMeta, setQuery, contributeSchool])

  const selectTyped = useCallback(() => {
    const name = query.trim()
    if (!name) return
    onChange(name)
    onSelectMeta?.({}) // unknown region for free-typed schools
    setQuery('')
    setOpen(false)
    void contributeSchool({ name, subtitle: '', source: 'manual' })
  }, [onChange, onSelectMeta, query, setQuery, contributeSchool])

  function renderBody() {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      return (
        <Text role="footnote" color={t.textSecondary} style={{ textAlign: 'center', paddingVertical: spacing.xl }}>
          Type at least {MIN_QUERY_LENGTH} characters to search
        </Text>
      )
    }
    if (loading) {
      return (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md }}>
          <ActivityIndicator testID="school-search-loading" color={t.accentText} />
          <Text role="footnote" color={t.textSecondary}>Searching...</Text>
        </View>
      )
    }
    if (error) {
      return (
        <View style={{ alignItems: 'center', paddingTop: spacing.xl, gap: spacing.sm }}>
          <Text role="footnote" color={t.accentText} style={{ textAlign: 'center' }}>Could not search schools.</Text>
          {errorMessage ? (
            <Text role="caption" color={t.textSecondary} style={{ textAlign: 'center' }}>{errorMessage}</Text>
          ) : null}
          <Button label="Retry" variant="ghost" size="sm" onPress={retry} />
        </View>
      )
    }
    if (results.length === 0) {
      return (
        <Text role="footnote" color={t.textSecondary} style={{ textAlign: 'center', paddingVertical: spacing.xl }}>
          No schools found.
        </Text>
      )
    }
    // A short, bounded result list inside the sheet's own scroll view.
    return (
      <View style={{ backgroundColor: t.surface, borderRadius: radius.group, borderCurve: 'continuous', overflow: 'hidden' }}>
        {results.map((item, i) => (
          <PressableScale
            key={`${item.source}-${item.name}-${i}`}
            onPress={() => selectResult(item)}
            accessibilityRole="button"
            accessibilityLabel={item.subtitle ? `${item.name}, ${item.subtitle}` : item.name}
            style={({ pressed, focused }) => [
              {
                minHeight: layout.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                paddingLeft: spacing.lg, backgroundColor: pressed ? t.surface2 : 'transparent',
              },
              focusRing(t.focusRing, focused),
            ]}
          >
            <View style={{ flex: 1, minWidth: 0, paddingVertical: spacing.sm, paddingRight: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text role="headline">{item.name}</Text>
                {item.subtitle ? <Text role="footnote" color={t.textSecondary}>{item.subtitle}</Text> : null}
              </View>
              {item.source === 'database' ? <Badge label="DB" tone="success" /> : null}
              {item.source === 'places' ? <Badge label="Maps" tone="accent" /> : null}
              {i < results.length - 1 ? (
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.divider }} />
              ) : null}
            </View>
          </PressableScale>
        ))}
      </View>
    )
  }

  return (
    <>
      <PressableScale
        testID="school-picker-trigger"
        onPress={() => { setQuery(''); setOpen(true) }}
        accessibilityRole="button"
        accessibilityLabel={value ? `School: ${value}` : 'Choose your school'}
        style={({ focused }) => [
          {
            minHeight: 48, justifyContent: 'center',
            backgroundColor: t.surface, borderWidth: 1, borderColor: t.inputBorder,
            borderRadius: radius.field, borderCurve: 'continuous',
            paddingHorizontal: spacing.md, paddingVertical: spacing.md,
          },
          focusRing(t.focusRing, focused),
        ]}
      >
        <Text role="body" color={value ? t.textPrimary : t.textTertiary} numberOfLines={1}>
          {value || 'Search your school...'}
        </Text>
      </PressableScale>

      <Sheet visible={open} title="School / University" onClose={close}>
        <View style={{ gap: spacing.md }}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search schools..."
            accessibilityLabel="Search schools"
          />
          {renderBody()}
          {query.length >= 1 ? (
            <PressableScale
              onPress={selectTyped}
              accessibilityRole="button"
              accessibilityLabel={`Use "${query}" as your school`}
              style={({ focused }) => [
                { minHeight: layout.rowMinHeight, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.divider },
                focusRing(t.focusRing, focused),
              ]}
            >
              <Text role="footnote" color={t.textSecondary}>Can&apos;t find your school?</Text>
              <Text role="body" color={t.accentText} style={weight('600')}>Use &quot;{query}&quot;</Text>
            </PressableScale>
          ) : null}
        </View>
      </Sheet>
    </>
  )
}
