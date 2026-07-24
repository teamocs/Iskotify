import { useMemo } from 'react'
import { View, Text } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { SectionHeader } from '../ui/SectionHeader'
import { ListCard } from '../ui/ListCard'
import { InfoBanner } from '../ui/InfoBanner'
import { MatchPill } from '../scholarships/MatchPill'
import { selectRecommendedScholarships } from '../../utils/scholarshipRecommendations'
import type { StudentProfile } from '../../utils/scholarshipMatch'
import type { ScholarshipListingSummary } from '../../hooks/useHomeCatalog'

interface Props {
  scholarships: ScholarshipListingSummary[]
  profile: StudentProfile
  clusters: Set<string>
  region: string
}

function grantLabel(l: ScholarshipListingSummary): string | null {
  return l.grantAmount && l.grantAmount.trim() ? l.grantAmount.trim() : null
}

export function RecommendedScholarships({ scholarships, profile, clusters, region }: Props) {
  const { theme: t } = useTheme()

  const recommended = useMemo(
    () => selectRecommendedScholarships(scholarships, { profile, clusters, region, now: Date.now() }),
    [scholarships, profile, clusters, region],
  )

  return (
    <View style={{ marginTop: spacing.xl }}>
      <SectionHeader
        title="Recommended Scholarships"
        subtitle="Ranked to your profile and target courses"
        actionLabel="See all"
        onAction={() => router.push('/(tabs)/listings?tab=scholarships')}
      />
      {recommended.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {recommended.map(({ listing, status }) => {
            const grant = grantLabel(listing)
            const subtitle = [listing.provider, grant].filter(Boolean).join(' · ') || undefined
            return (
              <ListCard
                key={listing.id}
                iconBg={t.successSurface}
                icon={<Text style={{ fontSize: 16 }}>🏅</Text>}
                title={listing.title}
                subtitle={subtitle}
                trailing={<MatchPill status={status} />}
                onPress={() => router.push(`/listings/${listing.slug}` as never)}
              />
            )
          })}
        </View>
      ) : (
        <InfoBanner
          icon={<Text style={{ fontSize: 16 }}>🎓</Text>}
          message="Complete your profile (GWA, province, income) to see scholarships you qualify for."
          actionLabel="Browse"
          onAction={() => router.push('/(tabs)/listings?tab=scholarships')}
          tone="neutral"
        />
      )}
    </View>
  )
}
