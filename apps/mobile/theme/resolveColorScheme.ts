export type ThemePref = 'system' | 'light' | 'dark'
export type ColorScheme = 'light' | 'dark'

/**
 * Which palette to paint.
 *
 * - An explicit user choice (`light` / `dark` in Settings) always wins.
 * - `system` (the stored default) follows the OS when the OS reports a scheme.
 * - When the OS reports nothing (older Android, some browsers, first frame),
 *   fall back to LIGHT — the owner's first-launch default (2026-09). This used
 *   to fall back to dark.
 */
export function resolveColorScheme(
  pref: ThemePref,
  systemScheme: string | null | undefined,
): ColorScheme {
  if (pref === 'light' || pref === 'dark') return pref
  return systemScheme === 'dark' ? 'dark' : 'light'
}
