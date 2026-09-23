// Shared data pipeline for the Estimated Admission Score feature — the results
// screen, the compact Home/Practice entry points, and the post-session delta
// all read through this one hook (or its underlying pure loader) so there is
// exactly one place that turns local settings + question_attempts +
// upcat_cutoffs into an estimate. Fully on-device: no network call.
import { useCallback, useEffect, useState } from 'react'
import type { DrizzleClient } from '../db/client'
import { useDb } from './useDb'
import { getSettings, updateSettings } from '../services/settings'
import { questionAttempts, upcatCutoffs } from '../db/schema'
import { computeHsGwa, isTargetCampusFar } from '../utils/estimatorInputs'
import { subtestReadiness, type Readiness } from '../utils/subtestReadiness'
import { estimateAdmissionScore, type EstimateResult, type CutoffRow } from '../utils/admissionEstimate'
import type { EstimateCardStatus } from '../utils/estimateSummary'

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

  const attemptRows = await db.select().from(questionAttempts)
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
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    setSnapshot(prev => ({ ...prev, status: 'loading' }))
    try {
      const next = await loadAdmissionEstimateSnapshot(db)
      setSnapshot(next)
    } catch (e) {
      console.warn('[useAdmissionEstimate] load error:', e)
      setSnapshot({ status: 'error', readiness: null, result: null })
    }
    // reloadKey is an intentional re-run trigger, not itself read in the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, reloadKey])

  useEffect(() => { void load() }, [load])

  const acknowledgeDisclaimer = useCallback(async () => {
    await updateSettings(db, { scoreDisclaimerAck: true })
    setReloadKey(k => k + 1)
  }, [db])

  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  return { ...snapshot, acknowledgeDisclaimer, reload }
}
