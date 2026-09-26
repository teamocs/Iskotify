import { useMemo, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GraduationCap1Outlined, PlusOutlined, XmarkOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../theme/tokens'
import { useBreakpoint, columnCount } from '../../hooks/useBreakpoint'
import { Screen } from '../../components/ui/Screen'
import { TwoColumn } from '../../components/ui/TwoColumn'
import { PageTitle } from '../../components/ui/PageTitle'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { decorative, focusRing, heading, type WebPressableState } from '../../components/ui/a11y'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { computeGwa, latinHonor, hasDisqualifyingGrade, totalUnits, isValidGrade, isValidUnits, type GwaSubject } from '../../utils/gwa'

interface Row { id: string; grade: string; units: string }

let _seq = 0
function newRow(): Row {
  _seq += 1
  return { id: `r${_seq}`, grade: '', units: '' }
}

export default function GwaCalculatorScreen() {
  const { theme: t } = useTheme()
  const twoUp = columnCount(useBreakpoint()) === 2
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

  const summary = (
    <Card testID="gwa-summary" style={{ gap: spacing.sm }}>
      <Text {...heading(2)} style={textStyle('titleSm', t.textSecondary)} maxFontSizeMultiplier={2}>Your GWA</Text>
      <Text
        style={textStyle('numericLg', t.textPrimary)}
        maxFontSizeMultiplier={1.5}
        accessibilityLiveRegion="polite"
      >
        {gwa != null ? gwa.toFixed(4) : '—'}
      </Text>
      <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
        {units > 0 ? `${units} total units` : 'Add grades and units to see it'}
      </Text>
      {honor != null ? (
        <View style={{
          alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
          backgroundColor: t.surface2, borderRadius: radius.pill,
          paddingHorizontal: spacing.md, minHeight: 32,
        }}>
          <View {...decorative}><Lineicons icon={GraduationCap1Outlined} size={16} color={t.textPrimary} /></View>
          <Text style={textStyle('label', t.textPrimary)} maxFontSizeMultiplier={2}>{honor}</Text>
        </View>
      ) : null}
      {gwa != null && honor == null && disqualified ? (
        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
          A grade below 3.00 makes you ineligible for Latin honors.
        </Text>
      ) : null}
      <Text style={[textStyle('caption', t.textSecondary), { marginTop: spacing.xs }]} maxFontSizeMultiplier={2}>
        Latin honors (cumulative): Summa Cum Laude ≤ 1.20 · Magna Cum Laude ≤ 1.45 · Cum Laude ≤ 1.75,
        with no grade below 3.00. This is an unofficial estimate.
      </Text>
    </Card>
  )

  const form = (
    <View style={{ gap: spacing.lg }}>
      {rows.map((row, idx) => {
        const n = idx + 1
        const gradeErr = row.grade.trim() !== '' && !isValidGrade(parseFloat(row.grade))
        const unitsErr = row.units.trim() !== '' && !isValidUnits(parseFloat(row.units))
        const canRemove = rows.length > 1
        return (
          <View key={row.id} style={{ gap: spacing.xs }}>
            <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>
              Subject {n}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <View style={{ flex: 1.4, minWidth: 0 }}>
                <TextField
                  label="Grade"
                  accessibilityLabel={`Subject ${n} grade`}
                  placeholder="e.g. 1.25"
                  value={row.grade}
                  onChangeText={text => updateRow(row.id, { grade: text })}
                  keyboardType="decimal-pad"
                  error={gradeErr ? 'Enter a grade between 1.00 and 5.00.' : undefined}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <TextField
                  label="Units"
                  accessibilityLabel={`Subject ${n} units`}
                  placeholder="e.g. 3"
                  value={row.units}
                  onChangeText={text => updateRow(row.id, { units: text })}
                  keyboardType="decimal-pad"
                  error={unitsErr ? 'Enter units above 0.' : undefined}
                />
              </View>
              <Pressable
                onPress={() => removeRow(row.id)}
                disabled={!canRemove}
                accessibilityRole="button"
                accessibilityLabel={`Remove subject ${n}`}
                aria-disabled={!canRemove}
                style={(state) => {
                  const { pressed, hovered, focused } = state as WebPressableState
                  return [
                    {
                      // Sits level with the input under its label.
                      marginTop: 22, width: 48, height: 48, borderRadius: radius.md, borderCurve: 'continuous',
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: (pressed || hovered) && canRemove ? t.surface2 : 'transparent',
                      opacity: canRemove ? 1 : 0.4,
                    },
                    focusRing(t.focusRing, focused),
                  ]
                }}
              >
                <View {...decorative}><Lineicons icon={XmarkOutlined} size={18} color={t.textSecondary} /></View>
              </Pressable>
            </View>
          </View>
        )
      })}

      <Button
        label="Add subject"
        onPress={addRow}
        variant="secondary"
        icon={<Lineicons icon={PlusOutlined} size={18} color={t.accentText} />}
      />
    </View>
  )

  return (
    <Screen
      width={twoUp ? 'wide' : 'reading'}
      edges={['top', 'bottom']}
      header={
        <DetailTopBar
          bare
          fallbackHref="/estimator"
          actions={<Button label="Reset" variant="ghost" size="sm" onPress={reset} />}
        />
      }
    >
      <PageTitle
        title="GWA calculator"
        lead="Enter each subject's grade on the UP scale (1.00 is highest, 5.00 lowest) and its units. GWA = Σ(grade × units) ÷ Σ(units)."
      />
      {twoUp ? (
        <TwoColumn primary={form} secondary={summary} />
      ) : (
        // Phones: the live result sits above the rows it summarises.
        <View style={{ gap: spacing.xl }}>{summary}{form}</View>
      )}
    </Screen>
  )
}
