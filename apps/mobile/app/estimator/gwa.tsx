import { useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { computeGwa, latinHonor, hasDisqualifyingGrade, totalUnits, isValidGrade, isValidUnits, type GwaSubject } from '../../utils/gwa'

interface Row { id: string; grade: string; units: string }

let _seq = 0
function newRow(): Row {
  _seq += 1
  return { id: `r${_seq}`, grade: '', units: '' }
}

export default function GwaCalculatorScreen() {
  const { theme: t, typo } = useTheme()
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

  const labelStyle = { fontFamily: 'Lexend_500Medium' as const, fontSize: typo.sm, color: t.textSecondary, marginBottom: 6 }
  const inputStyle = {
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, fontFamily: 'Lexend_400Regular' as const,
    fontSize: typo.base, color: t.textPrimary,
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8,
        paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.border,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 12 }}>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h3, color: t.textPrimary, flex: 1 }}>GWA Calculator</Text>
        <TouchableOpacity onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.sm, color: t.textTertiary }}>Reset</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        bottomOffset={20}
      >
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, marginBottom: 18, lineHeight: 19 }}>
          Enter each subject&apos;s grade on the UP scale (1.00 highest – 5.00 fail) and its units. Your
          General Weighted Average is the units-weighted average: GWA = Σ(grade × units) ÷ Σ(units).
        </Text>

        {/* Result card */}
        <View style={{
          backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16,
          padding: 18, marginBottom: 24, alignItems: 'center',
        }}>
          <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.xs, color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 1 }}>
            Your GWA
          </Text>
          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 40, color: t.textPrimary, marginTop: 4 }}>
            {gwa != null ? gwa.toFixed(4) : '—'}
          </Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginTop: 2 }}>
            {units > 0 ? `${units} total units` : 'Add grades and units below'}
          </Text>
          {honor != null && (
            <View style={{
              marginTop: 12, backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: '#831626',
              borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6,
            }}>
              <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.sm, color: t.accentText }}>🎓 {honor}</Text>
            </View>
          )}
          {gwa != null && honor == null && disqualified && (
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginTop: 10, textAlign: 'center' }}>
              A grade below 3.00 makes you ineligible for Latin honors.
            </Text>
          )}
        </View>

        {/* Subject rows */}
        {rows.map((row, idx) => {
          const gradeErr = row.grade.trim() !== '' && !isValidGrade(parseFloat(row.grade))
          const unitsErr = row.units.trim() !== '' && !isValidUnits(parseFloat(row.units))
          return (
            <View key={row.id} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1.4 }}>
                {idx === 0 ? <Text style={labelStyle}>Grade (1.00–5.00)</Text> : null}
                <TextInput
                  style={[inputStyle, gradeErr ? { borderColor: '#f87171' } : {}]}
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
                  style={[inputStyle, unitsErr ? { borderColor: '#f87171' } : {}]}
                  placeholder="e.g. 3"
                  placeholderTextColor={t.textTertiary}
                  value={row.units}
                  onChangeText={text => updateRow(row.id, { units: text })}
                  keyboardType="decimal-pad"
                />
              </View>
              <TouchableOpacity
                onPress={() => removeRow(row.id)}
                disabled={rows.length <= 1}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
                  opacity: rows.length <= 1 ? 0.4 : 1,
                }}
              >
                <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.base, color: t.textTertiary }}>✕</Text>
              </TouchableOpacity>
            </View>
          )
        })}

        <TouchableOpacity
          onPress={addRow}
          style={{
            marginTop: 6, borderWidth: 1, borderColor: t.border, borderRadius: 14, paddingVertical: 13,
            alignItems: 'center', backgroundColor: t.surface,
          }}
        >
          <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.base, color: t.textSecondary }}>+ Add subject</Text>
        </TouchableOpacity>

        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginTop: 18, lineHeight: 17 }}>
          Latin honors (cumulative): Summa Cum Laude ≤ 1.20 · Magna Cum Laude ≤ 1.45 · Cum Laude ≤ 1.75,
          with no grade below 3.00. This is an unofficial estimate.
        </Text>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  )
}
