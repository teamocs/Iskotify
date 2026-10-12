import { useSyncExternalStore } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'

/**
 * How chrome (tab capsule, header band, glass buttons) is drawn here:
 * - `liquid`        iOS 26 Liquid Glass (GlassView)
 * - `blur`          iOS < 26: BlurView, systemChromeMaterialLight
 * - `android-blur`  Android API 31+: Dimezis blur over a BlurTargetView
 * - `css`           web: translucent fill + backdrop-filter
 * - `opaque`        Reduce Transparency (any platform), Android API 30 and
 *                   below, browsers without backdrop-filter: solid #fdf4f4
 */
export type BlurTier = 'liquid' | 'blur' | 'android-blur' | 'opaque' | 'css'

export interface PlatformCapabilities {
  liquidGlass: boolean
  blurTier: BlurTier
  reduceTransparency: boolean
  reduceMotion: boolean
}

export interface BlurTierInput {
  os: string
  apiLevel?: number
  liquidGlass: boolean
  reduceTransparency: boolean
  cssBackdrop: boolean
}

/** Pure tier decision. Reduce Transparency wins on every platform. */
export function resolveBlurTier({ os, apiLevel, liquidGlass, reduceTransparency, cssBackdrop }: BlurTierInput): BlurTier {
  if (reduceTransparency) return 'opaque'
  if (os === 'ios') return liquidGlass ? 'liquid' : 'blur'
  if (os === 'android') return (apiLevel ?? 0) >= 31 ? 'android-blur' : 'opaque'
  if (os === 'web') return cssBackdrop ? 'css' : 'opaque'
  return 'opaque'
}

/**
 * Liquid Glass needs BOTH checks: isLiquidGlassAvailable() says the app runs
 * the iOS 26 design; isGlassEffectAPIAvailable() guards iOS 26 betas that
 * shipped without the API (expo/expo#40911) and would crash GlassView.
 */
export function detectLiquidGlass(os: string): boolean {
  if (os !== 'ios') return false
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
  } catch {
    return false
  }
}

// ── Module-level cache ───────────────────────────────────────────────────────
// Device facts are read once per app run; the two accessibility flags are
// asked once and then followed through OS change events. Every consumer shares
// one snapshot, so a screen mounted later reads the answer synchronously.

type Flag = 'reduceTransparency' | 'reduceMotion'
type Flags = Record<Flag, boolean | null>   // null = the OS has not answered yet

interface Statics { os: string; apiLevel?: number; liquidGlass: boolean; cssBackdrop: boolean }

let statics: Statics | null = null
let flags: Flags = { reduceTransparency: null, reduceMotion: null }
let snapshot: PlatformCapabilities | null = null
let started = false
let teardown: (() => void)[] = []
const listeners = new Set<() => void>()

function cssBackdropSupported(): boolean {
  try {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' &&
      (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))
  } catch {
    return false
  }
}

function webMedia(query: string): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null
  } catch {
    return null
  }
}

const WEB_QUERY: Record<Flag, string> = {
  reduceTransparency: '(prefers-reduced-transparency: reduce)',
  reduceMotion: '(prefers-reduced-motion: reduce)',
}

function readStatics(): Statics {
  if (statics) return statics
  const os = Platform.OS
  statics = {
    os,
    apiLevel: os === 'android' && typeof Platform.Version === 'number' ? Platform.Version : undefined,
    liquidGlass: detectLiquidGlass(os),
    cssBackdrop: os === 'web' && cssBackdropSupported(),
  }
  if (os === 'web') {
    // matchMedia answers synchronously, so the web never starts in the
    // conservative state.
    for (const flag of Object.keys(WEB_QUERY) as Flag[]) {
      const mq = webMedia(WEB_QUERY[flag])
      if (mq) flags = { ...flags, [flag]: mq.matches }
    }
  }
  return statics
}

function build(): PlatformCapabilities {
  const s = readStatics()
  // Until the OS answers, assume reduced: opaque and still for at most one
  // frame, never a flash of glass or motion on a device that asked for neither.
  const reduceTransparency = flags.reduceTransparency ?? true
  const reduceMotion = flags.reduceMotion ?? true
  return {
    liquidGlass: s.liquidGlass,
    blurTier: resolveBlurTier({ ...s, reduceTransparency }),
    reduceTransparency,
    reduceMotion,
  }
}

function getSnapshot(): PlatformCapabilities {
  if (!snapshot) snapshot = build()
  return snapshot
}

function setFlag(flag: Flag, value: boolean): void {
  if (flags[flag] === value) return
  flags = { ...flags, [flag]: value }
  snapshot = build()
  listeners.forEach(l => l())
}

function start(): void {
  if (started) return
  started = true
  const { os } = readStatics()

  if (os === 'web') {
    for (const flag of Object.keys(WEB_QUERY) as Flag[]) {
      const mq = webMedia(WEB_QUERY[flag])
      if (!mq) { setFlag(flag, false); continue }
      const onChange = (e: MediaQueryListEvent) => setFlag(flag, e.matches)
      mq.addEventListener?.('change', onChange)
      teardown.push(() => mq.removeEventListener?.('change', onChange))
    }
    return
  }

  const ask = (flag: Flag, query: (() => Promise<boolean>) | undefined, event: 'reduceTransparencyChanged' | 'reduceMotionChanged') => {
    Promise.resolve()
      .then(() => (query ? query() : false))
      .then(v => setFlag(flag, !!v), () => setFlag(flag, false))
    const sub = AccessibilityInfo.addEventListener?.(event, (v: boolean) => setFlag(flag, !!v))
    if (sub) teardown.push(() => sub.remove?.())
  }
  ask('reduceTransparency', AccessibilityInfo.isReduceTransparencyEnabled?.bind(AccessibilityInfo), 'reduceTransparencyChanged')
  ask('reduceMotion', AccessibilityInfo.isReduceMotionEnabled?.bind(AccessibilityInfo), 'reduceMotionChanged')
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  start()
  return () => { listeners.delete(listener) }
}

/**
 * What this device can draw, and what the user asked for. Read it to choose
 * a glass tier or to swap motion for a crossfade; components/ui/Glass already
 * does the former.
 */
export function usePlatformCapabilities(): PlatformCapabilities {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Test-only: forget the cached device facts, flags and OS subscriptions. */
export function __resetPlatformCapabilitiesForTests(): void {
  teardown.forEach(fn => fn())
  teardown = []
  statics = null
  flags = { reduceTransparency: null, reduceMotion: null }
  snapshot = null
  started = false
  listeners.clear()
}
