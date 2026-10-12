import { Redirect } from 'expo-router'

/** Legacy route: the analytics screen is the Progress tab (redesign M1). */
export default function AnalyticsRedirect() {
  return <Redirect href={'/progress' as never} />
}
