import { Slot } from 'expo-router'

/**
 * Android and web: Search is a plain page (the floating bar, or the page
 * itself beside the desktop sidebar, hosts the field). The folder exists so
 * iOS can wrap the page in a stack whose header carries the native search
 * field (_layout.ios.tsx); here it adds nothing.
 */
export default function SearchLayout() {
  return <Slot />
}
