import { useMemo, useState } from 'react'
import { View, Text } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { PlusOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { SectionHeader } from '../ui/SectionHeader'
import { Card } from '../ui/Card'
import { ListRow } from '../ui/ListRow'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { StatNumber } from '../ui/StatNumber'
import { Sheet } from '../ui/Sheet'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { isSchoolFocusSlug } from '../../utils/focusSlug'
import {
  buildFocusExamSlots, buildExamPickerOptions, resolveFocusTileRoute,
  DEFAULT_SUGGESTED_EXAM_SLUGS, type FocusExamSlot,
} from '../../utils/focusExamSlots'
import { pickCountdown } from '../../utils/todayNextStep'
import type { ExamListingSummary, BlueprintInfo } from '../../hooks/useHomeCatalog'

interface FocusedExamInput {
  slug: string
  priority: number
  title: string
  type: string
  examDate?: number | null
}

interface Props {
  focusedListings: FocusedExamInput[]
  examListings: ExamListingSummary[]
  blueprintSlugs: string[]
  blueprintInfo: Map<string, BlueprintInfo>
  listingMockBest: Map<string, number>
  listingAccuracy: Record<string, number>
  onAddListing: (slug: string) => void | Promise<void>
  loading?: boolean
  error?: boolean
  onRetry: () => void
}

// Hoisted: building an Intl formatter is slow.
const EXAM_DATE = new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

/**
 * "Your exams": the one focused-exam countdown (big tabular number), then the
 * exams in Focus with their best mock score, then a single "Add an exam" row
 * that opens the picker sheet.
 */
export function FocusExamsFold({
  focusedListings, examListings, blueprintSlugs, blueprintInfo, listingMockBest, listingAccuracy, onAddListing,
  loading, error, onRetry,
}: Props) {
  const { theme: t } = useTheme()
  const [pickerOpen, setPickerOpen] = useState(false)

  const examTitleBySlug = useMemo(() => new Map(examListings.map(l => [l.slug, l.title])), [examListings])

  // Exam-type, non-school focus entries only — school-level focus has no exam row.
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

  // Suggestions only for exams the catalog actually has (a slug-only row is noise).
  const slots = useMemo(
    () => buildFocusExamSlots(focusedExams, { defaultTitles, defaults: Object.keys(defaultTitles) })
      .filter((s): s is Exclude<FocusExamSlot, { kind: 'blank' }> => s.kind !== 'blank'),
    [focusedExams, defaultTitles],
  )

  const pickerOptions = useMemo(
    () => buildExamPickerOptions(examListings, blueprintSlugs, blueprintInfo, focusedSlugSet),
    [examListings, blueprintSlugs, blueprintInfo, focusedSlugSet],
  )

  const countdown = useMemo(
    () => pickCountdown(focusedExams.map(f => ({ ...f, examDate: f.examDate ?? null })), Date.now()),
    [focusedExams],
  )

  const readinessFor = (slug: string): number | null =>
    listingMockBest.get(slug) ?? listingAccuracy[slug] ?? null

  function onRowPress(slot: Exclude<FocusExamSlot, { kind: 'blank' }>) {
    if (slot.kind === 'suggested') { void onAddListing(slot.slug); return }
    router.push(resolveFocusTileRoute(slot.slug, readinessFor(slot.slug) != null, blueprintSlugs) as never)
  }

  const nothingYet = focusedExams.length === 0

  let body: React.ReactNode
  if (loading && nothingYet) {
    body = (
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton accessible label="Loading your exams" width="50%" height={36} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </View>
    )
  } else if (error && nothingYet) {
    body = <ErrorState title="Couldn't load your exams" onRetry={onRetry} />
  } else {
    body = (
      <>
        {countdown ? (
          <View style={{ padding: spacing.lg, gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: t.divider }}>
            <StatNumber
              size="lg"
              value={countdown.days === 0 ? 'Today' : countdown.days}
              unit={countdown.days === 0 ? undefined : countdown.days === 1 ? 'day' : 'days'}
              label={`Until ${countdown.title}`}
            />
            <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
              {EXAM_DATE.format(new Date(countdown.dateMs))}
            </Text>
          </View>
        ) : null}
        {slots.length === 0 ? (
          <EmptyState title="No exams yet" body="Add the entrance exams you're taking to see a countdown here." />
        ) : (
          slots.map(slot => {
            if (slot.kind === 'suggested') {
              return (
                <ListRow
                  key={slot.slug}
                  title={slot.title}
                  subtitle="Suggested"
                  trailing={<Badge label="Add" tone="accent" />}
                  showChevron={false}
                  onPress={() => onRowPress(slot)}
                  accessibilityLabel={`Add ${slot.title} to your exams`}
                />
              )
            }
            const pct = readinessFor(slot.slug)
            return (
              <ListRow
                key={slot.slug}
                title={slot.title}
                subtitle={pct != null ? 'Best score' : 'No score yet'}
                trailing={
                  <Text style={textStyle('numeric', pct != null ? t.textPrimary : t.textSecondary)} maxFontSizeMultiplier={1.5}>
                    {pct != null ? `${pct}%` : '—'}
                  </Text>
                }
                onPress={() => onRowPress(slot)}
                accessibilityLabel={`${slot.title}, ${pct != null ? `best score ${pct}%` : 'no score yet'}`}
              />
            )
          })
        )}
        <View style={{ borderTopWidth: 1, borderTopColor: t.divider }}>
          <ListRow
            title="Add an exam"
            leading={<Lineicons icon={PlusOutlined} size={20} color={t.accentText} />}
            showChevron={false}
            onPress={() => setPickerOpen(true)}
            accessibilityLabel="Add an exam"
          />
        </View>
      </>
    )
  }

  return (
    <View>
      <SectionHeader title="Your exams" actionLabel="All exams" onAction={() => router.push('/(tabs)/explore')} />
      <Card padded={false} style={{ overflow: 'hidden' }}>{body}</Card>

      <Sheet
        visible={pickerOpen}
        title="Add an exam"
        onClose={() => setPickerOpen(false)}
        footer={
          <Button
            label="See all exams"
            variant="secondary"
            fullWidth
            onPress={() => { setPickerOpen(false); router.push('/(tabs)/explore') }}
          />
        }
      >
        {pickerOptions.length === 0 ? (
          <Text style={[textStyle('body', t.textSecondary), { paddingVertical: spacing.lg }]} maxFontSizeMultiplier={2}>
            You've added every exam we track.
          </Text>
        ) : (
          pickerOptions.map(opt => (
            <ListRow
              key={opt.slug}
              title={opt.title}
              showChevron={false}
              onPress={() => { void onAddListing(opt.slug); setPickerOpen(false) }}
              accessibilityLabel={`Add ${opt.title} to Focus`}
            />
          ))
        )}
      </Sheet>
    </View>
  )
}
