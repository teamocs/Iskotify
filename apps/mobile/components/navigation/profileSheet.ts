import { Platform } from 'react-native'
import { sheetRouteOptions } from '../ui/sheetRoute'

/**
 * How Profile is presented by the root Stack (app/_layout.tsx). It opens from
 * the avatar over whichever tab is showing as a routed sheet (see
 * components/ui/sheetRoute): a formSheet that rests at half height and drags
 * to full, with a grabber and the 28pt corner, on native; a push on web.
 */
export function profileScreenOptions(os: string = Platform.OS) {
  return sheetRouteOptions(os)
}
