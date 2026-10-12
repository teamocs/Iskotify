import { useMemo, useRef, useState } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { XmarkOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { motion, radius, spacing, type Theme } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { useBreakpoint, pagePadding, contentMaxWidth } from '../../hooks/useBreakpoint'
import { useRecordSrs, useSrsStates } from '../../hooks/useRecordSrs'
import { useRecordProgress } from '../../hooks/useRecordProgress'
import { useRecordSession } from '../../hooks/useRecordSession'
import { GRADES, formatIntervalDays, previewIntervals, type Grade } from '../../utils/srs'
import { GlassIconButton } from '../navigation/GlassIconButton'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'
import { ProgressBar } from '../ui/ProgressBar'
import { Screen } from '../ui/Screen'
import { PressableScale } from '../ui/Pressable'
import { WebTopSpacer } from '../ui/WebTopSpacer'
import { decorative, focusRing, heading } from '../ui/a11y'
import { QuestionFigure } from './QuestionFigure'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StackCard {
  id: string
  question: string
  /** The flashcards.answer text, shown after "Show answer". */
  answer: string
  explanation?: string | null
  imageUrl?: string | null
  imageAlt?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
}

export interface FlashcardStackProps {
  title: string
  cards: StackCard[]
  /** The launching deckId, or the '__due__' sentinel for the due queue. */
  deckId: string
  onExit: () => void
}

interface GradedCard { id: string; grade: Grade; at: number }

// ── Constants ─────────────────────────────────────────────────────────────────

/** The two cards under the top card: scale and how far each sits lower. */
export const STACK_DEPTH = [
  { scale: 0.94, offset: 10 },
  { scale: 0.88, offset: 20 },
] as const

/** Spoken and visible grade names. */
export const GRADE_LABEL: Record<Grade, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }

const GRADE_TONE: Record<Exclude<Grade, 'good'>, { bg: keyof Theme; fg: keyof Theme }> = {
  again: { bg: 'dangerSurface', fg: 'dangerStrong' },
  hard: { bg: 'warningSurface', fg: 'warningStrong' },
  easy: { bg: 'successSurface', fg: 'successStrong' },
}

/** Same floor as Button size md, so the four grades line up. */
const GRADE_MIN_HEIGHT = 48

// ── Helpers ───────────────────────────────────────────────────────────────────

type CardRowLike = Omit<StackCard, 'id' | 'answer'> & { id: string; answer: string | null }

/**
 * toStackCards — the stack's cards for a served question set, in its order,
 * with each card's own answer/explanation/figure from its flashcards row. A
 * question without a row, or a row without an answer, is left out.
 */
export function toStackCards(served: { id?: string }[], rows: CardRowLike[]): StackCard[] {
  const byId = new Map(rows.map(r => [r.id, r]))
  const out: StackCard[] = []
  for (const q of served) {
    const row = q.id != null ? byId.get(q.id) : undefined
    if (!row || !row.answer) continue
    out.push({
      id: row.id,
      question: row.question,
      answer: row.answer,
      explanation: row.explanation ?? null,
      imageUrl: row.imageUrl ?? null,
      imageAlt: row.imageAlt ?? null,
      imageWidth: row.imageWidth ?? null,
      imageHeight: row.imageHeight ?? null,
    })
  }
  return out
}

