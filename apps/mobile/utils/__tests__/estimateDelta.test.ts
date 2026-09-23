import { estimateDeltaMessage, type EstimateSnapshot } from '../estimateDelta'

function snap(status: EstimateSnapshot['status'], point?: number): EstimateSnapshot {
  return {
    status,
    result: point != null ? { point, low: point - 0.2, high: point + 0.2 } : null,
  }
}

describe('estimateDeltaMessage', () => {
  it('returns null when the student was not ready before the session', () => {
    expect(estimateDeltaMessage(snap('not-ready'), snap('ready', 2.31))).toBeNull()
  })

  it('returns null when the student is not ready after the session either', () => {
    expect(estimateDeltaMessage(snap('ready', 2.35), snap('not-ready'))).toBeNull()
  })

  it('returns null when either snapshot is missing', () => {
    expect(estimateDeltaMessage(null, snap('ready', 2.31))).toBeNull()
    expect(estimateDeltaMessage(snap('ready', 2.35), null)).toBeNull()
  })

  it('returns null when the point estimate did not change', () => {
    expect(estimateDeltaMessage(snap('ready', 2.35), snap('ready', 2.35))).toBeNull()
  })

  it('describes an improvement (lower is better) with both values to 2 decimals', () => {
    expect(estimateDeltaMessage(snap('ready', 2.35), snap('ready', 2.31)))
      .toBe('Estimated Admission Score 2.35 → 2.31, lower is better')
  })

  it('describes a regression the same way — no value judgment in the wording itself', () => {
    expect(estimateDeltaMessage(snap('ready', 2.31), snap('ready', 2.40)))
      .toBe('Estimated Admission Score 2.31 → 2.40, lower is better')
  })
})
