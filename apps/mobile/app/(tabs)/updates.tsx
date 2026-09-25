import { Redirect } from 'expo-router'

/** Legacy route: Updates is now Explore's "News & dates" section (redesign M1). */
export default function UpdatesRedirect() {
  return <Redirect href={'/explore?section=news' as never} />
}
