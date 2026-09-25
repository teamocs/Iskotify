import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { inArray } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ClipboardOutlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { isSchoolFocusSlug } from '../../utils/focusSlug'
import { listings as listingsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { RequirementsChecklist } from '../../components/RequirementsChecklist'

// ---------------------------------------------------------------------------
// One focus listing's requirements, parsed from the listings.requirements JSON.
// ---------------------------------------------------------------------------
interface ListingRequirements {
  slug: string
  title: string
  type: string
  requirements: string[]
}

function parseRequirements(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// One focus listing's checklist. Reuses RequirementsChecklist — the SAME
// component the listing page renders — so ticks persist to user_requirements
// and both screens stay in sync.
// ---------------------------------------------------------------------------
function ListingSection({ item }: { item: ListingRequirements }) {
  const { theme: t } = useTheme()
  const [acquired, setAcquired] = useState(0)
  const total = item.requirements.length
  const allDone = total > 0 && acquired >= total
  const onAcquiredCountChange = useCallback((a: number) => setAcquired(a), [])

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={2} maxFontSizeMultiplier={1.6}>{item.title}</Text>
          <Badge label={item.type === 'scholarship' ? 'Scholarship' : 'Entrance exam'} tone="neutral" />
        </View>
        {total > 0 ? (
          <Text
            style={textStyle('label', allDone ? t.success : t.textSecondary)}
            maxFontSizeMultiplier={1.6}
            accessibilityLabel={`${acquired} of ${total} requirements done`}
          >
            {acquired}/{total} done
          </Text>
        ) : null}
      </View>
      {total > 0 ? (
        <>
          <ProgressBar value={acquired / total} label={`${item.title} requirements done`} tone={allDone ? 'success' : 'accent'} />
          <RequirementsChecklist
            listingSlug={item.slug}
            requirements={item.requirements}
            onAcquiredCountChange={onAcquiredCountChange}
          />
        </>
      ) : (
        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>
          No requirements listed yet. Check the official site.
        </Text>
      )}
    </Card>
  )
}

export default function RequirementsScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  const { focusListings: focusListingsList } = useFocusListings()

  const [reqsBySlug, setReqsBySlug] = useState<Map<string, { requirements: string[] }>>(() => new Map())
  const [loading, setLoading] = useState(true)

  // Stable list of focus slugs — drives the listings.requirements fetch.
  const focusSlugs = useMemo(() => focusListingsList.map(f => f.slug), [focusListingsList])
  const slugsKey = useMemo(() => focusSlugs.join(','), [focusSlugs])

  // Load the requirements JSON for every focus listing in one query.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (focusSlugs.length === 0) {
        if (!cancelled) { setReqsBySlug(new Map()); setLoading(false) }
        return
      }
      try {
        const rows = await db
          .select({ slug: listingsTable.slug, requirements: listingsTable.requirements })
          .from(listingsTable)
          .where(inArray(listingsTable.slug, focusSlugs))
        if (!cancelled) {
          setReqsBySlug(new Map(rows.map(r => [r.slug, { requirements: parseRequirements(r.requirements) }])))
        }
      } catch (e) {
        console.warn('[requirements] load failed:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // slugsKey captures the set of focus slugs; db is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, slugsKey])

  // Focus listings (title/type/order) joined with their parsed requirements.
  // School-level focus entries have no requirements checklist — excluded.
  const sections = useMemo<ListingRequirements[]>(
    () => focusListingsList.filter(f => !isSchoolFocusSlug(f.slug)).map(f => ({
      slug: f.slug,
      title: f.title,
      type: f.type,
      requirements: reqsBySlug.get(f.slug)?.requirements ?? [],
    })),
    [focusListingsList, reqsBySlug],
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <DetailTopBar title="Requirements" fallbackHref="/" />
      <ScreenScroll tabBarInset={false} contentContainerStyle={{ gap: spacing.lg, paddingTop: spacing.xs }}>
        {loading ? (
          <View testID="requirements-skeleton" accessible accessibilityLabel="Loading requirements" accessibilityState={{ busy: true }} style={{ gap: spacing.lg }}>
            <Skeleton height={160} radius={radius.xl} />
            <Skeleton height={160} radius={radius.xl} />
          </View>
        ) : sections.length > 0 ? (
          <>
            <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>
              Documents for the exams and scholarships in your Focus. Tick each one as you get it.
            </Text>
            {sections.map(item => <ListingSection key={item.slug} item={item} />)}
          </>
        ) : (
          <EmptyState
            icon={<Lineicons icon={ClipboardOutlined} size={26} color={t.textSecondary} />}
            title="Nothing to track yet"
            body="Add an exam or scholarship to Focus from Explore, and its requirements show up here."
            actionLabel="Browse Explore"
            onAction={() => router.push('/explore')}
          />
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
