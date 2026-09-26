import { useEffect, useState } from 'react'
import { View, Text, Pressable, Switch } from 'react-native'
import { router } from 'expo-router'
import { useDb } from '../../hooks/useDb'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../theme/tokens'
import { useBreakpoint, columnCount } from '../../hooks/useBreakpoint'
import { Screen } from '../../components/ui/Screen'
import { TwoColumn } from '../../components/ui/TwoColumn'
import { PageTitle } from '../../components/ui/PageTitle'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { FilterChip } from '../../components/ui/Chip'
import { Skeleton } from '../../components/ui/Skeleton'
import { decorative, focusRing, heading, type WebPressableState } from '../../components/ui/a11y'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { getSettings, updateSettings } from '../../services/settings'
import { validateGwa, gwaFailingWarning } from '../../utils/estimatorInputs'

// ── School type options ───────────────────────────────────────────────────────
const SCHOOL_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Public (general)', value: 'public_general' },
  { label: 'Public (vocational)', value: 'public_vocational' },
  { label: 'Public (barangay national)', value: 'public_barangay' },
  { label: 'Public science HS', value: 'public_science' },
  { label: 'SUC-administered HS', value: 'suc' },
  { label: 'Private', value: 'private' },
]

// ── Campus options ────────────────────────────────────────────────────────────
const CAMPUS_OPTIONS = [
  'UP Diliman',
  'UP Manila',
  'UP Los Baños',
  'UP Baguio',
  'UP Cebu',
  'UP Visayas',
  'UP Mindanao',
  'UP Open University',
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseGwaText(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const n = parseFloat(trimmed)
  if (!isFinite(n)) return null
  return n
}

function validateGwaText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null // empty is fine (optional)
  const n = parseFloat(trimmed)
  if (!isFinite(n)) return 'Enter a valid number.'
  const result = validateGwa(n)
  if (result === null) return 'Must be between 0 and 100.'
  return null
}

