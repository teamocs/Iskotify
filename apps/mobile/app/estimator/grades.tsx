import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDb } from '../../hooks/useDb'
import { useTheme } from '../../theme/ThemeContext'
import { getSettings, updateSettings } from '../../services/settings'
import { validateGwa } from '../../utils/estimatorInputs'

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

// ── Component ─────────────────────────────────────────────────────────────────
export default function EstimatorGradesScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()

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

  // ── Styles (derived from theme tokens) ───────────────────────────────────
  const labelStyle = {
    fontFamily: 'Lexend_500Medium' as const,
    fontSize: typo.sm,
    color: t.textSecondary,
    marginBottom: 6,
  }

  const inputStyle = {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    paddingHorizontal: 14 as number,
    paddingVertical: 13 as number,
    fontFamily: 'Lexend_400Regular' as const,
    fontSize: typo.base,
    color: t.textPrimary,
  }

  const errorTextStyle = {
    fontFamily: 'Lexend_400Regular' as const,
    fontSize: typo.sm,
    color: '#f87171',
    marginTop: 4,
  }

  const sectionHeadStyle = {
    fontFamily: 'Lexend_600SemiBold' as const,
    fontSize: typo.xs,
    color: t.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 28,
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.textPrimary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      {/* ── Header ── */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 12 }}>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h3, color: t.textPrimary, flex: 1 }}>
          Your Grades
        </Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving}
          style={{
            backgroundColor: saving ? t.surface2 : 'rgba(128,0,0,0.82)',
            borderRadius: 12,
            paddingVertical: 8,
            paddingHorizontal: 16,
          }}
        >
          {saving ? (
            <ActivityIndicator color={t.textPrimary} size="small" />
          ) : (
            <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.sm, color: '#fff' }}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        bottomOffset={20}
      >
        {/* ── GWA Section ── */}
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, marginBottom: 20, lineHeight: 19 }}>
          Enter your General Weighted Average (GWA) per grade year. All are on a 0–100 scale; decimals allowed.
        </Text>

        {/* Grade 8 (optional) */}
        <Text style={labelStyle}>Grade 8 GWA <Text style={{ color: t.textTertiary }}>(optional)</Text></Text>
        <TextInput
          style={[inputStyle, g8Error ? { borderColor: '#f87171' } : {}]}
          placeholder="e.g. 88.5"
          placeholderTextColor={t.textTertiary}
          value={g8Text}
          onChangeText={text => { setG8Text(text); setG8Error(null) }}
          keyboardType="decimal-pad"
          returnKeyType="next"
        />
        {g8Error ? <Text style={errorTextStyle}>{g8Error}</Text> : null}

        {/* Grade 9 */}
        <Text style={[labelStyle, { marginTop: 16 }]}>Grade 9 GWA</Text>
        <TextInput
          style={[inputStyle, g9Error ? { borderColor: '#f87171' } : {}]}
          placeholder="e.g. 90.0"
          placeholderTextColor={t.textTertiary}
          value={g9Text}
          onChangeText={text => { setG9Text(text); setG9Error(null) }}
          keyboardType="decimal-pad"
          returnKeyType="next"
        />
        {g9Error ? <Text style={errorTextStyle}>{g9Error}</Text> : null}

        {/* Grade 10 */}
        <Text style={[labelStyle, { marginTop: 16 }]}>Grade 10 GWA</Text>
        <TextInput
          style={[inputStyle, g10Error ? { borderColor: '#f87171' } : {}]}
          placeholder="e.g. 91.5"
          placeholderTextColor={t.textTertiary}
          value={g10Text}
          onChangeText={text => { setG10Text(text); setG10Error(null) }}
          keyboardType="decimal-pad"
          returnKeyType="next"
        />
        {g10Error ? <Text style={errorTextStyle}>{g10Error}</Text> : null}

        {/* Grade 11 */}
        <Text style={[labelStyle, { marginTop: 16 }]}>Grade 11 GWA</Text>
        <TextInput
          style={[inputStyle, g11Error ? { borderColor: '#f87171' } : {}]}
          placeholder="e.g. 92.0"
          placeholderTextColor={t.textTertiary}
          value={g11Text}
          onChangeText={text => { setG11Text(text); setG11Error(null) }}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
        {g11Error ? <Text style={errorTextStyle}>{g11Error}</Text> : null}

        {/* ── School Type ── */}
        <Text style={sectionHeadStyle}>School Type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SCHOOL_TYPE_OPTIONS.map(opt => {
            const active = schoolType === opt.value
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setSchoolType(prev => prev === opt.value ? null : opt.value)}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  backgroundColor: active ? '#831626' : t.surface2,
                  borderWidth: 1,
                  borderColor: active ? '#831626' : t.border,
                }}
              >
                <Text style={{
                  fontFamily: 'Lexend_500Medium',
                  fontSize: typo.sm,
                  color: active ? '#fff' : t.textSecondary,
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── Indigenous Peoples ── */}
        <Text style={sectionHeadStyle}>Indigenous Peoples</Text>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 12,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.base, color: t.textPrimary }}>
              I am a member of an Indigenous People
            </Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginTop: 3 }}>
              For the EEAS palugit (bonus points)
            </Text>
          </View>
          <Switch
            value={isIndigenous}
            onValueChange={setIsIndigenous}
            trackColor={{ false: t.border, true: 'rgba(128,0,0,0.60)' }}
            thumbColor={isIndigenous ? '#831626' : t.surface2}
          />
        </View>

        {/* ── Target Campus ── */}
        <Text style={sectionHeadStyle}>Target Campus</Text>
        <View style={{ gap: 8 }}>
          {CAMPUS_OPTIONS.map(campus => {
            const active = targetCampus === campus
            return (
              <TouchableOpacity
                key={campus}
                onPress={() => setTargetCampus(prev => prev === campus ? null : campus)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: active ? 'rgba(128,0,0,0.12)' : t.surface,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? '#831626' : t.border,
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                  gap: 10,
                }}
              >
                <View style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: active ? 6 : 2,
                  borderColor: active ? '#831626' : t.border,
                  backgroundColor: active ? '#fff' : 'transparent',
                }} />
                <Text style={{
                  fontFamily: active ? 'Outfit_600SemiBold' : 'Lexend_400Regular',
                  fontSize: typo.base,
                  color: active ? t.accentText : t.textPrimary,
                  flex: 1,
                }}>
                  {campus}
                </Text>
                {active ? (
                  <Text style={{ fontSize: 14, color: t.accentText }}>✓</Text>
                ) : null}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── Bottom Save Button ── */}
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving}
          style={{
            marginTop: 32,
            backgroundColor: saving ? t.surface2 : 'rgba(128,0,0,0.82)',
            borderRadius: 16,
            paddingVertical: 15,
            alignItems: 'center',
          }}
        >
          {saving ? (
            <ActivityIndicator color={t.textPrimary} size="small" />
          ) : (
            <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: '#fff' }}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  )
}
