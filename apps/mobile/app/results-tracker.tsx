import { useCallback, useMemo, useState } from 'react'
import {
  Linking, Pressable, StyleSheet, Text, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../hooks/useDb'
import { resultWatches, listings as listingsTable } from '../db/schema'
import { useTheme } from '../theme/ThemeContext'
import { daysUntil } from '../utils/admissionsFeed'
import { spacing, radius } from '../theme/tokens'
import { ScreenScroll } from '../components/ui/ScreenScroll'
import { Card } from '../components/ui/Card'
import { WebTopSpacer } from '../components/ui/WebTopSpacer'

interface WatchedExam {
  slug: string
  addedAt: number
  title: string | null
  resultsDate: number | null
  externalUrl: string | null
}

/** Convert a ms-epoch timestamp to a YYYY-MM-DD ISO date string (UTC). */
function epochToISO(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10)
}

/** Format an epoch into a human-readable date. */
function fmtDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function ResultsTrackerScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const [watches, setWatches] = useState<WatchedExam[]>([])

  const load = useCallback(async () => {
    try {
      const rows = await db
        .select({
          slug: resultWatches.slug,
          addedAt: resultWatches.addedAt,
          title: listingsTable.title,
          resultsDate: listingsTable.resultsDate,
          externalUrl: listingsTable.externalUrl,
        })
        .from(resultWatches)
        .leftJoin(listingsTable, eq(listingsTable.slug, resultWatches.slug))
      setWatches(rows as WatchedExam[])
    } catch (e) {
      console.warn('[ResultsTracker] load failed:', e)
    }
  }, [db])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  async function removeWatch(slug: string) {
    try {
      await db.delete(resultWatches).where(eq(resultWatches.slug, slug))
      setWatches(prev => prev.filter(w => w.slug !== slug))
    } catch (e) {
      console.warn('[ResultsTracker] removeWatch failed:', e)
    }
  }

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topBarTitle: {
      flex: 1, fontSize: typo.h2, fontWeight: '700',
      color: t.textPrimary, fontFamily: 'Outfit_700Bold',
    },
    cardTitle: {
      fontSize: typo.md, fontWeight: '700',
      color: t.textPrimary, fontFamily: 'Outfit_700Bold',
      marginBottom: spacing.xs, lineHeight: 22,
    },
    waitingBadge: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1,
      borderColor: 'rgba(34,197,94,0.22)', borderRadius: radius.sm,
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1, alignSelf: 'flex-start',
      marginBottom: spacing.sm,
    },
    waitingTxt: {
      fontSize: typo.xs, fontWeight: '700',
      color: '#4ade80', fontFamily: 'Lexend_600SemiBold',
    },
    readyBadge: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.28)', borderRadius: radius.sm,
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1, alignSelf: 'flex-start',
      marginBottom: spacing.sm,
    },
    readyTxt: {
      fontSize: typo.xs, fontWeight: '700',
      color: '#fbbf24', fontFamily: 'Lexend_600SemiBold',
    },
    subTxt: {
      fontSize: typo.xs, color: t.textTertiary,
      fontFamily: 'Lexend_400Regular', marginBottom: spacing.md, lineHeight: 17,
    },
    row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs / 2 },
    linkBtn: {
      flex: 1, borderWidth: 1, borderColor: t.divider,
      borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center',
      justifyContent: 'center', minHeight: 44,
    },
    linkBtnTxt: {
      fontSize: typo.sm, color: t.textSecondary,
      fontFamily: 'Lexend_400Regular',
    },
    removeBtn: {
      borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)',
      borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
      alignItems: 'center', justifyContent: 'center', minHeight: 44,
    },
    removeBtnTxt: {
      fontSize: typo.xs, color: t.accentText,
      fontFamily: 'Lexend_400Regular',
    },
    removeOnlyBtn: {
      alignSelf: 'flex-start', borderWidth: 1,
      borderColor: 'rgba(128,0,0,0.28)', borderRadius: radius.md,
      paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
      alignItems: 'center', justifyContent: 'center', minHeight: 44,
    },
    removeOnlyTxt: {
      fontSize: typo.xs, color: t.accentText, fontFamily: 'Lexend_400Regular',
    },
    pressed: { opacity: 0.7 },
    emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xxl },
    emptyIcon: { fontSize: 40, marginBottom: spacing.lg },
    emptyTitle: {
      fontSize: typo.lg, fontWeight: '700',
      color: t.textPrimary, fontFamily: 'Outfit_700Bold',
      textAlign: 'center', marginBottom: spacing.sm,
    },
    emptySub: {
      fontSize: typo.sm, color: t.textTertiary,
      fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: 20,
    },
  }), [t, typo])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <View style={s.topBar}>
        <Pressable
          style={({ pressed }) => [s.backBtn, pressed && s.pressed]}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topBarTitle}>Results Tracker</Text>
      </View>

      <ScreenScroll tabBarInset={false} contentContainerStyle={{ paddingTop: spacing.xs, gap: spacing.md }}>
        {watches.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>🔔</Text>
            <Text style={s.emptyTitle}>No exams tracked yet</Text>
            <Text style={s.emptySub}>
              {"You're not watching any exam results yet. Open an exam and tap 'Watch results'."}
            </Text>
          </View>
        ) : (
          watches.map(w => {
            const resultsIso = w.resultsDate ? epochToISO(w.resultsDate) : null
            const days = resultsIso ? daysUntil(resultsIso, today) : null
            const isFuture = days !== null && days > 0
            const displayDate = w.resultsDate ? fmtDate(w.resultsDate) : null

            return (
              <Card key={w.slug} elevated>
                <Text style={s.cardTitle} numberOfLines={2}>
                  {w.title ?? w.slug}
                </Text>

                {isFuture ? (
                  <>
                    <View style={s.waitingBadge}>
                      <Text style={s.waitingTxt}>
                        Waiting · results ~{displayDate}
                      </Text>
                    </View>
                    <Text style={s.subTxt}>
                      {days} day{days === 1 ? '' : 's'} to go
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={s.readyBadge}>
                      <Text style={s.readyTxt}>Results may be out — check the official site</Text>
                    </View>
                    {displayDate ? (
                      <Text style={s.subTxt}>Expected: {displayDate}</Text>
                    ) : (
                      <Text style={s.subTxt}>Results date not set</Text>
                    )}
                  </>
                )}

                <View style={s.row}>
                  {(!isFuture && w.externalUrl) ? (
                    <>
                      <Pressable
                        style={({ pressed }) => [s.linkBtn, pressed && s.pressed]}
                        onPress={() => w.externalUrl && Linking.openURL(w.externalUrl)}
                        accessibilityRole="link"
                        accessibilityLabel="Visit official site"
                      >
                        <Text style={s.linkBtnTxt}>Official Site ↗</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [s.removeBtn, pressed && s.pressed]}
                        onPress={() => removeWatch(w.slug)}
                        accessibilityRole="button"
                        accessibilityLabel="Remove from watch list"
                      >
                        <Text style={s.removeBtnTxt}>Remove</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [s.removeOnlyBtn, pressed && s.pressed]}
                      onPress={() => removeWatch(w.slug)}
                      accessibilityRole="button"
                      accessibilityLabel="Remove from watch list"
                    >
                      <Text style={s.removeOnlyTxt}>Remove watch</Text>
                    </Pressable>
                  )}
                </View>
              </Card>
            )
          })
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
