import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { SectionHeader } from '../ui/SectionHeader'
import { Badge } from '../ui/Badge'
import { WebTopSpacer } from '../ui/WebTopSpacer'
import { isSchoolFocusSlug } from '../../utils/focusSlug'
import { subjectColor } from '../../utils/subjectColors'
import { readinessTone, type ReadinessTone } from '../../utils/readinessTone'
import {
  buildFocusExamSlots, buildExamPickerOptions, examAcronym,
  DEFAULT_SUGGESTED_EXAM_SLUGS, type FocusExamSlot,
} from '../../utils/focusExamSlots'
import type { ExamListingSummary, BlueprintInfo } from '../../hooks/useHomeCatalog'

const TONE_TO_BADGE: Record<ReadinessTone, 'success' | 'warning' | 'danger' | 'neutral'> = {
  strong: 'success', fair: 'warning', weak: 'danger', none: 'neutral',
}

interface FocusedExamInput {
  slug: string
  priority: number
  title: string
  type: string
}

interface Props {
  focusedListings: FocusedExamInput[]
  examListings: ExamListingSummary[]
  blueprintSlugs: string[]
  blueprintInfo: Map<string, BlueprintInfo>
  listingMockBest: Map<string, number>
  listingAccuracy: Record<string, number>
  onAddListing: (slug: string) => void | Promise<void>
}