function warn(label: string) {
  return (err: unknown) => console.warn(`[FlashcardStack] ${label} failed:`, err)
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * FlashcardStack — the self-graded review (iOS redesign P4) used by the due
 * queue and a deck's "Due today" mode. A card stack with depth; the top card
 * shows the question, "Show answer" flips it to the answer, and the student
 * grades their own recall (Again / Hard / Good / Easy), each grade naming the
 * interval it schedules from the card's real flashcard_srs state.
 *
 * One primary action at a time: Show answer, then Good, then Done.
 *
 * Persistence is best-effort and never blocks the stack: each grade schedules
 * its card at once; progress and one session row are written on finishing
 * (or on leaving with at least one card graded). No question_attempts rows —
 * there is no option pick to record.
 */
export function FlashcardStack({ title, cards, deckId, onExit }: FlashcardStackProps) {
  const { theme: t } = useTheme()
  const { reduceMotion } = usePlatformCapabilities()
  const bp = useBreakpoint()
  const { recordSrs } = useRecordSrs()
  const { recordProgress } = useRecordProgress()
  const { recordSession } = useRecordSession()

  const ids = useMemo(() => cards.map(c => c.id), [cards])
  const { states, loaded } = useSrsStates(ids)

  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [graded, setGraded] = useState<GradedCard[]>([])
  const [done, setDone] = useState(cards.length === 0)

  const startRef = useRef(Date.now())
  const shownAtRef = useRef(Date.now())
  const recordedRef = useRef(false)

  // ── Motion: flip on reveal, rise from the stack on advance ─────────────────
  const flip = useSharedValue(0)   // rotateY degrees
  const rise = useSharedValue(1)   // 0 = at depth 1, 1 = on top
  const fade = useSharedValue(1)   // Reduce Motion crossfade

  const topStyle = useAnimatedStyle(() => {
    const depth = STACK_DEPTH[0]
    return {
      opacity: fade.value,
      transform: [
        { perspective: 1000 },
        { translateY: depth.offset * (1 - rise.value) },
        { scale: depth.scale + (1 - depth.scale) * rise.value },
        { rotateY: `${flip.value}deg` },
      ],
    }
  })

  function crossfade() {
    fade.value = 0
    fade.value = withTiming(1, { duration: motion.duration.reduced })
  }

  function animateReveal() {
    if (reduceMotion) { crossfade(); return }
    flip.value = 90
    flip.value = withSpring(0, motion.spring.smooth)
  }

  function animateAdvance() {
    flip.value = 0
    if (reduceMotion) { rise.value = 1; crossfade(); return }
    rise.value = 0
    rise.value = withSpring(1, motion.spring.smooth)
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  function recordRun(list: GradedCard[]) {
    if (recordedRef.current || list.length === 0) return
    recordedRef.current = true
    void (async () => {
      // Progress first, then the session (its backup push should carry both).
      try {
        await recordProgress(list.map(g => ({ flashcardId: g.id, correct: g.grade !== 'again', answeredAt: g.at })))
      } catch (err) { warn('recordProgress')(err) }
      try {
        await recordSession({
          listingSlug: '',
          topicId: '',
          deckId,
          score: list.filter(g => g.grade !== 'again').length,
          total: list.length,
          startTime: startRef.current,
          kind: 'flashcard',
        })
      } catch (err) { warn('recordSession')(err) }
    })()
  }

  function reveal() {
    if (revealed) return
    setRevealed(true)
    animateReveal()
  }

  function grade(g: Grade) {
    const card = cards[index]
    if (!card || !revealed) return
    const now = Date.now()
    try {
      void recordSrs([{ flashcardId: card.id, correct: g !== 'again', elapsedMs: now - shownAtRef.current, grade: g }])
        .catch(warn('recordSrs'))
    } catch (err) { warn('recordSrs')(err) }

    const next = [...graded, { id: card.id, grade: g, at: now }]
    setGraded(next)
    if (index + 1 >= cards.length) {
      recordRun(next)
      setDone(true)
      return
    }
    setIndex(index + 1)
    setRevealed(false)
    shownAtRef.current = now
    animateAdvance()
  }

  function exit() {
    recordRun(graded)
    onExit()
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  if (done) return <StackSummary graded={graded} onDone={onExit} />

  const card = cards[index]!
  const remaining = cards.length - index - 1
  const intervals = loaded ? previewIntervals(states.get(card.id) ?? null, Date.now()) : null
  const column = {
    width: '100%' as const,
    maxWidth: contentMaxWidth('reading'),
    alignSelf: 'center' as const,
    paddingHorizontal: pagePadding(bp),
  }
  const cardShape = {
    borderRadius: radius.sheet,
    borderCurve: 'continuous' as const,
    backgroundColor: t.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  }
  const stackPad = STACK_DEPTH[STACK_DEPTH.length - 1]!.offset

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <WebTopSpacer />

      {/* Header: exit · title · Card N of M, thin progress underneath */}
      <View style={{ backgroundColor: t.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
          <GlassIconButton icon={XmarkOutlined} accessibilityLabel="Exit review" onPress={exit} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text role="headline" chrome numberOfLines={1}>{title}</Text>
            <Text role="footnote" chrome color={t.textSecondary} style={{ fontVariant: ['tabular-nums'] }}>
              {`Card ${index + 1} of ${cards.length}`}
            </Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <ProgressBar value={cards.length ? index / cards.length : 0} label={`Reviewed ${index} of ${cards.length}`} height={4} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={column}>
          <View style={{ paddingBottom: stackPad }}>
            {/* Depth: the next two cards, drawn first so they sit underneath */}
            {STACK_DEPTH.slice(0, Math.max(0, remaining))
              .map((d, i) => ({ scale: d.scale as number, offset: d.offset as number, n: i + 1 }))
              .reverse()
              .map(d => (
                <View
                  key={d.n}
                  testID={`stack-depth-${d.n}`}
                  {...decorative}
                  style={[
                    cardShape,
                    {
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: stackPad,
                      transformOrigin: 'bottom',
                      transform: [{ translateY: d.offset }, { scale: d.scale }],
                    },
                  ]}
                />
              ))}

            <Animated.View
              key={card.id}
              testID="stack-top"
              style={[cardShape, { padding: spacing.xxl, gap: spacing.lg, minHeight: 280 }, topStyle]}
            >
              <Text role="title3">{card.question}</Text>
              <QuestionFigure
                imageUrl={card.imageUrl}
                imageAlt={card.imageAlt}
                imageWidth={card.imageWidth}
                imageHeight={card.imageHeight}
              />
              {revealed ? (
                <View testID="stack-answer" accessibilityLiveRegion="polite" style={{ gap: spacing.md }}>
                  <View {...decorative} style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.divider }} />
                  <Text role="headline">{card.answer}</Text>
                  {card.explanation ? <Text role="body" color={t.textSecondary}>{card.explanation}</Text> : null}
                </View>
              ) : null}
            </Animated.View>
          </View>
        </View>
      </ScrollView>

      {/* Actions: Show answer, then the four grades */}
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.divider, backgroundColor: t.bg }}>
        <View style={[column, { paddingVertical: spacing.md, gap: spacing.sm }]}>
          {revealed ? (
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <GradeButton grade="again" days={intervals?.again} onPress={() => grade('again')} />
                <GradeButton grade="hard" days={intervals?.hard} onPress={() => grade('hard')} />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={gradeText('good', intervals?.good)}
                    accessibilityLabel={gradeName('good', intervals?.good)}
                    onPress={() => grade('good')}
                    fullWidth
                  />
                </View>
                <GradeButton grade="easy" days={intervals?.easy} onPress={() => grade('easy')} />
              </View>
            </>
          ) : (
            <Button label="Show answer" onPress={reveal} size="lg" fullWidth />
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

// ── Grade buttons ─────────────────────────────────────────────────────────────

/** Visible label: "Good · 3 days" (just "Good" until the schedule is read). */
function gradeText(g: Grade, days: number | undefined): string {
  return days == null ? GRADE_LABEL[g] : `${GRADE_LABEL[g]} · ${formatIntervalDays(days)}`
}

/** Spoken name: "Good, next review in 3 days". */
function gradeName(g: Grade, days: number | undefined): string {
  return days == null ? GRADE_LABEL[g] : `${GRADE_LABEL[g]}, next review in ${formatIntervalDays(days)}`
}

function GradeButton({ grade, days, onPress }: { grade: Exclude<Grade, 'good'>; days: number | undefined; onPress: () => void }) {
  const { theme: t } = useTheme()
  const tone = GRADE_TONE[grade]
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={gradeName(grade, days)}
      style={({ focused }) => [
        {
          flex: 1,
          minHeight: GRADE_MIN_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.button,
          borderCurve: 'continuous',
          backgroundColor: t[tone.bg],
        },
        focusRing(t.focusRing, focused),
      ]}
    >
      <Text role="headline" color={t[tone.fg]} style={{ textAlign: 'center' }}>{gradeText(grade, days)}</Text>
    </PressableScale>
  )
}

// ── Summary ───────────────────────────────────────────────────────────────────

function StackSummary({ graded, onDone }: { graded: GradedCard[]; onDone: () => void }) {
  const { theme: t } = useTheme()
  const counts = GRADES
    .map(g => ({ g, n: graded.filter(x => x.grade === g).length }))
    .filter(c => c.n > 0)
  const total = graded.length
  return (
    <Screen>
      <View style={{ gap: spacing.lg, paddingTop: spacing.xl }}>
        <Text role="largeTitle" {...heading(1)}>Review done</Text>
        <Text role="body" color={t.textSecondary} style={{ fontVariant: ['tabular-nums'] }}>
          {total === 1 ? 'You reviewed 1 card.' : `You reviewed ${total} cards.`}
        </Text>
        {counts.length > 0 ? (
          <View
            style={{
              borderRadius: radius.group, borderCurve: 'continuous', backgroundColor: t.surface,
              paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
            }}
          >
            {counts.map(({ g, n }, i) => (
              <View
                key={g}
                style={{
                  minHeight: 44, justifyContent: 'center',
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.divider,
                }}
              >
                <Text role="body" style={{ fontVariant: ['tabular-nums'] }}>{`${n} ${GRADE_LABEL[g]}`}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Button label="Done" onPress={onDone} size="lg" fullWidth />
      </View>
    </Screen>
  )
}
