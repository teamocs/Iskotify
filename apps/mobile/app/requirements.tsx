import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { eq, asc } from 'drizzle-orm'
import { useDb } from '../hooks/useDb'
import { focusListings, listings } from '../db/schema'
import { useTheme } from '../theme/ThemeContext'
import { RequirementsChecklist } from '../components/RequirementsChecklist'
import { spacing, radius } from '../theme/tokens'
import { ScreenScroll } from '../components/ui/ScreenScroll'
import { Card } from '../components/ui/Card'

interface FocusedListingWithReqs {
  slug: string
  title: string
  requirements: string[]
}

export default function RequirementsScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const [items, setItems] = useState<FocusedListingWithReqs[]>([])
  const [acquiredCounts, setAcquiredCounts] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    try {
      const rows = await db
        .select({
          slug: focusListings.listingSlug,
          title: listings.title,
          requirements: listings.requirements,
        })
        .from(focusListings)
        .leftJoin(listings, eq(listings.slug, focusListings.listingSlug))
        .orderBy(asc(focusListings.priority))

      const parsed: FocusedListingWithReqs[] = rows
        .map(r => {
          let reqs: string[] = []
          try {
            const raw = r.requirements ?? '[]'
            const parsed = JSON.parse(raw)
            reqs = Array.isArray(parsed) ? parsed : []
          } catch {
            reqs = []
          }
          return {
            slug: r.slug,
            title: r.title ?? r.slug,
            requirements: reqs,
          }
        })
        .filter(r => r.requirements.length > 0)

      setItems(parsed)
    } catch (e) {
      console.warn('[RequirementsScreen] load failed:', e)
    }
  }, [db])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  function handleAcquiredCountChange(slug: string, acquired: number) {
    setAcquiredCounts(prev => ({ ...prev, [slug]: acquired }))
  }

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    scroll: { paddingTop: spacing.sm, gap: spacing.md },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topBarTitle: {
      flex: 1,
      fontSize: typo.h2,
      fontWeight: '700',
      color: t.textPrimary,
      fontFamily: 'Outfit_700Bold',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: typo.md,
      fontWeight: '700',
      color: t.textPrimary,
      fontFamily: 'Outfit_700Bold',
      flex: 1,
    },
    sectionBadge: {
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
      marginLeft: spacing.sm,
    },
    sectionBadgeText: {
      fontSize: typo.xs,
      fontWeight: '600',
      color: t.textSecondary,
      fontFamily: 'Lexend_600SemiBold',
    },
    emptyWrap: {
      alignItems: 'center',
      paddingTop: 80,
      paddingHorizontal: spacing.lg,
    },
    emptyIcon: { fontSize: 40, marginBottom: spacing.lg },
    emptyTitle: {
      fontSize: typo.lg,
      fontWeight: '700',
      color: t.textPrimary,
      fontFamily: 'Outfit_700Bold',
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    emptySub: {
      fontSize: typo.sm,
      color: t.textTertiary,
      fontFamily: 'Lexend_400Regular',
      textAlign: 'center',
      lineHeight: 20,
    },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topBarTitle}>My Requirements</Text>
      </View>

      <ScreenScroll tabBarInset={false} contentContainerStyle={s.scroll}>
        {items.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>No requirements yet</Text>
            <Text style={s.emptySub}>
              Add scholarships or exams with requirements to your focus list to track them here.
            </Text>
          </View>
        ) : (
          items.map(item => {
            const acquired = acquiredCounts[item.slug] ?? 0
            const total = item.requirements.length
            return (
              <Card key={item.slug} elevated>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={s.sectionBadge}>
                    <Text style={s.sectionBadgeText}>
                      {acquired}/{total} acquired
                    </Text>
                  </View>
                </View>
                <RequirementsChecklist
                  listingSlug={item.slug}
                  requirements={item.requirements}
                  onAcquiredCountChange={(acq) =>
                    handleAcquiredCountChange(item.slug, acq)
                  }
                />
              </Card>
            )
          })
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