/** Non-blocking "this looks like a typo" notice — never withholds saving. */
function warningForGwaText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const n = parseFloat(trimmed)
  if (!isFinite(n)) return null
  return gwaFailingWarning(n)
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function EstimatorGradesScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  const twoUp = columnCount(useBreakpoint()) === 2

  // GWA text state
  const [g8Text, setG8Text] = useState('')
  const [g9Text, setG9Text] = useState('')
  const [g10Text, setG10Text] = useState('')
  const [g11Text, setG11Text] = useState('')

  // Inline errors
  const [g8Error, setG8Error] = useState<string | null>(null)
  const [g9Error, setG9Error] = useState<string | null>(null)
  const [g10Error, setG10Error] = useState<string | null>(null)
  const [g11Error, setG11Error] = useState<string | null>(null)

  // Other fields
  const [schoolType, setSchoolType] = useState<string | null>(null)
  const [isIndigenous, setIsIndigenous] = useState(false)
  const [targetCampus, setTargetCampus] = useState<string | null>(null)

  // UI
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ── Load saved settings on mount ──────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const s = await getSettings(db)
        if (s.hsGwaG8 != null) setG8Text(String(s.hsGwaG8))
        if (s.hsGwaG9 != null) setG9Text(String(s.hsGwaG9))
        if (s.hsGwaG10 != null) setG10Text(String(s.hsGwaG10))
        if (s.hsGwaG11 != null) setG11Text(String(s.hsGwaG11))
        if (s.schoolType) setSchoolType(s.schoolType)
        setIsIndigenous(s.isIndigenous ?? false)
        if (s.targetCampus) setTargetCampus(s.targetCampus)
      } catch (e) {
        console.warn('[estimator/grades] load error:', e)
      } finally {
        setLoading(false)
      }
    }
    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Validation ────────────────────────────────────────────────────────────
  function validateAll(): boolean {
    const e8 = validateGwaText(g8Text)
    const e9 = validateGwaText(g9Text)
    const e10 = validateGwaText(g10Text)
    const e11 = validateGwaText(g11Text)
    setG8Error(e8)
    setG9Error(e9)
    setG10Error(e10)
    setG11Error(e11)
    return e8 === null && e9 === null && e10 === null && e11 === null
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!validateAll()) return
    setSaving(true)
    try {
      const patch: Parameters<typeof updateSettings>[1] = {}
      const g8 = parseGwaText(g8Text)
      const g9 = parseGwaText(g9Text)
      const g10 = parseGwaText(g10Text)
      const g11 = parseGwaText(g11Text)

      if (g8 !== null) patch.hsGwaG8 = g8
      if (g9 !== null) patch.hsGwaG9 = g9
      if (g10 !== null) patch.hsGwaG10 = g10
      if (g11 !== null) patch.hsGwaG11 = g11
      if (schoolType !== null) patch.schoolType = schoolType
      patch.isIndigenous = isIndigenous
      if (targetCampus !== null) patch.targetCampus = targetCampus

      await updateSettings(db, patch)
      router.back()
    } catch (e) {
      console.warn('[estimator/grades] save error:', e)
    } finally {
      setSaving(false)
    }
  }

  // Non-blocking notice (Finding 5): 0 < GWA < 60 is almost always a typo —
  // DepEd's passing mark is 60 — but it's a value validateGwa() still accepts,
  // so this never withholds saving. Only shown when there's no blocking error.
  const g8Warning = g8Error ? null : warningForGwaText(g8Text)
  const g9Warning = g9Error ? null : warningForGwaText(g9Text)
  const g10Warning = g10Error ? null : warningForGwaText(g10Text)
  const g11Warning = g11Error ? null : warningForGwaText(g11Text)

  const header = <DetailTopBar bare fallbackHref="/estimator" />

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Screen header={header} edges={['top', 'bottom']}>
        <View accessible accessibilityLabel="Loading your grades" aria-busy style={{ gap: spacing.md, paddingTop: spacing.lg }}>
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={72} radius={radius.md} />)}
        </View>
      </Screen>
    )
  }

  const gwaFields: {
    label: string; placeholder: string; value: string; error: string | null; warning: string | null
    onChange: (text: string) => void; last?: boolean
  }[] = [
    { label: 'Grade 8 GWA (optional)', placeholder: 'e.g. 88.5', value: g8Text, error: g8Error, warning: g8Warning,
      onChange: text => { setG8Text(text); setG8Error(null) } },
    { label: 'Grade 9 GWA', placeholder: 'e.g. 90.0', value: g9Text, error: g9Error, warning: g9Warning,
      onChange: text => { setG9Text(text); setG9Error(null) } },
    { label: 'Grade 10 GWA', placeholder: 'e.g. 91.5', value: g10Text, error: g10Error, warning: g10Warning,
      onChange: text => { setG10Text(text); setG10Error(null) } },
    { label: 'Grade 11 GWA', placeholder: 'e.g. 92.0', value: g11Text, error: g11Error, warning: g11Warning,
      onChange: text => { setG11Text(text); setG11Error(null) }, last: true },
  ]

  const sectionHead = (title: string) => (
    <Text {...heading(2)} style={[textStyle('titleSm', t.textPrimary), { marginTop: spacing.xxl, marginBottom: spacing.md }]} maxFontSizeMultiplier={2}>
      {title}
    </Text>
  )

  const save = (
    <Button label="Save" onPress={() => void handleSave()} loading={saving} size="lg" fullWidth />
  )

  const form = (
    <View>
      <View style={{ gap: spacing.lg }}>
        {gwaFields.map(f => (
          <View key={f.label} style={{ gap: spacing.xs }}>
            <TextField
              label={f.label}
              placeholder={f.placeholder}
              value={f.value}
              onChangeText={f.onChange}
              keyboardType="decimal-pad"
              returnKeyType={f.last ? 'done' : 'next'}
              error={f.error ?? undefined}
            />
            {f.warning ? (
              <Text style={textStyle('bodySm', t.warningStrong)} maxFontSizeMultiplier={2}>{f.warning}</Text>
            ) : null}
          </View>
        ))}
      </View>

      {sectionHead('School type')}
      <View accessibilityRole="radiogroup" accessibilityLabel="School type" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {SCHOOL_TYPE_OPTIONS.map(opt => (
          <FilterChip
            key={opt.value}
            testID={`school-type-chip-${opt.value}`}
            label={opt.label}
            selected={schoolType === opt.value}
            onPress={() => setSchoolType(prev => prev === opt.value ? null : opt.value)}
          />
        ))}
      </View>

      {sectionHead('Indigenous Peoples')}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={textStyle('body', t.textPrimary)} maxFontSizeMultiplier={2}>
            I am a member of an Indigenous People
          </Text>
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
            For the EEAS palugit (bonus points)
          </Text>
        </View>
        <Switch
          value={isIndigenous}
          onValueChange={setIsIndigenous}
          accessibilityLabel="I am a member of an Indigenous People"
          trackColor={{ false: t.inputBorder, true: t.accent }}
          thumbColor={t.surfaceRaised}
        />
      </Card>

      {sectionHead('Target campus')}
      <View accessibilityRole="radiogroup" accessibilityLabel="Target campus" style={{ gap: spacing.sm }}>
        {CAMPUS_OPTIONS.map(campus => {
          const active = targetCampus === campus
          return (
            <Pressable
              key={campus}
              onPress={() => setTargetCampus(prev => prev === campus ? null : campus)}
              accessibilityRole="radio"
              accessibilityLabel={campus}
              aria-checked={active}
              style={(state) => {
                const { pressed, hovered, focused } = state as WebPressableState
                return [
                  {
                    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    paddingHorizontal: spacing.lg,
                    backgroundColor: active ? t.accentSurface : pressed || hovered ? t.surface2 : t.surface,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? t.accent : t.border,
                    borderRadius: radius.md, borderCurve: 'continuous',
                  },
                  focusRing(t.focusRing, focused),
                ]
              }}
            >
              <View
                {...decorative}
                style={{
                  width: 20, height: 20, borderRadius: radius.pill,
                  borderWidth: active ? 6 : 2,
                  borderColor: active ? t.accent : t.inputBorder,
                  backgroundColor: t.surface,
                }}
              />
              <Text style={[textStyle(active ? 'titleSm' : 'body', active ? t.accentText : t.textPrimary), { flex: 1 }]} maxFontSizeMultiplier={2}>
                {campus}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )

  const schoolTypeLabel = SCHOOL_TYPE_OPTIONS.find(o => o.value === schoolType)?.label ?? 'Not set'
  const summaryRows: [string, string][] = [
    ['Grade 8', g8Text.trim() || 'Not set'],
    ['Grade 9', g9Text.trim() || 'Not set'],
    ['Grade 10', g10Text.trim() || 'Not set'],
    ['Grade 11', g11Text.trim() || 'Not set'],
    ['School type', schoolTypeLabel],
    ['Indigenous Peoples', isIndigenous ? 'Yes' : 'No'],
    ['Target campus', targetCampus ?? 'Not set'],
  ]

  const summary = (
    <Card style={{ gap: spacing.md }}>
      <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>Your entries</Text>
      <View>
        {summaryRows.map(([k, v], idx) => (
          <View
            key={k}
            accessible
            accessibilityLabel={`${k}: ${v}`}
            style={{
              flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm,
              borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: t.divider,
            }}
          >
            <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{k}</Text>
            <Text
              style={[textStyle('label', t.textPrimary), { fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' }]}
              maxFontSizeMultiplier={2}
            >
              {v}
            </Text>
          </View>
        ))}
      </View>
      <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={2}>
        Saved on this device. They feed your Estimated Admission Score, based on historical cutoffs.
      </Text>
      {save}
    </Card>
  )

  return (
    <Screen header={header} width={twoUp ? 'wide' : 'reading'} edges={['top', 'bottom']}>
      <PageTitle
        title="Your grades"
        lead="Enter your General Weighted Average (GWA) per grade year. All are on a 0–100 scale; decimals allowed."
      />
      {twoUp ? (
        <TwoColumn primary={form} secondary={summary} />
      ) : (
        <View style={{ gap: spacing.xxl }}>
          {form}
          {save}
        </View>
      )}
    </Screen>
  )
}
