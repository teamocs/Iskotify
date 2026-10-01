import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyPaymongoSignature, safeEqual } from '../signature'

const SECRET = 'whsk_test_secret'
const BODY = '{"data":{"id":"evt_1","attributes":{"type":"checkout_session.payment.paid","livemode":false}}}'
const NOW_MS = 1_760_000_000_000
const T = Math.floor(NOW_MS / 1000)

const sign = (t: number | string, body = BODY, secret = SECRET) =>
  createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')

const header = (parts: { t?: number | string; te?: string; li?: string }) =>
  `t=${parts.t ?? ''},te=${parts.te ?? ''},li=${parts.li ?? ''}`

const verify = (h: string | null, opts: Partial<{ body: string; livemode: boolean; secret: string; nowMs: number }> = {}) =>
  verifyPaymongoSignature({
    header: h,
    rawBody: opts.body ?? BODY,
    secret: opts.secret ?? SECRET,
    livemode: opts.livemode ?? false,
    nowMs: opts.nowMs ?? NOW_MS,
  })

describe('verifyPaymongoSignature', () => {
  it('accepts a valid test-mode signature (te)', () => {
    expect(verify(header({ t: T, te: sign(T) }))).toEqual({ ok: true })
  })

  it('accepts a valid live-mode signature (li)', () => {
    expect(verify(header({ t: T, li: sign(T) }), { livemode: true })).toEqual({ ok: true })
  })

  it('uses li in live mode: a correct te does not pass a live event', () => {
    expect(verify(header({ t: T, te: sign(T) }), { livemode: true })).toMatchObject({ ok: false })
  })

  it('uses te in test mode: a correct li does not pass a test event', () => {
    expect(verify(header({ t: T, li: sign(T) }), { livemode: false })).toMatchObject({ ok: false })
  })

  it('rejects a signature made with another secret', () => {
    expect(verify(header({ t: T, te: sign(T, BODY, 'other') }))).toMatchObject({ ok: false, reason: 'mismatch' })
  })

  it('rejects when the body was altered after signing', () => {
    expect(verify(header({ t: T, te: sign(T) }), { body: BODY.replace('evt_1', 'evt_2') }))
      .toMatchObject({ ok: false, reason: 'mismatch' })
  })

  it('signs over the RAW body: re-serialised JSON does not verify', () => {
    const pretty = JSON.stringify(JSON.parse(BODY), null, 2)
    expect(verify(header({ t: T, te: sign(T) }), { body: pretty })).toMatchObject({ ok: false })
  })

  it('rejects a timestamp older than 5 minutes (replay)', () => {
    const old = T - 301
    expect(verify(header({ t: old, te: sign(old) }))).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('accepts a timestamp just inside the 5 minute window', () => {
    const t = T - 299
    expect(verify(header({ t, te: sign(t) }))).toEqual({ ok: true })
  })

  it('rejects a timestamp far in the future', () => {
    const future = T + 301
    expect(verify(header({ t: future, te: sign(future) }))).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('rejects a missing header, a malformed header, a missing or non-numeric timestamp', () => {
    expect(verify(null)).toMatchObject({ ok: false, reason: 'missing' })
    expect(verify('')).toMatchObject({ ok: false, reason: 'missing' })
    expect(verify('garbage')).toMatchObject({ ok: false })
    expect(verify(header({ te: sign(T) }))).toMatchObject({ ok: false, reason: 'malformed' })
    expect(verify(header({ t: 'abc', te: sign('abc') }))).toMatchObject({ ok: false, reason: 'malformed' })
  })

  it('rejects an empty signature for the mode', () => {
    expect(verify(header({ t: T, te: '' }))).toMatchObject({ ok: false })
  })

  it('rejects a signature of the wrong length or non-hex without throwing', () => {
    expect(verify(header({ t: T, te: 'abcd' }))).toMatchObject({ ok: false, reason: 'mismatch' })
    expect(verify(header({ t: T, te: 'z'.repeat(64) }))).toMatchObject({ ok: false, reason: 'mismatch' })
  })

  it('tolerates spaces around the header parts', () => {
    expect(verify(`t=${T}, te=${sign(T)}, li=`)).toEqual({ ok: true })
  })

  it('fails closed when the secret is empty', () => {
    expect(verify(header({ t: T, te: sign(T, BODY, '') }), { secret: '' })).toMatchObject({ ok: false })
  })
})

describe('safeEqual', () => {
  it('is true only for identical strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', 'x')).toBe(false)
  })

  it('never matches an empty expected value', () => {
    expect(safeEqual('', '')).toBe(false)
  })
})
