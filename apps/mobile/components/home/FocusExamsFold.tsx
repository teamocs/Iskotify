import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { PlusOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { InsetGroup, InsetRow } from '../ui/InsetGroup'
import { ListRow } from '../ui/ListRow'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Sheet } from '../ui/Sheet'
import { Text } from '../ui/Text'
import { TodaySectionHeader } from './TodaySectionHeader'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { isSchoolFocusSlug } from '../../utils/focusSlug'
import {
  buildFocusExamSlots, buildExamPickerOptions, resolveFocusTileRoute,
  practiceAvailability, practiceAvailabilityLabel,
  DEFAULT_SUGGESTED_EXAM_SLUGS, type FocusExamSlot, type PracticeAvailability,
} from '../../utils/focusExamSlots'
import { focusExamScore } from '../../utils/focusExamScore'
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
  /** RUNNABLE blueprint slugs (useHomeCatalog): an exam outside it has no mock to take. */
  blueprintSlugs: string[]
  /** Exams with flashcard topics to review (practice without a mock). */
  reviewSlugs?: ReadonlySet<string>
  /** False until blueprints/topics have loaded: no "coming soon" label before that. */
  availabilityKnown?: boolean
  blueprintInfo: Map<string, BlueprintInfo>
  listingMockBest: Map<string, number>
  listingAccuracy: Record<string, number>
  onAddListing: (slug: string) => void | Promise<void>
  loading?: boolean
  error?: boolean
  onRetry: () => void
}

const NO_SLUGS: ReadonlySet<string> = new Set()

/**
 * "Your exams": the exams in Focus with their best mock score on one inset
 * group, then a single "Add an exam" row that opens the picker sheet. The
 * day countdowns sit higher on Today, as tiles (ExamCountdowns).
 */
export function FocusExamsFold({
  focusedListings, examListings, blueprintSlugs, blueprintInfo, listingMockBest, listingAccuracy, onAddListing,
  reviewSlugs = NO_SLUGS, availabilityKnown = true, loading, error, onRetry,
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
    () => buildExamPickerOptions(examListings, blueprintSlugs, blueprintInfo, focusedSlugSet, undefined, reviewSlugs),
    [examListings, blueprintSlugs, blueprintInfo, focusedSlugSet, reviewSlugs],
  )

  const scoreFor = (slug: string) => focusExamScore(listingMockBest.get(slug), listingAccuracy[slug])
  const readinessFor = (slug: string): number | null => scoreFor(slug).pct
  // "Practice coming soon" / "Mock exam coming soon": only once we actually know.
  const missingLabel = (a: PracticeAvailability): string | null => (availabilityKnown ? practiceAvailabilityLabel(a) : null)

  // null while availability is unknown and the route depends on it: the row waits (aria-disabled).
  const routeFor = (slug: string) =>
    resolveFocusTileRoute(slug, readinessFor(slug) != null, blueprintSlugs, reviewSlugs, availabilityKnown)

  function onRowPress(slot: Exclude<FocusExamSlot, { kind: 'blank' }>) {
    if (slot.kind === 'suggested') { void onAddListing(slot.slug); return }
    const route = routeFor(slot.slug)
    if (route) router.push(route as never)
  }

  const nothingYet = focusedExams.length === 0

  const rows: React.ReactNode[] = []
  if (loading && nothingYet) {
    rows.push(
      <View key="loading" style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton accessible label="Loading your exams" width="50%" height={36} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </View>,
    )
  } else if (error && nothingYet) {
    rows.push(<ErrorState key="error" title="Couldn't load your exams" onRetry={onRetry} />)
  } else {
    if (slots.length === 0) {
      rows.push(<EmptyState key="empty" title="No exams yet" body="Add the entrance exams you're taking to see a countdown here." />)
    }
    for (const slot of slots) {
      if (slot.kind === 'suggested') {
        rows.push(
          <ListRow
            key={slot.slug}
            title={slot.title}
            subtitle="Suggested"
            trailing={<Badge label="Add" tone="accent" />}
            showChevron={false}
            onPress={() => onRowPress(slot)}
            accessibilityLabel={`Add ${slot.title} to your exams`}
          />,
        )
        continue
      }
      const { pct, label: scoreLabel } = scoreFor(slot.slug)
      const missing = missingLabel(practiceAvailability(slot.slug, blueprintSlugs, reviewSlugs))
      const waiting = routeFor(slot.slug) === null
      rows.push(
        <ListRow
          key={slot.slug}
          title={slot.title}
          subtitle={missing ? `${scoreLabel} · ${missing}` : scoreLabel}
          trailing={
            <Text role="headline" color={pct != null ? t.textPrimary : t.textSecondary} style={{ fontVariant: ['tabular-nums'] }}>
              {pct != null ? `${pct}%` : '—'}
            </Text>
          }
          onPress={() => onRowPress(slot)}
          disabled={waiting}
          accessibilityHint={waiting ? 'Checking availability' : undefined}
          accessibilityLabel={`${slot.title}, ${pct != null ? `best score ${pct}%` : 'no score yet'}${missing ? `, ${missing.toLowerCase()}` : ''}`}
        />,
      )
    }
    rows.push(
      <InsetRow
        key="add"
        title="Add an exam"
        icon={PlusOutlined}
        chevron={false}
        onPress={() => setPickerOpen(true)}
        accessibilityLabel="Add an exam"
      />,
    )
  }

  return (
    <View testID="your-exams">
      <TodaySectionHeader title="Your exams" actionLabel="All exams" onAction={() => router.push('/(tabs)/explore')} />
      <InsetGroup inset={false}>{rows}</InsetGroup>

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
          <Text role="body" color={t.textSecondary} style={{ paddingVertical: spacing.lg }}>
            You've added every exam we track.
          </Text>
        ) : (
          pickerOptions.map(opt => {
            const missing = missingLabel(opt.practice)
            return (
              <ListRow
                key={opt.slug}
                title={opt.title}
                subtitle={missing ?? undefined}
                showChevron={false}
                onPress={() => { void onAddListing(opt.slug); setPickerOpen(false) }}
                accessibilityLabel={`Add ${opt.title} to Focus${missing ? `, ${missing.toLowerCase()}` : ''}`}
              />
            )
          })
        )}
      </Sheet>
    </View>
  )
}
