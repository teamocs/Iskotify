/**
 * TDD tests for services/pwnedPasswords.ts — the free, client-side leaked
 * password check (Have I Been Pwned "Pwned Passwords" k-anonymity range API).
 * Runs under the 'services' jest project (node env, babel-jest).
 *
 * Guarantees:
 *  - SHA-1 is computed on the device (Web Crypto when present, pure JS otherwise)
 *  - only the first 5 hex chars of the hash leave the device
 *  - the response is matched case-insensitively, padding rows (count 0) ignored
 *  - FAIL OPEN: network error / timeout / non-200 → checked:false, breached:false
 */
import {
  sha1Hex,
  sha1HexJs,
  splitHash,
  countInRange,
  checkPwnedPassword,
  HIBP_RANGE_URL,
  HIBP_TIMEOUT_MS,
} from '../pwnedPasswords'

// SHA-1("password") — the canonical test vector.
const PASSWORD_SHA1 = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'
const PREFIX = '5BAA6'
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

function okResponse(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as unknown as Response
}

describe('sha1Hex', () => {
  it('hashes "password" to the known vector (uppercase hex)', async () => {
    expect(await sha1Hex('password')).toBe(PASSWORD_SHA1)
  })

  it('pure-JS fallback matches the known vector', () => {
    expect(sha1HexJs('password')).toBe(PASSWORD_SHA1)
  })

  it('pure-JS fallback matches Web Crypto for empty, long and non-ASCII input', async () => {
    const inputs = ['', 'a'.repeat(1000), 'pässwörd-日本語-🔒', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64)]
    for (const s of inputs) {
      expect(sha1HexJs(s)).toBe(await sha1Hex(s))
    }
    expect(sha1HexJs('')).toBe('DA39A3EE5E6B4B0D3255BFEF95601890AFD80709')
  })

  it('encodes UTF-8 correctly without TextEncoder (incl. surrogate pairs)', async () => {
    const inputs = ['password', 'pässwörd', '日本語', '🔒🔑', 'aé中😀z', 'lone\ud800surrogate']
    const expected = await Promise.all(inputs.map((s) => sha1Hex(s)))
    const original = globalThis.TextEncoder
    Object.defineProperty(globalThis, 'TextEncoder', { value: undefined, configurable: true })
    try {
      // Lone surrogates become U+FFFD, exactly as TextEncoder does.
      inputs.forEach((s, i) => expect(sha1HexJs(s)).toBe(expected[i]))
    } finally {
      Object.defineProperty(globalThis, 'TextEncoder', { value: original, configurable: true })
    }
  })

  it('falls back to pure JS when Web Crypto is unavailable (e.g. Hermes)', async () => {
    const original = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(await sha1Hex('password')).toBe(PASSWORD_SHA1)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
})

describe('splitHash', () => {
  it('splits into a 5-char prefix and 35-char suffix', () => {
    expect(splitHash(PASSWORD_SHA1)).toEqual({ prefix: PREFIX, suffix: SUFFIX })
  })
})

describe('countInRange', () => {
  it('returns the count for a matching suffix, case-insensitively', () => {
    const body = `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX.toLowerCase()}:9659365\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2`
    expect(countInRange(body, SUFFIX)).toBe(9659365)
  })

  it('returns 0 when the suffix is absent', () => {
    expect(countInRange('0018A45C4D1DEF81644B54AB7F969B88D65:1\n', SUFFIX)).toBe(0)
  })

  it('ignores padding entries (count 0)', () => {
    expect(countInRange(`${SUFFIX}:0\r\n`, SUFFIX)).toBe(0)
  })
})

describe('checkPwnedPassword', () => {
  it('reports a breached password with its count', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(`${SUFFIX}:42\r\nABC:0`))
    await expect(checkPwnedPassword('password', { fetchImpl })).resolves.toEqual({
      checked: true,
      breached: true,
      count: 42,
    })
  })

  it('reports a clean password', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse('0018A45C4D1DEF81644B54AB7F969B88D65:1'))
    await expect(checkPwnedPassword('password', { fetchImpl })).resolves.toEqual({
      checked: true,
      breached: false,
      count: 0,
    })
  })

  it('treats a padding-only match as not breached', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(`${SUFFIX}:0`))
    const r = await checkPwnedPassword('password', { fetchImpl })
    expect(r).toEqual({ checked: true, breached: false, count: 0 })
  })

  it('sends only the 5-char prefix with Add-Padding, never the full hash or password', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(''))
    await checkPwnedPassword('password', { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${HIBP_RANGE_URL}${PREFIX}`)
    expect(url).not.toContain(SUFFIX)
    expect(url).not.toContain(PASSWORD_SHA1)
    expect(url.toLowerCase()).not.toContain(PASSWORD_SHA1.toLowerCase())
    expect(url.slice(HIBP_RANGE_URL.length)).toBe(PREFIX)
    expect(init.headers['Add-Padding']).toBe('true')
    expect(JSON.stringify(init)).not.toContain(SUFFIX)
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.body).toBeUndefined()
  })

  it('never puts the password itself in the request', async () => {
    const secret = 'Tr0ub4dor&3-unique-secret'
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(''))
    await checkPwnedPassword(secret, { fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0]
    const full = await sha1Hex(secret)
    expect(url).toBe(`${HIBP_RANGE_URL}${full.slice(0, 5)}`)
    expect(`${url}${JSON.stringify(init)}`).not.toContain(secret)
    expect(`${url}${JSON.stringify(init)}`.toUpperCase()).not.toContain(full.slice(5))
  })

  it('fails open on a network error', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'))
    await expect(checkPwnedPassword('password', { fetchImpl })).resolves.toEqual({
      checked: false,
      breached: false,
      count: 0,
    })
  })

  it('fails open on a non-200 response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' })
    await expect(checkPwnedPassword('password', { fetchImpl })).resolves.toEqual({
      checked: false,
      breached: false,
      count: 0,
    })
  })

  it('fails open on a timeout, even if fetch ignores the abort signal', async () => {
    jest.useFakeTimers()
    try {
      const fetchImpl = jest.fn(() => new Promise<Response>(() => {}))
      const pending = checkPwnedPassword('password', { fetchImpl, timeoutMs: 4000 })
      await jest.advanceTimersByTimeAsync(4001)
      await expect(pending).resolves.toEqual({ checked: false, breached: false, count: 0 })
    } finally {
      jest.useRealTimers()
    }
  })

  it('defaults to a ~4s timeout', () => {
    expect(HIBP_TIMEOUT_MS).toBe(4000)
  })

  it('aborts the in-flight request on timeout', async () => {
    // Real timers: Web Crypto hashing resolves on a macrotask, so the request
    // is genuinely in flight before the (short) deadline fires.
    let signal: AbortSignal | undefined
    let abortedWhenSent: boolean | undefined
    const fetchImpl = jest.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      abortedWhenSent = signal?.aborted
      return new Promise<Response>(() => {})
    })
    const r = await checkPwnedPassword('password', { fetchImpl, timeoutMs: 50 })
    expect(r).toEqual({ checked: false, breached: false, count: 0 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(abortedWhenSent).toBe(false)
    expect(signal?.aborted).toBe(true)
  })

  it('does not log the password or its hash', async () => {
    const spies = [
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
      jest.spyOn(console, 'error').mockImplementation(() => {}),
      jest.spyOn(console, 'info').mockImplementation(() => {}),
      jest.spyOn(console, 'debug').mockImplementation(() => {}),
    ]
    try {
      await checkPwnedPassword('password', { fetchImpl: jest.fn().mockRejectedValue(new Error('x')) })
      await checkPwnedPassword('password', { fetchImpl: jest.fn().mockResolvedValue(okResponse(`${SUFFIX}:3`)) })
      const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls)).toUpperCase()
      expect(logged).not.toContain('PASSWORD')
      expect(logged).not.toContain(PREFIX)
      expect(logged).not.toContain(SUFFIX)
    } finally {
      spies.forEach((s) => s.mockRestore())
    }
  })
})
