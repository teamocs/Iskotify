import { useMemo } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { useAdmissionEstimate } from '../../hooks/useAdmissionEstimate'
import { MIN_ANSWERS, type SubtestKey } from '../../utils/subtestReadiness'
import { campusAccessibilityLabel, type CampusStatus } from '../../utils/admissionEstimate'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
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
const STATUS_TONE: Record<CampusStatus, 'success' | 'warning' | 'neutral'> = {
  Likely: 'success',
  Possible: 'warning',
  Unlikely: 'neutral',
}

// ── Range bar (lower is better; the point sits inside the low–high band) ──────

function RangeBar({
  point,
  low,
  high,
  t,
  typo,
}: {
  point: number
  low: number
  high: number
  t: ReturnType<typeof useTheme>['theme']
  typo: ReturnType<typeof useTheme>['typo']
}) {
  const MIN = 1.0
  const MAX = 5.0
  const span = MAX - MIN
  const pct = (v: number) => Math.max(0, Math.min(1, (v - MIN) / span))

  return (
    <View>
      <Text
        style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.xl, color: t.textPrimary, marginBottom: 4 }}
        maxFontSizeMultiplier={1.6}
      >
        {point.toFixed(2)}
      </Text>
      <Text
        style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, marginBottom: 10 }}
        maxFontSizeMultiplier={1.6}
      >
        Range {low.toFixed(2)}–{high.toFixed(2)} · lower is better
      </Text>

      <View
        style={{
          height: 12, backgroundColor: t.surface2, borderRadius: radius.sm,
          marginVertical: spacing.xs, overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${pct(low) * 100}%`, width: `${(pct(high) - pct(low)) * 100}%`,
            backgroundColor: t.accentSurface,
          }}
        />
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: `${pct(point) * 100}%`,
            width: 3, backgroundColor: t.accent, borderRadius: 2, transform: [{ translateX: -1.5 }],
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary }} maxFontSizeMultiplier={1.6}>
          1.00 (best)
        </Text>
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary }} maxFontSizeMultiplier={1.6}>
          5.00 (worst)
        </Text>
      </View>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EstimatorScreen() {
  const { theme: t, typo } = useTheme()
  const { status, readiness, result, acknowledgeDisclaimer, reload } = useAdmissionEstimate()

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: t.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        },
        backBtn: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginRight: spacing.md },
        title: { fontFamily: 'Outfit_700Bold', fontSize: typo.h3, color: t.textPrimary, flex: 1 },
        content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 60 },
        card: {
          backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
          borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.lg, marginBottom: spacing.md,
        },
        cardTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textPrimary, marginBottom: spacing.md },
        campusRow: {
          flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
          paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: t.border, gap: spacing.sm,
        },
        campusName: { fontFamily: 'Outfit_600SemiBold', fontSize: typo.sm, color: t.textPrimary, flex: 1, flexShrink: 1 },
        campusMeta: { fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginTop: 2 },
        subtestRow: {
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingVertical: spacing.sm - 2,
        },
        subtestName: { fontFamily: 'Lexend_500Medium', fontSize: typo.sm, color: t.textSecondary },
        subtestPct: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textPrimary },
        unlockRow: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingVertical: spacing.sm, gap: spacing.sm,
        },
        unlockLabel: { fontFamily: 'Lexend_500Medium', fontSize: typo.sm, color: t.textPrimary, flex: 1 },
        unlockBtn: {
          minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md,
          borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: t.accentSurface,
        },
        unlockBtnTxt: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.sm, color: t.accentText },
        emptyTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.xl, color: t.textPrimary, marginBottom: spacing.sm },
        emptySubtitle: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, marginBottom: spacing.xxl, lineHeight: 20 },
        primaryBtn: {
          minHeight: 48, backgroundColor: t.accentStrong, borderRadius: radius.md, borderCurve: 'continuous',
          paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center',
        },
        primaryBtnText: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textInverse },
        editLink: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.accentText, textDecorationLine: 'underline', marginTop: spacing.xs, minHeight: 44, textAlignVertical: 'center' },
        eeasLine: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, marginBottom: spacing.xs, lineHeight: 19 },
      }),
    [t, typo],
  )

  const notReadyRows = readiness
    ? SUBTEST_ROWS.filter(row => readiness[row.key].needed > 0)
    : []

  const groupedCampuses = result
    ? STATUS_GROUPS.map(group => ({ group, rows: result.campuses.filter(c => c.status === group) })).filter(g => g.rows.length > 0)
    : []

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScoreDisclaimerModal
        visible={status === 'disclaimer'}
        onAcknowledge={() => void acknowledgeDisclaimer()}
      />

      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Lineicons icon={ChevronLeftOutlined} size={18} color={t.textSecondary} />
            <Text style={s.backBtn} maxFontSizeMultiplier={1.6}>Back</Text>
          </View>
        </TouchableOpacity>
        <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>Estimated Admission Score</Text>
      </View>

      {status === 'loading' ? (
        <View
          accessible
          accessibilityLabel="Loading your estimate"
          aria-busy
          style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }}
        >
          <Skeleton height={120} radius={radius.lg} />
          <Skeleton height={72} radius={radius.lg} />
          <Skeleton height={72} radius={radius.lg} />
        </View>
      ) : status === 'no-grades' ? (
        <View style={{ flex: 1, paddingHorizontal: spacing.xxl, justifyContent: 'center' }}>
          <ScoreDisclaimerNotice />
          <Text style={s.emptyTitle} maxFontSizeMultiplier={1.4}>No grades yet</Text>
          <Text style={s.emptySubtitle} maxFontSizeMultiplier={1.6}>
            Add your Grade 8–11 GWA to see your Estimated Admission Score, based on historical cutoffs.
          </Text>
          <Pressable
            style={s.primaryBtn}
            onPress={() => router.push('/estimator/grades')}
            accessibilityRole="button"
            accessibilityLabel="Add your grades"
          >
            <Text style={s.primaryBtnText} maxFontSizeMultiplier={1.4}>Add your grades</Text>
          </Pressable>
        </View>
      ) : status === 'not-ready' ? (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <ScoreDisclaimerNotice />
          <View style={s.card}>
            <Text style={s.cardTitle} maxFontSizeMultiplier={1.4}>Practice to unlock your estimate</Text>
            <Text style={[s.emptySubtitle, { marginBottom: spacing.sm }]} maxFontSizeMultiplier={1.6}>
              Your Estimated Admission Score unlocks once you've answered at least {MIN_ANSWERS} questions
              in each UPCAT subtest.
            </Text>
            {notReadyRows.map(row => {
              const r = readiness![row.key]
              return (
                <View key={row.key} style={s.unlockRow}>
                  <Text style={s.unlockLabel} maxFontSizeMultiplier={1.6}>
                    {row.label}: {r.answered} of {MIN_ANSWERS} questions
                  </Text>
                  <Pressable
                    style={s.unlockBtn}
                    onPress={() => router.push(`/practice/upcat/${row.label}?mode=quick` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`Practice ${row.label}`}
                  >
                    <Text style={s.unlockBtnTxt} maxFontSizeMultiplier={1.4}>Practice</Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
          <TouchableOpacity onPress={() => router.push('/estimator/grades')} accessibilityRole="button" accessibilityLabel="Edit grades">
            <Text style={s.editLink} maxFontSizeMultiplier={1.6}>Edit grades →</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : status === 'ready' && result && readiness ? (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <ScoreDisclaimerNotice />

          <View style={s.card}>
            <Text style={s.cardTitle} maxFontSizeMultiplier={1.4}>Estimated Admission Score</Text>
            <Text style={[s.eeasLine, { marginBottom: spacing.sm }]} maxFontSizeMultiplier={1.6}>
              Computed on this device, based on historical cutoffs — not your official UPG.
            </Text>
            <RangeBar point={result.point} low={result.low} high={result.high} t={t} typo={typo} />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle} maxFontSizeMultiplier={1.4}>Your Subtest Scores</Text>
            {SUBTEST_ROWS.map(row => (
              <View key={row.key} style={s.subtestRow}>
                <Text style={s.subtestName} maxFontSizeMultiplier={1.6}>{row.label}</Text>
                <Text style={s.subtestPct} maxFontSizeMultiplier={1.4}>{readiness[row.key].percent}%</Text>
              </View>
            ))}
          </View>

          {(result.eeas.palugit > 0 || result.eeas.pabigat > 0) ? (
            <View style={s.card}>
              <Text style={s.cardTitle} maxFontSizeMultiplier={1.4}>Adjustments to your estimate</Text>
              <Text style={s.eeasLine} maxFontSizeMultiplier={1.6}>
                A lower score is better, so a bonus subtracts and a distance adjustment adds.
              </Text>
              {result.eeas.palugit > 0 ? (
                <Text style={s.eeasLine} maxFontSizeMultiplier={1.6}>
                  Palugit (public-school / Indigenous Peoples bonus): −{result.eeas.palugit.toFixed(2)}
                </Text>
              ) : null}
              {result.eeas.pabigat > 0 ? (
                <Text style={s.eeasLine} maxFontSizeMultiplier={1.6}>
                  Pabigat (distant target-campus adjustment): +{result.eeas.pabigat.toFixed(2)}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={s.card}>
            <Text style={s.cardTitle} maxFontSizeMultiplier={1.4}>Per-Campus Outlook</Text>
            {groupedCampuses.map(({ group, rows }) => (
              <View key={group}>
                <View style={{ marginTop: spacing.sm }}>
                  <Badge label={group} tone={STATUS_TONE[group]} />
                </View>
                {rows.map((row, idx) => (
                  <View
                    key={`${row.campus}-${row.program ?? ''}`}
                    style={[s.campusRow, idx === rows.length - 1 && { borderBottomWidth: 0 }]}
                    accessible
                    accessibilityLabel={campusAccessibilityLabel(row)}
                  >
                    <View style={{ flex: 1, flexShrink: 1 }}>
                      <Text style={s.campusName} maxFontSizeMultiplier={1.6}>
                        {row.campus}{row.program ? ` – ${row.program}` : ''}
                      </Text>
                      <Text style={s.campusMeta} maxFontSizeMultiplier={1.6}>
                        Cutoff: {row.cutoff.toFixed(2)}{row.year != null ? ` (${row.year})` : ''}{row.isEstimate ? ' · estimate' : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>

          <TouchableOpacity onPress={() => router.push('/estimator/grades')} accessibilityRole="button" accessibilityLabel="Edit grades">
            <Text style={s.editLink} maxFontSizeMultiplier={1.6}>Edit grades →</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : status === 'error' ? (
        <View style={{ flex: 1, paddingHorizontal: spacing.xxl, justifyContent: 'center' }}>
          <ScoreDisclaimerNotice />
          <ErrorState
            title="Estimate unavailable"
            body="Your grades and practice answers are still saved on this device. Try loading them again."
            onRetry={reload}
          />
        </View>
      ) : null}
    </SafeAreaView>
  )
}
