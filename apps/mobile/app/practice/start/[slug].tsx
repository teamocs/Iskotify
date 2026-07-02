import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { listings as listingsTable, tertiarySchools } from '../../../db/schema'
import { listPublishedBlueprintSlugs } from '../../../services/examBlueprints'
import { isSchoolFocusSlug, schoolIdFromFocusSlug } from '../../../utils/focusSlug'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius } from '../../../theme/tokens'

// ── Screen: the exam "chooser" ──────────────────────────────────────────────────
// Landing screen after tapping a "My Focus" exam/scholarship card. Lets the user
// choose between a subject/topic review and a timed mock exam (when one is authored).

export default function PracticeStartScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()

  const [listingTitle, setListingTitle] = useState('')
  const [mockAvailable, setMockAvailable] = useState(false)

  // A school-level focus ("school:<id>") has no content of its own — its mock +
  // review resolve to the general entrance practice, but we still show the
  // school's name as the title.
  const isSchool = isSchoolFocusSlug(slug)
  const contentSlug = isSchool ? 'general-cet' : slug

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
    backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    content: { alignItems: 'center', paddingHorizontal: spacing.xxxl, paddingTop: 48, paddingBottom: spacing.xxxl },
    icon: { width: 72, height: 72, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: radius.xl, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
    iconTxt: { fontSize: 36 },
    title: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: spacing.xs },
    sub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.xxl, textAlign: 'center' },
    choiceCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, width: '100%', marginBottom: spacing.md },
    choiceCardPressed: { opacity: 0.8 },
    choiceTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    choiceSub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    noteCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, width: '100%', marginBottom: spacing.md },
    noteTitle: { fontSize: typo.md, fontWeight: '700', color: t.textTertiary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    noteSub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  useEffect(() => {
    let alive = true
    void (async () => {
      const [titleRows, slugs] = await Promise.all([
        isSchool
          ? db.select({ title: tertiarySchools.name }).from(tertiarySchools).where(eq(tertiarySchools.id, schoolIdFromFocusSlug(slug))).limit(1)
          : db.select({ title: listingsTable.title }).from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
        listPublishedBlueprintSlugs(db),
      ])
      if (!alive) return
      setListingTitle(titleRows[0]?.title ?? slug)
      setMockAvailable(slugs.includes(contentSlug))
    })()
    return () => { alive = false }
  }, [db, slug, isSchool, contentSlug])

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.icon}><Text style={s.iconTxt}>🎯</Text></View>
        <Text style={s.title} maxFontSizeMultiplier={1.4}>{listingTitle}</Text>
        <Text style={s.sub} maxFontSizeMultiplier={1.4}>Choose how you want to prepare</Text>

        <Pressable
          style={({ pressed }) => [s.choiceCard, pressed && s.choiceCardPressed]}
          onPress={() => router.push(`/practice/review/${contentSlug}`)}
          accessibilityRole="button"
          accessibilityLabel="Take a Review — study by subject and topic"
        >
          <Text style={s.choiceTitle} maxFontSizeMultiplier={1.4}>Take a Review</Text>
          <Text style={s.choiceSub} maxFontSizeMultiplier={1.4}>Study by subject & topic</Text>
        </Pressable>

        {mockAvailable ? (
          <Pressable
            style={({ pressed }) => [s.choiceCard, pressed && s.choiceCardPressed]}
            onPress={() => router.push(`/practice/exam/${contentSlug}`)}
            accessibilityRole="button"
            accessibilityLabel="Take a Mock Exam — timed, full exam simulation"
          >
            <Text style={s.choiceTitle} maxFontSizeMultiplier={1.4}>Take a Mock Exam</Text>
            <Text style={s.choiceSub} maxFontSizeMultiplier={1.4}>Timed, full exam simulation</Text>
          </Pressable>
        ) : (
          <View style={s.noteCard}>
            <Text style={s.noteTitle} maxFontSizeMultiplier={1.4}>Mock Exam</Text>
            <Text style={s.noteSub} maxFontSizeMultiplier={1.4}>Mock exam coming soon for this listing</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
