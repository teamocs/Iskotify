/**
 * pwnedPasswords.ts — free leaked-password check against Have I Been Pwned's
 * "Pwned Passwords" k-anonymity range API.
 *
 * Supabase's built-in leaked-password protection needs a paid plan, so the
 * sign-up and password-reset screens run this check on the device first.
 *
 * Privacy (k-anonymity): the password is SHA-1 hashed on the device and only
 * the first 5 hex characters of that hash are sent. HIBP answers with every
 * suffix in that bucket (padded with fake `:0` rows via `Add-Padding: true` so
 * the response size doesn't leak anything either) and the match happens here.
 * The password, the full hash and the suffix never leave the device and are
 * never logged.
 *
 * Availability: FAIL OPEN. A network error, timeout or non-200 returns
 * `{ checked: false }` and the caller lets the password through — an HIBP
 * outage must never block sign-up.
 *
 * Hashing: Web Crypto (`crypto.subtle`) when present (web), otherwise a small
 * pure-JS SHA-1 (Hermes on native has no SubtleCrypto, and expo-crypto isn't a
 * dependency). SHA-1 is used only because it is HIBP's lookup key — it is not
 * protecting anything here.
 */

export const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/'
export const HIBP_TIMEOUT_MS = 4000
export const BREACHED_PASSWORD_MESSAGE =
  'This password has appeared in a known data breach. Please choose a different one.'

/** `checked: false` means unknown (HIBP unreachable) — treat as allowed. */
export interface PwnedCheck {
  checked: boolean
  breached: boolean
  count: number
}

const UNKNOWN: PwnedCheck = Object.freeze({ checked: false, breached: false, count: 0 })

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>

// ── Hashing ──────────────────────────────────────────────────────────────────

function utf8(input: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(input)
  const out: number[] = []
  for (let i = 0; i < input.length; i++) {
    let c = input.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < input.length) {
      const lo = input.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00)
        i++
      }
    }
    // Lone surrogate → U+FFFD, matching TextEncoder so both paths agree.
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return Uint8Array.from(out)
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex.toUpperCase()
}

/** Pure-JS SHA-1 (FIPS 180-4) → uppercase hex. Used where Web Crypto is absent. */
export function sha1HexJs(input: string): string {
  const msg = utf8(input)
  const bitLen = msg.length * 8
  const total = (((msg.length + 8) >> 6) + 1) << 6
  const buf = new Uint8Array(total)
  buf.set(msg)
  buf[msg.length] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000))
  view.setUint32(total - 4, bitLen >>> 0)

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  // Indices are always in 0..79 (noUncheckedIndexedAccess can't see that).
  const W = (i: number) => w[i] as number
  for (let off = 0; off < total; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4)
    for (let t = 16; t < 80; t++) {
      const x = W(t - 3) ^ W(t - 8) ^ W(t - 14) ^ W(t - 16)
      w[t] = (x << 1) | (x >>> 31)
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let t = 0; t < 80; t++) {
      let f: number, k: number
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999 }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1 }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc }
      else { f = b ^ c ^ d; k = 0xca62c1d6 }
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + W(t)) >>> 0
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = tmp
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const ov = new DataView(out.buffer)
  ;[h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h))
  return toHex(out)
}

/** SHA-1 → uppercase hex, via Web Crypto when available, else pure JS. */
export async function sha1Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-1', utf8(input) as BufferSource)
      return toHex(new Uint8Array(digest))
    } catch {
      // Insecure context / unsupported — fall through to pure JS.
    }
  }
  return sha1HexJs(input)
}

export function splitHash(hash: string): { prefix: string; suffix: string } {
  const h = hash.toUpperCase()
  return { prefix: h.slice(0, 5), suffix: h.slice(5) }
}

/**
 * Finds `suffix` in a range response (`SUFFIX:COUNT` per line) and returns its
 * count. Case-insensitive; padding rows (count 0) count as not found.
 */
export function countInRange(body: string, suffix: string): number {
  const want = suffix.toUpperCase()
  for (const line of body.split('\n')) {
    const sep = line.indexOf(':')
    if (sep < 0) continue
    if (line.slice(0, sep).trim().toUpperCase() !== want) continue
    const n = parseInt(line.slice(sep + 1).trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  return 0
}

// ── Check ────────────────────────────────────────────────────────────────────

/**
 * Checks a password against HIBP. Never throws; resolves `{ checked: false }`
 * on any failure (fail open). Only the 5-char hash prefix is sent.
 */
export async function checkPwnedPassword(
  password: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<PwnedCheck> {
  const fetchImpl: FetchLike | undefined =
    opts.fetchImpl ?? (typeof fetch === 'function' ? (fetch as FetchLike) : undefined)
  if (!fetchImpl) return UNKNOWN
  const timeoutMs = opts.timeoutMs ?? HIBP_TIMEOUT_MS

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  // Resolves UNKNOWN at the deadline even if fetch ignores the abort signal.
  const deadline = new Promise<PwnedCheck>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort()
      resolve(UNKNOWN)
    }, timeoutMs)
  })

  const lookup = (async (): Promise<PwnedCheck> => {
    const { prefix, suffix } = splitHash(await sha1Hex(password))
    const res = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true' },
      signal: controller?.signal,
    })
    if (!res.ok || res.status !== 200) return UNKNOWN
    const count = countInRange(await res.text(), suffix)
    return { checked: true, breached: count > 0, count }
  })().catch(() => UNKNOWN)

  try {
    return await Promise.race([lookup, deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
