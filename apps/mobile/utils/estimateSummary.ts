// Pure label builder shared by the compact Home/Practice entry points and the
// full Estimator results screen — one source of truth for the summary copy so
// the card and the screen never drift.

import type { Readiness } from './subtestReadiness'
import type { EstimateResult } from './admissionEstimate'

export type EstimateCardStatus = 'loading' | 'disclaimer' | 'no-grades' | 'not-ready' | 'ready' | 'error'

export interface EstimateSummaryInput {
  status: EstimateCardStatus
  readiness: Readiness | null
  result: Pick<EstimateResult, 'point' | 'low' | 'high'> | null
}

/** Total additional answers needed, summed across the four UPCAT subtests. */
function totalNeeded(readiness: Readiness): number {
  return readiness.math.needed + readiness.reading.needed + readiness.language.needed + readiness.science.needed
}

export function estimateSummaryLabel(input: EstimateSummaryInput): string {
  switch (input.status) {
    case 'loading':
      return 'Loading…'
    case 'error':
      return 'Estimate unavailable'
    case 'disclaimer':
    case 'no-grades':
      return 'Add your grades'
    case 'not-ready': {
      const n = input.readiness ? totalNeeded(input.readiness) : 0
      return `Practice ${n} more question${n === 1 ? '' : 's'} to unlock`
    }
    case 'ready': {
      const r = input.result
      if (!r) return 'Estimate unavailable'
      return `${r.low.toFixed(2)}–${r.high.toFixed(2)}`
    }
  }
}
