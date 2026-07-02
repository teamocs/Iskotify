import { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, statusColors } from '../../theme/tokens'
import { Card } from '../../components/ui/Card'
import { AppButton } from '../../components/ui/AppButton'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'
import { useWebContentWidth } from '../../components/ui/webMaxWidth'
import { computeGwa, latinHonor, hasDisqualifyingGrade, totalUnits, isValidGrade, isValidUnits, type GwaSubject } from '../../utils/gwa'

interface Row { id: string; grade: string; units: string }

let _seq = 0
function newRow(): Row {
  _seq += 1
  return { id: `r${_seq}`, grade: '', units: '' }
}

export default function GwaCalculatorScreen() {
  const { theme: t, typo } = useTheme()
  // Web-only max-width centering for the form scroll content (null on native/sm).
  const webWidth = useWebContentWidth()
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow(), newRow()])

  const parsed: GwaSubject[] = useMemo(
    () => rows.map(r => ({ grade: parseFloat(r.grade), units: parseFloat(r.units) })),
    [rows],
  )
  const gwa = useMemo(() => computeGwa(parsed), [parsed])
  const disqualified = useMemo(() => hasDisqualifyingGrade(parsed), [parsed])
  const honor = useMemo(() => latinHonor(gwa, disqualified), [gwa, disqualified])
  const units = useMemo(() => totalUnits(parsed), [parsed])

  function updateRow(id: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows(prev => [...prev, newRow()]) }
  function removeRow(id: string) { setRows(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : prev)) }
  function reset() { setRows([newRow(), newRow(), newRow()]) }

  const labelStyle = { fontFamily: 'Lexend_500Medium' as const, fontSize: typo.sm, color: t.textSecondary, marginBottom: spacing.xs + 2 }
  const inputStyle = {
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 11, fontFamily: 'Lexend_400Regular' as const,
    fontSize: typo.base, color: t.textPrimary,
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <WebTopSpacer />
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.sm,
        paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border,
      }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          style={({ pressed }) => [{ marginRight: spacing.md }, pressed ? { opacity: 0.7 } : null]}
        >
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>← Back</Text>
        </Pressable>
        <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h3, color: t.textPrimary, flex: 1 }}>GWA Calculator</Text>
        <Pressable
          onPress={reset}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.sm, color: t.textTertiary }}>Reset</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxxl + spacing.lg }, webWidth]}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        bottomOffset={20}
      >
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, marginBottom: spacing.lg, lineHeight: 19 }}>
          Enter each subject&apos;s grade on the UP scale (1.00 highest – 5.00 fail) and its units. Your
          General Weighted Average is the units-weighted average: GWA = Σ(grade × units) ÷ Σ(units).
        </Text>

        {/* Result card */}
        <Card elevated style={{ marginBottom: spacing.xxl, alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.xs, color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 1 }}>
            Your GWA
          </Text>
          <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h1, color: t.textPrimary, marginTop: spacing.xs }}>
            {gwa != null ? gwa.toFixed(4) : '—'}
          </Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginTop: 2 }}>
            {units > 0 ? `${units} total units` : 'Add grades and units below'}
          </Text>
          {honor != null ? (
            <View style={{
              marginTop: spacing.md, backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)',
              borderRadius: radius.pill, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.xs + 2,
            }}>
              <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.sm, color: t.accentText }}>🎓 {honor}</Text>
            </View>
          ) : null}
          {gwa != null && honor == null && disqualified ? (
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginTop: spacing.sm + 2, textAlign: 'center' }}>
              A grade below 3.00 makes you ineligible for Latin honors.
            </Text>
          ) : null}
        </Card>

        {/* Subject rows */}
        {rows.map((row, idx) => {
          const gradeErr = row.grade.trim() !== '' && !isValidGrade(parseFloat(row.grade))
          const unitsErr = row.units.trim() !== '' && !isValidUnits(parseFloat(row.units))
          return (
            <View key={row.id} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm + 2, marginBottom: spacing.md + 2 }}>
              <View style={{ flex: 1.4 }}>
                {idx === 0 ? <Text style={labelStyle}>Grade (1.00–5.00)</Text> : null}
                <TextInput
                  style={[inputStyle, gradeErr ? { borderColor: statusColors.weak } : {}]}
                  placeholder="e.g. 1.25"
                  placeholderTextColor={t.textTertiary}
                  value={row.grade}
                  onChangeText={text => updateRow(row.id, { grade: text })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                {idx === 0 ? <Text style={labelStyle}>Units</Text> : null}
                <TextInput
                  style={[inputStyle, unitsErr ? { borderColor: statusColors.weak } : {}]}
                  placeholder="e.g. 3"
                  placeholderTextColor={t.textTertiary}
                  value={row.units}
                  onChangeText={text => updateRow(row.id, { units: text })}
                  keyboardType="decimal-pad"
                />
              </View>
              <Pressable
                onPress={() => removeRow(row.id)}
                disabled={rows.length <= 1}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Remove subject"
                style={({ pressed }) => [
                  {
                    width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
                    opacity: rows.length <= 1 ? 0.4 : 1,
                  },
                  pressed && rows.length > 1 ? { opacity: 0.7 } : null,
                ]}
              >
                <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.base, color: t.textTertiary }}>✕</Text>
              </Pressable>
            </View>
          )
        })}

        <View style={{ marginTop: spacing.xs + 2 }}>
          <AppButton label="+ Add subject" onPress={addRow} variant="secondary" />
        </View>

        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginTop: spacing.lg, lineHeight: 17 }}>
          Latin honors (cumulative): Summa Cum Laude ≤ 1.20 · Magna Cum Laude ≤ 1.45 · Cum Laude ≤ 1.75,
          with no grade below 3.00. This is an unofficial estimate.
        </Text>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  )
}
