import { Redirect, useLocalSearchParams } from 'expo-router'
import { exploreHrefForLegacyTab } from '../../components/navigation/destinations'

/**
 * Legacy route: the Lists tab became Explore (redesign M1). Kept so old deep
 * links, notifications and bookmarks (`/listings?tab=scholarships`) still land
 * on the right Explore section. Listing details stay at /listings/[slug].
 */
export default function ListingsRedirect() {
  const { tab } = useLocalSearchParams<{ tab?: string }>()
  return <Redirect href={exploreHrefForLegacyTab(tab) as never} />
}
