import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, Pressable, TextInput, ScrollView, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { router } from 'expo-router'
import { useDb } from '../../hooks/useDb'
import { getSettings, updateSettings } from '../../services/settings'
import { pushUserData } from '../../services/sync'
import type { IncomeBracket } from '../../utils/scholarshipMatch'
import { PH_PROVINCES } from '../../data/phProvinces'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { Card } from '../../components/ui/Card'
import { PillButton } from '../../components/ui/PillButton'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'

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
  const { theme: t, typo } = useTheme()

  const [incomeBracket, setIncomeBracket] = useState<IncomeBracket | null>(null)
  const [incomePreferNotToSay, setIncomePreferNotToSay] = useState(false)
  const [gwaText, setGwaText] = useState('')
  const [gwaError, setGwaError] = useState<string | null>(null)
  const [province, setProvince] = useState('')
  const [provinceQuery, setProvinceQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
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
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [db])

  const labelStyle = useMemo(() => ({
    fontFamily: 'Lexend_600SemiBold' as const, fontSize: typo.sm, color: t.textPrimary, marginBottom: spacing.sm,
  }), [t, typo])
  const inputStyle = useMemo(() => ({
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.md,
    borderCurve: 'continuous' as const, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular' as const,
  }), [t, typo])

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
      Alert.alert('Could not save', 'Please try again.')
    } finally {
      setSaving(false)
    }
  }, [db, incomeBracket, incomePreferNotToSay, gwaText, province])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <WebTopSpacer />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={{ fontSize: 26, color: t.textSecondary, lineHeight: 30 }}>‹</Text>
        </Pressable>
        <Text style={{ flex: 1, fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' }}>
          Scholarship Profile
        </Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, lineHeight: 19 }}>
          These details power scholarship eligibility matching. All fields are optional — the more you add, the better your matches.
        </Text>

        {/* Income bracket */}
        <Card elevated padded>
          <Text style={labelStyle}>Household Income Bracket</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {INCOME_OPTIONS.map(opt => {
              const isPreferNotToSay = opt.value === null
              const active = isPreferNotToSay
                ? incomePreferNotToSay
                : (!incomePreferNotToSay && incomeBracket === opt.value)
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => {
                    if (isPreferNotToSay) { setIncomePreferNotToSay(true); setIncomeBracket(null) }
                    else { setIncomePreferNotToSay(false); setIncomeBracket(prev => prev === opt.value ? null : opt.value) }
                  }}
                  style={({ pressed }) => [{
                    paddingVertical: 9, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
                    backgroundColor: active ? t.accent : t.surface2,
                    borderWidth: 1, borderColor: active ? t.accent : t.border,
                  }, pressed ? { opacity: 0.85 } : null]}
                >
                  <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.sm, color: active ? '#fff' : t.textSecondary }}>
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Card>

        {/* GWA */}
        <Card elevated padded>
          <Text style={labelStyle}>GWA (General Weighted Average)</Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginBottom: spacing.sm }}>
            Your latest general weighted average (percentage)
          </Text>
          <TextInput
            style={[inputStyle, gwaError ? { borderColor: '#f87171' } : null]}
            placeholder="e.g. 90.5"
            placeholderTextColor={t.textTertiary}
            value={gwaText}
            onChangeText={text => { setGwaText(text); setGwaError(null) }}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          {gwaError ? (
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: '#f87171', marginTop: spacing.xs }}>{gwaError}</Text>
          ) : null}
        </Card>

        {/* Province */}
        <Card elevated padded>
          <Text style={labelStyle}>Province</Text>
          <TextInput
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
              <View style={{ backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.40)', borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
                <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: typo.xs, color: t.accentText }}>{province}</Text>
              </View>
              <Pressable onPress={() => { setProvince(''); setProvinceQuery('') }} hitSlop={8} accessibilityRole="button">
                <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary }}>clear</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={{ maxHeight: 200, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' }}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredProvinces.map(p => (
                <Pressable
                  key={p}
                  onPress={() => { setProvince(p); setProvinceQuery(p) }}
                  style={({ pressed }) => [{
                    paddingHorizontal: spacing.lg, paddingVertical: 11, minHeight: 44, justifyContent: 'center',
                    backgroundColor: province === p ? 'rgba(128,0,0,0.12)' : 'transparent',
                    borderBottomWidth: 1, borderBottomColor: t.border,
                  }, pressed ? { opacity: 0.7 } : null]}
                >
                  <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: province === p ? t.accentText : t.textPrimary }}>{p}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Card>

        <View style={{ marginTop: spacing.sm }}>
          <PillButton label={saving ? 'Saving…' : 'Save'} onPress={() => void handleSave()} fullWidth loading={saving} disabled={!loaded} />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  )
}
