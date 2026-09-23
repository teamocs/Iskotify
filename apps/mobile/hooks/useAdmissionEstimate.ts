// Shared data pipeline for the Estimated Admission Score feature — the results
// screen, the compact Home/Practice entry points, and the post-session delta
// all read through this one hook (or its underlying pure loader) so there is
// exactly one place that turns local settings + question_attempts +
// upcat_cutoffs into an estimate. Fully on-device: no network call.
import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { useDb } from './useDb'
import { getSettings, updateSettings } from '../services/settings'
import { questionAttempts, upcatCutoffs } from '../db/schema'
import { subscribe } from '../services/queryCache'
import { computeHsGwa, isTargetCampusFar } from '../utils/estimatorInputs'
import { subtestReadiness, UPCAT_SUBTEST_LABELS, type Readiness } from '../utils/subtestReadiness'
import { estimateAdmissionScore, type EstimateResult, type CutoffRow } from '../utils/admissionEstimate'
import type { EstimateCardStatus } from '../utils/estimateSummary'

// question_attempts holds up to 5,000 rows (utils/attemptRetention.ts), and
// this pipeline runs on every card/screen mount plus twice per session
// submit — so it reads only the 3 columns it needs, for the 4 UPCAT subtests.
// No global row cap: a burst of practice in one subtest must not push the
// others' latest answers out of their window (subtestReadiness keeps the
// latest WINDOW per subtest itself).

export interface AdmissionEstimateSnapshot {
  status: EstimateCardStatus
  readiness: Readiness | null
  result: EstimateResult | null
}

/**
 * loadAdmissionEstimateSnapshot — the pure (non-hook) async pipeline. Exported
 * so imperative call sites (e.g. a subtest drill's submit()) can snapshot the
 * estimate before and after a session to compute a delta, without mounting a
 * component.
 */
export async function loadAdmissionEstimateSnapshot(db: DrizzleClient): Promise<AdmissionEstimateSnapshot> {
  const settings = await getSettings(db)

  if (!settings.scoreDisclaimerAck) {
    return { status: 'disclaimer', readiness: null, result: null }
  }

  const hsGWA = computeHsGwa({
    g8: settings.hsGwaG8, g9: settings.hsGwaG9, g10: settings.hsGwaG10, g11: settings.hsGwaG11,
  })
  if (hsGWA == null) {
    return { status: 'no-grades', readiness: null, result: null }
  }

  const attemptRows = await db
    .select({ subtest: questionAttempts.subtest, correct: questionAttempts.correct, answeredAt: questionAttempts.answeredAt })
    .from(questionAttempts)
    .where(inArray(questionAttempts.subtest, UPCAT_SUBTEST_LABELS))
  const readiness = subtestReadiness(attemptRows.map(a => ({
    subtest: a.subtest,
    correct: a.correct,
    answeredAt: a.answeredAt,
  })))

  if (!readiness.ready) {
    return { status: 'not-ready', readiness, result: null }
  }

  const cutoffRows = await db.select().from(upcatCutoffs)
  const cutoffs: CutoffRow[] = cutoffRows.map(c => ({
    campus: c.campus, program: c.program, cutoff: c.cutoff, year: c.year, isEstimate: c.isEstimate,
  }))

  const targetCampusFar = isTargetCampusFar(settings.targetCampus ?? undefined, settings.province ?? undefined)

  const result = estimateAdmissionScore({
    hsGWA,
    math: readiness.math.percent!,
    reading: readiness.reading.percent!,
    language: readiness.language.percent!,
    science: readiness.science.percent!,
    schoolType: settings.schoolType,
    isIndigenous: settings.isIndigenous,
    targetCampusFar,
  }, cutoffs)

  return { status: 'ready', readiness, result }
}

export interface AdmissionEstimateState extends AdmissionEstimateSnapshot {
  /** Persists disclaimer acknowledgement and reloads. */
  acknowledgeDisclaimer: () => Promise<void>
  /** Re-runs the pipeline (e.g. after grades change or on screen focus). */
  reload: () => void
}

const INITIAL: AdmissionEstimateSnapshot = { status: 'loading', readiness: null, result: null }

export function useAdmissionEstimate(): AdmissionEstimateState {
  const db = useDb()
  const [snapshot, setSnapshot] = useState<AdmissionEstimateSnapshot>(INITIAL)

  const load = useCallback(async () => {
    setSnapshot(prev => ({ ...prev, status: 'loading' }))
    try {
      const next = await loadAdmissionEstimateSnapshot(db)
      setSnapshot(next)
    } catch (e) {
      console.warn('[useAdmissionEstimate] load error:', e)
      setSnapshot({ status: 'error', readiness: null, result: null })
    }
  }, [db])

  // Reload whenever the Home/Practice tab (or the estimator screen) regains
  // focus — both stay mounted across tab switches, so without this a card
  // shown right after a practice session keeps showing the pre-session
  // estimate (mirrors useHomeCatalog.ts / useStudyPlan.ts / useHomeStats.ts).
  useFocusEffect(useCallback(() => { void load() }, [load]))

  // A completed session elsewhere invalidates 'home:'/'practice:' (see
  // hooks/useRecordSession.ts) — reload so the estimate reflects the new
  // attempts even when this hook's own consumer isn't the one that just
  // regained focus (e.g. the Home card while Practice is invalidated, or
  // vice versa, since the card is mounted on both tabs independently).
  useEffect(() => {
    const unsubHome = subscribe('home:', () => { void load() })
    const unsubPractice = subscribe('practice:', () => { void load() })
    return () => { unsubHome(); unsubPractice() }
  }, [load])

  const acknowledgeDisclaimer = useCallback(async () => {
    await updateSettings(db, { scoreDisclaimerAck: true })
    await load()
  }, [db, load])

  const reload = useCallback(() => { void load() }, [load])

  return { ...snapshot, acknowledgeDisclaimer, reload }
}
