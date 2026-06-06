import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { TouchableOpacity } from 'react-native'
import { eq, asc } from 'drizzle-orm'
import { useDb } from '../hooks/useDb'
import { focusListings, listings } from '../db/schema'
import { useTheme } from '../theme/ThemeContext'
import { RequirementsChecklist } from '../components/RequirementsChecklist'

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
    scroll: { paddingBottom: 100 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 9,
      gap: 8,
    },
    backBtn: {
      width: 32,
      height: 32,
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
    inner: { paddingHorizontal: 16, paddingTop: 8 },
    sectionCard: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 18,
      padding: 14,
      marginBottom: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
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
      borderRadius: 980,
      paddingHorizontal: 9,
      paddingVertical: 3,
      marginLeft: 8,
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
      paddingHorizontal: 32,
    },
    emptyIcon: { fontSize: 40, marginBottom: 16 },
    emptyTitle: {
      fontSize: typo.lg,
      fontWeight: '700',
      color: t.textPrimary,
      fontFamily: 'Outfit_700Bold',
      textAlign: 'center',
      marginBottom: 8,
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
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topBarTitle}>My Requirements</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.inner}>
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
                <View key={item.slug} style={s.sectionCard}>
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
                </View>
              )
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
