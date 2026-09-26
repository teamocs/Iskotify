import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Calculator1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../theme/tokens'
import { useBreakpoint, columnCount } from '../../hooks/useBreakpoint'
import { useAdmissionEstimate } from '../../hooks/useAdmissionEstimate'
import { MIN_ANSWERS, type SubtestKey } from '../../utils/subtestReadiness'
import { campusAccessibilityLabel, type CampusStatus } from '../../utils/admissionEstimate'
import { Screen } from '../../components/ui/Screen'
import { TwoColumn } from '../../components/ui/TwoColumn'
import { PageTitle } from '../../components/ui/PageTitle'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { decorative, heading } from '../../components/ui/a11y'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import {
  ScoreDisclaimerModal,
  ScoreDisclaimerNotice,
} from '../../components/estimator/ScoreDisclaimerModal'

// Display order + the exact subtest label utils/upcatExam.ts's SUBTESTS and the
// drill route (app/practice/upcat/[subtest].tsx) expect.
const SUBTEST_ROWS: { key: SubtestKey; label: string }[] = [
  { key: 'math', label: 'Mathematics' },
  { key: 'reading', label: 'Reading Comprehension' },
  { key: 'language', label: 'Language Proficiency' },
  { key: 'science', label: 'Science' },
]

const STATUS_GROUPS: CampusStatus[] = ['Likely', 'Possible', 'Unlikely']

const TABULAR = { fontVariant: ['tabular-nums' as const] }

type Theme = ReturnType<typeof useTheme>['theme']

function CardHeading({ children }: { children: string }) {
  const { theme: t } = useTheme()
  return (
    <Text {...heading(2)} style={[textStyle('titleSm', t.textPrimary), { marginBottom: spacing.sm }]} maxFontSizeMultiplier={2}>
      {children}
    </Text>
  )
}

// ── Range bar (lower is better; the point sits inside the low–high band) ──────
// Neutral ink: the estimate is a range, not a verdict.

