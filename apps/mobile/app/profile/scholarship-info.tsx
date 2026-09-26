import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { router } from 'expo-router'
import { useDb } from '../../hooks/useDb'
import { getSettings, updateSettings } from '../../services/settings'
import { pushUserData } from '../../services/sync'
import type { IncomeBracket } from '../../utils/scholarshipMatch'
import { PH_PROVINCES } from '../../data/phProvinces'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../theme/tokens'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageTitle } from '../../components/ui/PageTitle'
import { heading } from '../../components/ui/a11y'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { useBreakpoint, pagePadding, contentMaxWidth } from '../../hooks/useBreakpoint'
import { FilterChip } from '../../components/ui/Chip'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'

const INCOME_OPTIONS: { label: string; value: IncomeBracket | null }[] = [
  { label: '₱100k or below / yr', value: '<=100k' },
  { label: '₱100k–₱300k', value: '100k-300k' },
  { label: '₱300k–₱600k', value: '300k-600k' },
  { label: '₱600k–₱1.2M', value: '600k-1.2M' },
  { label: 'Above ₱1.2M', value: '>1.2M' },
  { label: 'Prefer not to say', value: null },
]

export default function ScholarshipInfoScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  // A form reads best at the 720 reading measure on tablets and desktop.
  const bp = useBreakpoint()
  const column = bp === 'compact' ? null : { maxWidth: contentMaxWidth('reading'), alignSelf: 'center' as const }

  const [incomeBracket, setIncomeBracket] = useState<IncomeBracket | null>(null)
  const [incomePreferNotToSay, setIncomePreferNotToSay] = useState(false)
  const [gwaText, setGwaText] = useState('')
  const [gwaError, setGwaError] = useState<string | null>(null)
  const [province, setProvince] = useState('')
  const [provinceQuery, setProvinceQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  // A failed load must not look like an empty form: saving it would wipe the
  // student's real values.
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadKey, setLoadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        setLoadFailed(false)
        const s = await getSettings(db)
        if (cancelled) return
        setIncomeBracket(s.incomeBracket)
        // A saved null income with the rest filled in reads as "prefer not to say".
        setIncomePreferNotToSay(s.incomeBracket === null && (s.gwa != null || !!s.province))
        setGwaText(s.gwa != null ? String(s.gwa) : '')
        setProvince(s.province ?? '')
        setProvinceQuery(s.province ?? '')
      } catch (e) {
        console.warn('[scholarship-info] load error:', e)
        if (!cancelled) setLoadFailed(true)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [db, loadKey])

  const labelStyle = useMemo(() => [textStyle('label', t.textPrimary), { marginBottom: spacing.sm }], [t])
  const hintStyle = useMemo(() => [textStyle('bodySm', t.textSecondary), { marginBottom: spacing.sm }], [t])
  // Control boundary: textTertiary clears 3:1 (WCAG 1.4.11) on both surfaces.
  const inputStyle = useMemo(() => ({
    ...textStyle('body', t.textPrimary),
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.textTertiary, borderRadius: radius.md,
    borderCurve: 'continuous' as const, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 48,
  }), [t])

  const filteredProvinces = provinceQuery.trim().length > 0
    ? PH_PROVINCES.filter(p => p.toLowerCase().includes(provinceQuery.toLowerCase()))
    : PH_PROVINCES

  const handleSave = useCallback(async () => {
    const gwaNum = gwaText.trim() ? parseFloat(gwaText.trim()) : null
    if (gwaText.trim() && (isNaN(gwaNum!) || gwaNum! < 75 || gwaNum! > 100)) {
      setGwaError('GWA must be between 75 and 100.')
      return
    }
    setGwaError(null)
    setSaveError(null)
    setSaving(true)
    try {
      await updateSettings(db, {
        incomeBracket: incomePreferNotToSay ? null : incomeBracket,
        gwa: gwaNum,
        province: province.trim() || null,
      })
      void pushUserData(db).catch(() => {})
      router.back()
    } catch (e) {
      console.warn('[scholarship-info] save error:', e)
      setSaveError("Couldn't save. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }, [db, incomeBracket, incomePreferNotToSay, gwaText, province])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <DetailTopBar fallbackHref="/profile" />

      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: pagePadding(bp), paddingBottom: spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <View testID="scholarship-form" style={[{ gap: spacing.md, width: '100%' }, column]}>
        <PageTitle
          title="Scholarship profile"
          lead="These details power scholarship eligibility matching. All fields are optional, and the more you add, the better your matches."
        />

        {!loaded ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton accessible label="Loading your scholarship profile" height={120} />
            <Skeleton height={96} />
          </View>
        ) : loadFailed ? (
          <ErrorState
            title="Couldn't load your scholarship profile"
            onRetry={() => { setLoaded(false); setLoadKey(k => k + 1) }}
          />
        ) : (
          <>
            {/* Income bracket */}
            <Card>
              <Text {...heading(2)} style={labelStyle} maxFontSizeMultiplier={2}>Household income bracket</Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Household income bracket"
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
              >
                {INCOME_OPTIONS.map(opt => {
                  const isPreferNotToSay = opt.value === null
                  const active = isPreferNotToSay
                    ? incomePreferNotToSay
                    : (!incomePreferNotToSay && incomeBracket === opt.value)
                  return (
                    <FilterChip
                      key={opt.label}
                      label={opt.label}
                      selected={active}
                      onPress={() => {
                        if (isPreferNotToSay) { setIncomePreferNotToSay(true); setIncomeBracket(null) }
                        else { setIncomePreferNotToSay(false); setIncomeBracket(prev => prev === opt.value ? null : opt.value) }
                      }}
                    />
                  )
                })}
              </View>
            </Card>

            {/* GWA */}
            <Card>
              <Text style={labelStyle} maxFontSizeMultiplier={2}>GWA (General Weighted Average)</Text>
              <Text style={hintStyle} maxFontSizeMultiplier={2}>Your latest general weighted average (percentage)</Text>
              <TextInput
                accessibilityLabel="GWA (General Weighted Average)"
                accessibilityHint="Your latest general weighted average, from 75 to 100"
                style={[inputStyle, gwaError ? { borderColor: t.dangerBorder } : null]}
                placeholder="e.g. 90.5"
                placeholderTextColor={t.textTertiary}
                value={gwaText}
                onChangeText={text => { setGwaText(text); setGwaError(null) }}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              {gwaError ? (
                <Text accessibilityRole="alert" style={[textStyle('bodySm', t.danger), { marginTop: spacing.xs }]} maxFontSizeMultiplier={2}>
                  {gwaError}
                </Text>
              ) : null}
            </Card>

            {/* Province */}
            <Card>
              <Text style={labelStyle} maxFontSizeMultiplier={2}>Province</Text>
              <TextInput
                accessibilityLabel="Province"
                accessibilityHint="Type to filter the list below"
                style={[inputStyle, { marginBottom: spacing.xs }]}
                placeholder="Search province..."
                placeholderTextColor={t.textTertiary}
                value={provinceQuery}
                onChangeText={setProvinceQuery}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="words"
              />
              {province.trim() ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                  <View
                    style={{
                      backgroundColor: t.accentSurface, borderWidth: 1, borderColor: t.accentBorder, borderRadius: radius.sm,
                      paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                    }}
                  >
                    <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={2}>{province}</Text>
                  </View>
                  <Pressable
                    onPress={() => { setProvince(''); setProvinceQuery('') }}
                    accessibilityRole="button"
                    accessibilityLabel="Clear province"
                    style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }}
                  >
                    <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={2}>Clear</Text>
                  </Pressable>
                </View>
              ) : null}
              <View accessibilityRole="radiogroup" accessibilityLabel="Province" style={{ maxHeight: 220, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' }}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {filteredProvinces.map(p => {
                    const selected = province === p
                    return (
                      <Pressable
                        key={p}
                        onPress={() => { setProvince(p); setProvinceQuery(p) }}
                        accessibilityRole="radio"
                        aria-checked={selected}
                        style={({ pressed }) => ({
                          paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center',
                          backgroundColor: selected ? t.accentSurface : pressed ? t.surface2 : 'transparent',
                          borderBottomWidth: 1, borderBottomColor: t.divider,
                        })}
                      >
                        <Text style={textStyle(selected ? 'label' : 'bodySm', selected ? t.accentText : t.textPrimary)} maxFontSizeMultiplier={2}>
                          {p}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            </Card>

            {saveError ? (
              <Text accessibilityRole="alert" style={textStyle('bodySm', t.dangerStrong)} maxFontSizeMultiplier={2}>{saveError}</Text>
            ) : null}
            <View style={{ marginTop: spacing.sm }}>
              <Button label="Save" accessibilityLabel="Save" size="lg" onPress={() => void handleSave()} fullWidth={bp === 'compact'} loading={saving} disabled={!loaded} />
            </View>
          </>
        )}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  )
}