export function FocusExamsFold({
  focusedListings, examListings, blueprintSlugs, blueprintInfo, listingMockBest, listingAccuracy, onAddListing,
}: Props) {
  const { theme: t, typo } = useTheme()
  const [pickerOpen, setPickerOpen] = useState(false)

  const examTitleBySlug = useMemo(() => new Map(examListings.map(l => [l.slug, l.title])), [examListings])

  // Exam-type, non-school focus entries only — school-level focus has no exam tile.
  const focusedExams = useMemo(
    () => focusedListings.filter(l => l.type === 'exam' && !isSchoolFocusSlug(l.slug)),
    [focusedListings],
  )
  const focusedSlugSet = useMemo(() => new Set(focusedExams.map(f => f.slug)), [focusedExams])

  const defaultTitles = useMemo(() => {
    const m: Record<string, string> = {}
    for (const slug of DEFAULT_SUGGESTED_EXAM_SLUGS) {
      const title = examTitleBySlug.get(slug)
      if (title) m[slug] = title
    }
    return m
  }, [examTitleBySlug])

  const slots = useMemo(
    () => buildFocusExamSlots(focusedExams, { defaultTitles }),
    [focusedExams, defaultTitles],
  )

  const pickerOptions = useMemo(
    () => buildExamPickerOptions(examListings, blueprintSlugs, blueprintInfo, focusedSlugSet),
    [examListings, blueprintSlugs, blueprintInfo, focusedSlugSet],
  )

  const readinessFor = (slug: string): number | null =>
    listingMockBest.get(slug) ?? listingAccuracy[slug] ?? null

  const acronymFor = (slug: string, title: string): string =>
    examAcronym(title, blueprintInfo.get(slug)?.acronym)

  function onTileTap(slot: FocusExamSlot) {
    if (slot.kind === 'blank') { setPickerOpen(true); return }
    if (slot.kind === 'suggested') { void onAddListing(slot.slug); return }
    const hasScore = readinessFor(slot.slug) != null
    router.push(hasScore ? (`/practice/start/${slot.slug}` as never) : ('/practice/diagnostic' as never))
  }

  const s = useMemo(() => makeStyles(), [])

  return (
    <View>
      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader
          title="My Entrance Exams"
          subtitle="Your target exams and how ready you are"
          actionLabel="See more"
          onAction={() => router.push('/(tabs)/listings')}
        />
      </View>
      <View style={s.grid}>
        {slots.map((slot, i) => {
          if (slot.kind === 'blank') {
            return (
              <Pressable
                key={`blank-${i}`}
                style={({ pressed }) => [s.tile, s.blankTile, { borderColor: t.border }, pressed && { opacity: 0.7 }]}
                onPress={() => onTileTap(slot)}
                accessibilityRole="button"
                accessibilityLabel="Add an exam"
              >
                <Text style={[s.blankPlus, { color: t.textTertiary }]}>＋</Text>
              </Pressable>
            )
          }

          const pct = readinessFor(slot.slug)
          const tone = readinessTone(pct)
          const accent = subjectColor(slot.slug).accent
          const acronym = acronymFor(slot.slug, slot.title)

          return (
            <Pressable
              key={slot.slug}
              style={({ pressed }) => [s.tile, { backgroundColor: t.surface, borderColor: t.border, boxShadow: t.shadowSm }, pressed && { opacity: 0.8 }]}
              onPress={() => onTileTap(slot)}
              accessibilityRole="button"
              accessibilityLabel={slot.title}
            >
              <View style={s.tileTop}>
                <Badge label={pct != null ? `${pct}%` : '—'} tone={TONE_TO_BADGE[tone]} />
                {slot.kind === 'suggested' ? (
                  <View style={[s.addPill, { backgroundColor: t.accentSurface }]}>
                    <Text style={[s.addPillTxt, { color: t.accentText }]} maxFontSizeMultiplier={1.4}>+ Add</Text>
                  </View>
                ) : null}
              </View>
              <View style={[s.monogram, { backgroundColor: accent }]}>
                <Text style={s.monogramTxt} maxFontSizeMultiplier={1.2}>{acronym}</Text>
              </View>
              <Text style={[s.tileTitle, { color: t.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>{slot.title}</Text>
            </Pressable>
          )
        })}
      </View>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setPickerOpen(false)} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[s.sheet, { backgroundColor: t.bg }]}>
          <WebTopSpacer />
          <View style={s.handle} />
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { fontSize: typo.lg, color: t.textPrimary }]}>Add an exam</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={{ fontSize: typo.md, color: t.textTertiary }}>✕</Text>
            </Pressable>
          </View>
          <View style={s.pickerGrid}>
            {pickerOptions.map(opt => (
              <Pressable
                key={opt.slug}
                style={({ pressed }) => [s.pickerTile, pressed && { opacity: 0.8 }]}
                onPress={() => { void onAddListing(opt.slug); setPickerOpen(false) }}
                accessibilityRole="button"
                accessibilityLabel={`Add ${opt.title} to Focus`}
              >
                <View style={[s.monogram, s.pickerMonogram, { backgroundColor: subjectColor(opt.slug).accent }]}>
                  <Text style={s.monogramTxt} maxFontSizeMultiplier={1.2}>{opt.acronym}</Text>
                </View>
                <Text style={[s.pickerTileTitle, { color: t.textPrimary }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>{opt.title}</Text>
              </Pressable>
            ))}
          </View>
          {pickerOptions.length === 0 ? (
            <Text style={{ fontSize: typo.sm, color: t.textTertiary, textAlign: 'center', marginVertical: spacing.lg }}>
              You've added every exam we track — nice.
            </Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [s.seeAllBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { setPickerOpen(false); router.push('/(tabs)/listings') }}
            accessibilityRole="button"
          >
            <Text style={[s.seeAllTxt, { color: t.accentText }]} maxFontSizeMultiplier={1.4}>See all exams ›</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  )
}

function makeStyles() {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tile: {
      position: 'relative',
      flexBasis: '31%',
      flexGrow: 1,
      minHeight: 108,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      padding: spacing.sm,
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.xs,
    },
    blankTile: {
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    blankPlus: { fontSize: 24, opacity: 0.5 },
    tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
    addPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
    addPillTxt: { fontSize: 10, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    monogram: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    monogramTxt: { fontSize: 12, fontWeight: '700', color: '#ffffff', fontFamily: 'Outfit_700Bold' },
    tileTitle: { fontSize: 11, fontWeight: '600', textAlign: 'center', fontFamily: 'Outfit_600SemiBold' },
    // Modal
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '80%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12 },
    handle: { width: 36, height: 4, backgroundColor: 'rgba(128,128,128,0.35)', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
    sheetTitle: { fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    pickerTile: { flexBasis: '31%', flexGrow: 1, minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.xs },
    pickerMonogram: { width: 44, height: 44, borderRadius: 22 },
    pickerTileTitle: { fontSize: 11, fontWeight: '600', textAlign: 'center', fontFamily: 'Outfit_600SemiBold' },
    seeAllBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
    seeAllTxt: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  })
}
