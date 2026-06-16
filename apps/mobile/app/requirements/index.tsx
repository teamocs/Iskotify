import { useState, useEffect, useMemo, useCallback } from 'react'
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { inArray } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { listings as listingsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, type Theme, type Typography } from '../../theme/tokens'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { InfoBanner } from '../../components/ui/InfoBanner'
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

function makeStyles(t: Theme, typo: Typography) {
  return StyleSheet.create({
    root:       { flex: 1, backgroundColor: t.bg },
    topBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
    backArrow:  { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:   { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    subHint:    { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.sm },
    section:    { marginBottom: spacing.xl },
    // Per-listing header row: title left, "n/m done" progress right.
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
    cardTitle:  { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', lineHeight: 20 },
    progress:   { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold', flexShrink: 0, marginTop: 2 },
    progressDone: { color: t.success },
    noReqs:     { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontStyle: 'italic' },
    empty:      { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: spacing.xxl, fontStyle: 'italic' },
  })
}

// ---------------------------------------------------------------------------
// One focus listing's checklist section. Reuses RequirementsChecklist — the
// SAME component the listing-details screen renders — so toggling persists via
// toggleRequirement / getAcquiredRequirementIndices on the user_requirements
// table, keeping both screens in sync. Tracks acquired count for the "n/m done".
// ---------------------------------------------------------------------------
function ListingSection({ item, s }: { item: ListingRequirements; s: ReturnType<typeof makeStyles> }) {
  const [acquired, setAcquired] = useState(0)
  const total = item.requirements.length
  const allDone = total > 0 && acquired >= total

  const onAcquiredCountChange = useCallback((a: number) => setAcquired(a), [])

  return (
    <View style={s.section}>
      <Card elevated>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle} numberOfLines={2} maxFontSizeMultiplier={1.4}>{item.title}</Text>
          {total > 0 ? (
            <Text
              style={[s.progress, allDone && s.progressDone]}
              maxFontSizeMultiplier={1.4}
              accessibilityLabel={`${acquired} of ${total} requirements done`}
            >
              {acquired}/{total} done
            </Text>
          ) : null}
        </View>
        {total > 0 ? (
          <RequirementsChecklist
            listingSlug={item.slug}
            requirements={item.requirements}
            onAcquiredCountChange={onAcquiredCountChange}
          />
        ) : (
          <Text style={s.noReqs} maxFontSizeMultiplier={1.4}>No requirements listed</Text>
        )}
      </Card>
    </View>
  )
}

export default function RequirementsScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
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

  // Join focus listings (for title/type/order) with their parsed requirements.
  const sections = useMemo<ListingRequirements[]>(
    () => focusListingsList.map(f => ({
      slug: f.slug,
      title: f.title,
      type: f.type,
      requirements: reqsBySlug.get(f.slug)?.requirements ?? [],
    })),
    [focusListingsList, reqsBySlug],
  )

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>Requirements</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      ) : sections.length > 0 ? (
        <ScreenScroll tabBarInset={false}>
          <Text style={s.subHint} maxFontSizeMultiplier={1.4}>
            Track requirements for your focus exams & scholarships. Tap to mark done.
          </Text>
          {sections.map(item => (
            <ListingSection key={item.slug} item={item} s={s} />
          ))}
        </ScreenScroll>
      ) : (
        <ScreenScroll tabBarInset={false}>
          <View style={{ marginTop: spacing.md }}>
            <InfoBanner
              icon={<Text style={{ fontSize: 16 }}>🎯</Text>}
              message="Add an exam or scholarship from the Lists tab to track its requirements here."
              actionLabel="Lists"
              onAction={() => router.push('/(tabs)/listings')}
              tone="neutral"
            />
          </View>
        </ScreenScroll>
      )}
    </SafeAreaView>
  )
}