function RangeBar({ point, low, high, t }: { point: number; low: number; high: number; t: Theme }) {
  const MIN = 1.0
  const MAX = 5.0
  const pct = (v: number) => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)))

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={textStyle('numericLg', t.textPrimary)} maxFontSizeMultiplier={1.5}>
        {point.toFixed(2)}
      </Text>
      <Text style={[textStyle('bodySm', t.textSecondary), TABULAR]} maxFontSizeMultiplier={2}>
        Range {low.toFixed(2)}–{high.toFixed(2)} · lower is better
      </Text>

      <View
        {...decorative}
        style={{
          height: 12, backgroundColor: t.surface2, borderRadius: radius.pill,
          marginTop: spacing.sm, overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${pct(low) * 100}%`, width: `${(pct(high) - pct(low)) * 100}%`,
            backgroundColor: t.divider,
          }}
        />
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: `${pct(point) * 100}%`,
            width: 3, backgroundColor: t.textPrimary, borderRadius: 2, transform: [{ translateX: -1.5 }],
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[textStyle('caption', t.textSecondary), TABULAR]} maxFontSizeMultiplier={2}>1.00 (best)</Text>
        <Text style={[textStyle('caption', t.textSecondary), TABULAR]} maxFontSizeMultiplier={2}>5.00 (worst)</Text>
      </View>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EstimatorScreen() {
  const { theme: t } = useTheme()
  const twoUp = columnCount(useBreakpoint()) === 2
  const { status, readiness, result, acknowledgeDisclaimer, reload } = useAdmissionEstimate()

  const editGrades = () => router.push('/estimator/grades')

  const notReadyRows = readiness
    ? SUBTEST_ROWS.filter(row => readiness[row.key].needed > 0)
    : []

  const groupedCampuses = result
    ? STATUS_GROUPS.map(group => ({ group, rows: result.campuses.filter(c => c.status === group) })).filter(g => g.rows.length > 0)
    : []

  const body = (() => {
    if (status === 'loading') {
      return (
        <View accessible accessibilityLabel="Loading your estimate" aria-busy style={{ gap: spacing.md }}>
          <Skeleton height={140} radius={radius.xl} />
          <Skeleton height={96} radius={radius.xl} />
          <Skeleton height={96} radius={radius.xl} />
        </View>
      )
    }

    if (status === 'no-grades') {
      return (
        <>
          <ScoreDisclaimerNotice />
          <EmptyState
            icon={<Lineicons icon={Calculator1Outlined} size={24} color={t.textSecondary} />}
            title="No grades yet"
            body="Add your Grade 8–11 GWA to see your Estimated Admission Score, based on historical cutoffs."
            actionLabel="Add your grades"
            onAction={editGrades}
          />
        </>
      )
    }

    if (status === 'not-ready' && readiness) {
      return (
        <>
          <ScoreDisclaimerNotice />
          <Card>
            <CardHeading>Practice to unlock your estimate</CardHeading>
            <Text style={[textStyle('body', t.textSecondary), { marginBottom: spacing.sm }]} maxFontSizeMultiplier={2}>
              Your Estimated Admission Score unlocks once you&apos;ve answered at least {MIN_ANSWERS} questions
              in each UPCAT subtest.
            </Text>
            {notReadyRows.map((row, idx) => {
              const r = readiness[row.key]
              return (
                <View
                  key={row.key}
                  style={{
                    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md,
                    paddingVertical: spacing.sm,
                    borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: t.divider,
                  }}
                >
                  <Text style={[textStyle('body', t.textPrimary), TABULAR, { flex: 1, minWidth: 160 }]} maxFontSizeMultiplier={2}>
                    {row.label}: {r.answered} of {MIN_ANSWERS} questions
                  </Text>
                  <Button
                    label="Practice"
                    accessibilityLabel={`Practice ${row.label}`}
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push(`/practice/upcat/${row.label}?mode=quick` as never)}
                  />
                </View>
              )
            })}
          </Card>
          <View style={{ marginTop: spacing.lg }}>
            <Button label="Edit grades" variant="ghost" onPress={editGrades} />
          </View>
        </>
      )
    }

    if (status === 'ready' && result && readiness) {
      const summary = (
        <Card testID="estimate-summary" style={{ gap: spacing.md }}>
          <CardHeading>Your estimate</CardHeading>
          <RangeBar point={result.point} low={result.low} high={result.high} t={t} />
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
            Computed on this device, based on historical cutoffs — not your official UPG.
          </Text>
          <Button label="Edit grades" variant="secondary" onPress={editGrades} fullWidth />
        </Card>
      )

      const subtests = (
        <Card>
          <CardHeading>Your subtest scores</CardHeading>
          {SUBTEST_ROWS.map((row, idx) => (
            <View
              key={row.key}
              style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md,
                minHeight: 44, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: t.divider,
              }}
            >
              <Text style={[textStyle('body', t.textSecondary), { flex: 1 }]} maxFontSizeMultiplier={2}>{row.label}</Text>
              <Text style={[textStyle('titleSm', t.textPrimary), TABULAR]} maxFontSizeMultiplier={1.6}>
                {readiness[row.key].percent}%
              </Text>
            </View>
          ))}
        </Card>
      )

      const adjustments = (result.eeas.palugit > 0 || result.eeas.pabigat > 0) ? (
        <Card style={{ gap: spacing.xs }}>
          <CardHeading>Adjustments to your estimate</CardHeading>
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
            A lower score is better, so a bonus subtracts and a distance adjustment adds.
          </Text>
          {result.eeas.palugit > 0 ? (
            <Text style={[textStyle('body', t.textPrimary), TABULAR]} maxFontSizeMultiplier={2}>
              Palugit (public-school / Indigenous Peoples bonus): −{result.eeas.palugit.toFixed(2)}
            </Text>
          ) : null}
          {result.eeas.pabigat > 0 ? (
            <Text style={[textStyle('body', t.textPrimary), TABULAR]} maxFontSizeMultiplier={2}>
              Pabigat (distant target-campus adjustment): +{result.eeas.pabigat.toFixed(2)}
            </Text>
          ) : null}
        </Card>
      ) : null

      const outlook = (
        <Card>
          <CardHeading>Per-campus outlook</CardHeading>
          <Text style={[textStyle('bodySm', t.textSecondary), { marginBottom: spacing.xs }]} maxFontSizeMultiplier={2}>
            How your estimate compares with each campus&apos;s historical cutoff.
          </Text>
          {groupedCampuses.map(({ group, rows }) => (
            <View key={group} style={{ marginTop: spacing.md }}>
              <Text {...heading(3)} style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={2}>
                {group}
              </Text>
              {rows.map((row, idx) => (
                <View
                  key={`${row.campus}-${row.program ?? ''}`}
                  accessible
                  accessibilityLabel={campusAccessibilityLabel(row)}
                  style={{
                    minHeight: 44, justifyContent: 'center', paddingVertical: spacing.sm, gap: 2,
                    borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: t.divider,
                  }}
                >
                  <Text style={textStyle('body', t.textPrimary)} maxFontSizeMultiplier={2}>
                    {row.campus}{row.program ? ` – ${row.program}` : ''}
                  </Text>
                  <Text style={[textStyle('caption', t.textSecondary), TABULAR]} maxFontSizeMultiplier={2}>
                    Cutoff: {row.cutoff.toFixed(2)}{row.year != null ? ` (${row.year})` : ''}{row.isEstimate ? ' · estimate' : ''}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </Card>
      )

      const stack = { gap: spacing.lg }
      return (
        <>
          <ScoreDisclaimerNotice />
          {twoUp ? (
            <TwoColumn
              primary={<View style={stack}>{subtests}{adjustments}{outlook}</View>}
              secondary={summary}
            />
          ) : (
            // Phones and tablets lead with the result.
            <View style={stack}>{summary}{subtests}{adjustments}{outlook}</View>
          )}
        </>
      )
    }

    if (status === 'error') {
      return (
        <>
          <ScoreDisclaimerNotice />
          <ErrorState
            title="Estimate unavailable"
            body="Your grades and practice answers are still saved on this device. Try loading them again."
            onRetry={reload}
          />
        </>
      )
    }

    return null
  })()

  return (
    <Screen
      width={status === 'ready' ? 'wide' : 'reading'}
      edges={['top', 'bottom']}
      header={<DetailTopBar bare fallbackHref="/practice" />}
    >
      <ScoreDisclaimerModal
        visible={status === 'disclaimer'}
        onAcknowledge={() => void acknowledgeDisclaimer()}
      />
      <PageTitle
        title="Estimated Admission Score"
        lead="An unofficial estimate from your grades and practice, based on historical cutoffs."
      />
      {body}
    </Screen>
  )
}
