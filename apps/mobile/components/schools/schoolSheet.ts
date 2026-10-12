import { Platform } from 'react-native'
import { sheetRouteOptions } from '../ui/sheetRoute'

/**
 * How a school's profile (app/schools/[slug].tsx) is presented by the root
 * Stack: a routed sheet (components/ui/sheetRoute) on native — a formSheet
 * that rests at half height and drags to full, with a grabber and the 28pt
 * corner — and a plain push on web, where the URL stays /schools/{id}.
 *
 * Screens pushed from inside the sheet (the exam, practice, a course) push
 * onto the same root Stack, as Profile's Settings does.
 */
export function schoolSheetOptions(os: string = Platform.OS) {
  return sheetRouteOptions(os)
}
