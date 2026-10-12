import { Platform } from 'react-native'
import { radius } from '../../theme/tokens'

/** The resting heights of a routed sheet: half the screen, then full. */
export const SHEET_DETENTS = [0.5, 1]

/**
 * Screen options for a ROUTED sheet (a Stack.Screen presented as a sheet):
 * - native: a react-native-screens formSheet that rests at half height and
 *   drags to full, with a grabber and the 28pt sheet corner;
 * - web: {} (a plain push; the URL stays the route's own).
 *
 * Use it as `<Stack.Screen name="…" options={sheetRouteOptions()} />`.
 * Forms with text inputs stay in the in-place <Sheet> instead: Android's
 * formSheet does not lift reliably above the keyboard.
 */
export function sheetRouteOptions(os: string = Platform.OS) {
  if (os === 'web') return {}
  return {
    presentation: 'formSheet' as const,
    sheetAllowedDetents: SHEET_DETENTS,
    sheetGrabberVisible: true,
    sheetCornerRadius: radius.sheet,
  }
}
