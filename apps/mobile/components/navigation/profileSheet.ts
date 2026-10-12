import { Platform } from 'react-native'
import { radius } from '../../theme/tokens'

/**
 * How Profile is presented by the root Stack (app/_layout.tsx). It opens from
 * the avatar over whichever tab is showing:
 * - native: a formSheet that rests at half height and drags to full, with a
 *   grabber and the 28pt sheet corner;
 * - web: a plain push (the URL stays /profile).
 */
export function profileScreenOptions(os: string = Platform.OS) {
  if (os === 'web') return {}
  return {
    presentation: 'formSheet' as const,
    sheetAllowedDetents: [0.5, 1],
    sheetGrabberVisible: true,
    sheetCornerRadius: radius.sheet,
  }
}
