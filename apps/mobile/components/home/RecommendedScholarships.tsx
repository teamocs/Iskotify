import { useMemo } from 'react'
import { View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GraduationCap1Outlined, Trophy1Outlined } from '@lineiconshq/free-icons'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { InsetGroup, InsetRow } from '../ui/InsetGroup'
import { InfoBanner } from '../ui/InfoBanner'
import { Text } from '../ui/Text'
import { TodaySectionHeader } from './TodaySectionHeader'
import { MatchPill } from '../scholarships/MatchPill'
import { selectRecommendedScholarships, type FocusedListingRef } from '../../utils/scholarshipRecommendations'
import type { StudentProfile } from '../../utils/scholarshipMatch'
import type { ScholarshipListingSummary } from '../../hooks/useHomeCatalog'

interface Props {
  scholarships: ScholarshipListingSummary[]
  profile: StudentProfile
  clusters: Set<string>
  region: string
  /** Student's focused listings (from useHomeStats) — a focused scholarship is
   *  pinned to the front so it never silently drops off Home. Optional so
   *  existing callers/tests keep working unchanged. */
  focusedListings?: FocusedListingRef[]
}

/** Grant amount and/or monthly stipend, whichever is present (brief: "grant amount/stipend when present"). */
function amountLabel(l: ScholarshipListingSummary): string | null {
  const parts: string[] = []
  if (l.grantAmount && l.grantAmount.trim()) parts.push(l.grantAmount.trim())
  if (l.monthlyStipend != null) parts.push(`₱${l.monthlyStipend.toLocaleString()}/mo stipend`)
  return parts.length > 0 ? parts.join(' + ') : null
}

export function RecommendedScholarships({ scholarships, profile, clusters, region, focusedListings }: Props) {
  const { theme: t } = useTheme()

  const recommended = useMemo(
    () => selectRecommendedScholarships(scholarships, { profile, clusters, region, now: Date.now(), focusedListings }),
    [scholarships, profile, clusters, region, focusedListings],
  )

  return (
    <View style={{ marginTop: spacing.xl }}>
      <TodaySectionHeader
        title="Recommended Scholarships"
        actionLabel="See all"
        onAction={() => router.push('/(tabs)/explore?section=scholarships')}
      />
      <Text role="footnote" color={t.textSecondary} style={{ paddingHorizontal: spacing.xs, marginBottom: spacing.sm }}>
        Ranked to your profile and target courses
      </Text>
      {recommended.length > 0 ? (
        <InsetGroup inset={false}>
          {recommended.map(({ listing, status }) => {
            const amount = amountLabel(listing)
            const subtitle = [listing.provider, amount].filter(Boolean).join(' · ') || undefined
            return (
              <InsetRow
                key={listing.id}
                icon={Trophy1Outlined}
                iconTone="success"
                title={listing.title}
                subtitle={subtitle}
                trailing={<MatchPill status={status} />}
                onPress={() => router.push(`/listings/${listing.slug}` as never)}
              />
            )
          })}
        </InsetGroup>
      ) : (
        <InfoBanner
          icon={<Lineicons icon={GraduationCap1Outlined} size={20} color={t.textSecondary} />}
          message="Complete your profile (GWA, province, income) to see scholarships you qualify for."
          actionLabel="Browse"
          onAction={() => router.push('/(tabs)/explore?section=scholarships')}
          tone="neutral"
        />
      )}
    </View>
  )
}
