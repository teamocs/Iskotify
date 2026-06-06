import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { useDb } from '../../hooks/useDb'
import { useTheme } from '../../theme/ThemeContext'
import { getSettings, updateSettings } from '../../services/settings'
import { computeHsGwa, isTargetCampusFar } from '../../utils/estimatorInputs'
import { rollingSubtestAverages } from '../../utils/subtestRolling'
import { practiceSessions } from '../../db/schema'
import { supabase } from '../../services/supabase'
import {
  ScoreDisclaimerModal,
  ScoreDisclaimerNotice,
} from '../../components/estimator/ScoreDisclaimerModal'

// ── RPC response shape ────────────────────────────────────────────────────────

interface EeasResult {
  palugit: number
  pabigat: number
}

interface CampusRow {
  campus: string
  cutoff: number
  isEstimate: boolean
  year: number | null
  status: 'Likely' | 'Possible' | 'Unlikely'
  gap: number
}

interface EstimateResult {
  point: number
  low: number
  high: number
  eeas: EeasResult
  campuses: CampusRow[]
}

// ── Range Bar ─────────────────────────────────────────────────────────────────

function RangeBar({
  point,
  low,
  high,
  t,
}: {
  point: number
  low: number
  high: number
  t: ReturnType<typeof useTheme>['theme']
}) {
  // 1.0 = best, 5.0 = worst (lower is better)
  const MIN = 1.0
  const MAX = 5.0
  const span = MAX - MIN

  const pctLow = Math.max(0, Math.min(1, (low - MIN) / span))
  const pctHigh = Math.max(0, Math.min(1, (high - MIN) / span))
  const pctPoint = Math.max(0, Math.min(1, (point - MIN) / span))

  return (
    <View>
      <Text
        style={{
          fontFamily: 'Outfit_700Bold',
          fontSize: 18,
          color: t.textPrimary,
          marginBottom: 6,
        }}
      >
        {point.toFixed(2)}{' '}
        <Text
          style={{
            fontFamily: 'Lexend_400Regular',
            fontSize: 13,
            color: t.textSecondary,
          }}
        >
          (range {low.toFixed(2)}–{high.toFixed(2)})
        </Text>
      </Text>

      {/* Bar track */}
      <View
        style={{
          height: 12,
          backgroundColor: t.surface2,
          borderRadius: 8,
          marginVertical: 6,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Shaded band */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${pctLow * 100}%`,
            width: `${(pctHigh - pctLow) * 100}%`,
            backgroundColor: 'rgba(128,0,0,0.32)',
          }}
        />
        {/* Point marker */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${pctPoint * 100}%`,
            width: 3,
            backgroundColor: '#831626',
            borderRadius: 2,
            transform: [{ translateX: -1.5 }],
          }}
        />
      </View>

      {/* Labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: 'Lexend_400Regular',
            fontSize: 11,
            color: t.textTertiary,
          }}
        >
          1.00 (best)
        </Text>
        <Text
          style={{
            fontFamily: 'Lexend_400Regular',
            fontSize: 11,
            color: t.textTertiary,
          }}
        >
          5.00 (worst)
        </Text>
      </View>
    </View>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CampusRow['status'] }) {
  const config =
    status === 'Likely'
      ? { bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.32)', color: '#4ade80' }
      : status === 'Possible'
        ? { bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.32)', color: '#fbbf24' }
        : { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }

  return (
    <View
      style={{
        backgroundColor: config.bg,
        borderWidth: 1,
        borderColor: config.border,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: 'Lexend_600SemiBold',
          fontSize: 11,
          color: config.color,
        }}
      >
        {status}
      </Text>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EstimatorScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()

  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [gradesReady, setGradesReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EstimateResult | null>(null)

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: t.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        },
        backBtn: {
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.sm,
          color: t.textTertiary,
          marginRight: 12,
        },
        title: {
          fontFamily: 'Outfit_700Bold',
          fontSize: typo.h3,
          color: t.textPrimary,
          flex: 1,
        },
        content: {
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 60,
        },
        card: {
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 18,
          padding: 16,
          marginBottom: 12,
        },
        cardTitle: {
          fontFamily: 'Outfit_700Bold',
          fontSize: typo.base,
          color: t.textPrimary,
          marginBottom: 12,
        },
        sectionLabel: {
          fontFamily: 'Lexend_600SemiBold',
          fontSize: typo.xs,
          color: t.textTertiary,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 8,
        },
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          alignSelf: 'flex-start',
          marginBottom: 6,
        },
        chipText: {
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.sm,
        },
        campusRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
          gap: 8,
        },
        campusName: {
          fontFamily: 'Outfit_600SemiBold',
          fontSize: typo.sm,
          color: t.textPrimary,
          flex: 1,
          flexShrink: 1,
        },
        campusCutoff: {
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.xs,
          color: t.textTertiary,
          marginTop: 2,
        },
        campusGap: {
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.xs,
          color: t.textTertiary,
          marginTop: 4,
        },
        emptyTitle: {
          fontFamily: 'Outfit_700Bold',
          fontSize: typo.xl,
          color: t.textPrimary,
          marginBottom: 8,
        },
        emptySubtitle: {
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.sm,
          color: t.textSecondary,
          marginBottom: 24,
          lineHeight: 20,
        },
        primaryBtn: {
          backgroundColor: 'rgba(128,0,0,0.82)',
          borderRadius: 14,
          paddingVertical: 13,
          alignItems: 'center',
        },
        primaryBtnText: {
          fontFamily: 'Outfit_700Bold',
          fontSize: typo.base,
          color: '#fff',
        },
        editLink: {
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.sm,
          color: t.accentText,
          textDecorationLine: 'underline',
          marginTop: 4,
        },
        errorText: {
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.sm,
          color: t.textSecondary,
          marginBottom: 16,
          lineHeight: 20,
        },
      }),
    [t, typo],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const settings = await getSettings(db)

      // ── Disclaimer gate ────────────────────────────────────────────────────
      if (!settings.scoreDisclaimerAck) {
        setShowDisclaimer(true)
        setLoading(false)
        return
      }

      // ── Grades check ──────────────────────────────────────────────────────
      const hsGWA = computeHsGwa({
        g8: settings.hsGwaG8,
        g9: settings.hsGwaG9,
        g10: settings.hsGwaG10,
        g11: settings.hsGwaG11,
      })

      if (hsGWA == null) {
        setGradesReady(false)
        setLoading(false)
        return
      }

      setGradesReady(true)

      // ── Rolling subtest averages from local sessions ───────────────────────
      const rawSessions = await db.select().from(practiceSessions)
      const sessions = rawSessions.map((row) => ({
        subtest: row.subtest ?? '',
        score: row.score,
        total: row.total,
        completedAt: row.completedAt,
      }))
      const { math, reading, language, science } = rollingSubtestAverages(sessions)

      // ── Build RPC payload ─────────────────────────────────────────────────
      type Payload = {
        hsGWA: number
        schoolType?: string
        isIndigenous?: boolean
        targetCampusFar?: boolean
        math?: number
        reading?: number
        language?: number
        science?: number
      }

      const payload: Payload = {
        hsGWA,
      }
      if (settings.schoolType) payload.schoolType = settings.schoolType
      if (settings.isIndigenous != null) payload.isIndigenous = settings.isIndigenous
      payload.targetCampusFar = isTargetCampusFar(
        settings.targetCampus ?? undefined,
        settings.province ?? undefined,
      )
      // Only send subtest values when non-null — RPC uses baseline for missing
      if (math != null) payload.math = math
      if (reading != null) payload.reading = reading
      if (language != null) payload.language = language
      if (science != null) payload.science = science

      // ── Call RPC ─────────────────────────────────────────────────────────
      const { data, error: rpcError } = await supabase.rpc('estimate_admission_score', {
        payload,
      })

      if (rpcError) {
        setError("Couldn't reach the server — connect to get your estimate.")
        setLoading(false)
        return
      }

      setResult(data as EstimateResult)
    } catch {
      setError("Couldn't reach the server — connect to get your estimate.")
    } finally {
      setLoading(false)
    }
  }, [db])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  // ── Disclaimer acknowledge ─────────────────────────────────────────────────

  async function handleAcknowledge() {
    await updateSettings(db, { scoreDisclaimerAck: true })
    setShowDisclaimer(false)
    void load()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Non-dismissable disclaimer modal — blocks until acknowledged */}
      <ScoreDisclaimerModal
        visible={showDisclaimer}
        onAcknowledge={() => void handleAcknowledge()}
      />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Admission Score Estimator</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.textPrimary} />
        </View>
      ) : !gradesReady ? (
        /* Empty state — no grades yet */
        <View
          style={{
            flex: 1,
            paddingHorizontal: 32,
            justifyContent: 'center',
          }}
        >
          <Text style={s.emptyTitle}>No grades yet</Text>
          <Text style={s.emptySubtitle}>
            Add your Grade 8–11 GWA to see your estimated admission score.
          </Text>
          <Pressable
            style={s.primaryBtn}
            onPress={() => router.push('/estimator/grades')}
            accessibilityRole="button"
            accessibilityLabel="Add your grades"
          >
            <Text style={s.primaryBtnText}>Add your grades</Text>
          </Pressable>
        </View>
      ) : error ? (
        /* Offline / server error state */
        <View
          style={{
            flex: 1,
            paddingHorizontal: 32,
            justifyContent: 'center',
          }}
        >
          <Text style={s.emptyTitle}>Estimate unavailable</Text>
          <Text style={s.errorText}>{error}</Text>
          <Pressable
            style={s.primaryBtn}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={s.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : result ? (
        /* Main results view */
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Permanent disclaimer notice */}
          <ScoreDisclaimerNotice />

          {/* Estimated score + range bar */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Estimated Admission Score</Text>
            <RangeBar point={result.point} low={result.low} high={result.high} t={t} />
          </View>

          {/* EEAS breakdown */}
          <View style={s.card}>
            <Text style={s.cardTitle}>EEAS Adjustments</Text>

            {/* Palugit (bonus — lower is better, so palugit subtracts) */}
            <View
              style={[
                s.chip,
                result.eeas.palugit > 0
                  ? { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.28)' }
                  : { backgroundColor: t.surface2, borderColor: t.border },
              ]}
            >
              <Text
                style={[
                  s.chipText,
                  { color: result.eeas.palugit > 0 ? '#4ade80' : t.textTertiary },
                ]}
              >
                {result.eeas.palugit > 0
                  ? `Palugit: −0.05 applied`
                  : `Palugit: not eligible`}
              </Text>
            </View>

            {/* Pabigat (penalty — adds to score, worse) */}
            <View
              style={[
                s.chip,
                result.eeas.pabigat > 0
                  ? { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.28)' }
                  : { backgroundColor: t.surface2, borderColor: t.border },
              ]}
            >
              <Text
                style={[
                  s.chipText,
                  { color: result.eeas.pabigat > 0 ? '#fbbf24' : t.textTertiary },
                ]}
              >
                {result.eeas.pabigat > 0
                  ? `Pabigat: +0.05 (geographic adjustment — exact value is not publicly available)`
                  : `Pabigat: not applicable`}
              </Text>
            </View>
          </View>

          {/* Per-campus breakdown */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Per-Campus Outlook</Text>
            {result.campuses.map((row, idx) => (
              <View
                key={row.campus}
                style={[
                  s.campusRow,
                  idx === result.campuses.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={{ flex: 1, flexShrink: 1 }}>
                  <Text style={s.campusName}>{row.campus}</Text>
                  <Text style={s.campusCutoff}>
                    Cutoff: {row.cutoff.toFixed(2)}
                    {row.year != null ? ` (${row.year} estimate)` : ''}
                    {row.isEstimate ? ' estimate' : ''}
                  </Text>
                  {row.gap !== 0 ? (
                    <Text style={s.campusGap}>
                      Gap: {row.gap > 0 ? '+' : ''}
                      {row.gap.toFixed(2)}
                    </Text>
                  ) : null}
                </View>
                <StatusBadge status={row.status} />
              </View>
            ))}
          </View>

          {/* Edit grades link */}
          <TouchableOpacity onPress={() => router.push('/estimator/grades')}>
            <Text style={s.editLink}>Edit grades →</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  )
}
