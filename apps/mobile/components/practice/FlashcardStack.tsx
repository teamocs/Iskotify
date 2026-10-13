import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, View, ScrollView, StyleSheet } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
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
import { EmptyState } from '../ui/EmptyState'
import { PressableScale } from '../ui/Pressable'
import { WebTopSpacer } from '../ui/WebTopSpacer'
import { decorative, focusRing, heading } from '../ui/a11y'
import { QuestionFigure } from './QuestionFigure'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StackCard {
  id: string
  question: string
  /** The flashcards.answer text, shown after "Show answer" ('' = none saved yet). */
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

/** Shown (and announced) for a card whose row has no answer text yet. */
export const NO_ANSWER = 'No answer saved yet'

/**
 * Owner decision 2026-10-13: only Good and Easy count as a correct answer
 * (progress, the session score, the SRS correct flag). Hard is still a pass
 * for scheduling — it is just not counted as knowing the card.
 */
export function gradeIsCorrect(g: Grade): boolean {
  return g === 'good' || g === 'easy'
}

/** Same floor as Button size md, so the four grades line up. */
const GRADE_MIN_HEIGHT = 48

// ── Helpers ───────────────────────────────────────────────────────────────────

type CardRowLike = Omit<StackCard, 'id' | 'answer'> & { id: string; answer: string | null }

/**
 * toStackCards — the stack's cards for a served question set, in its order,
 * with each card's own answer/explanation/figure from its flashcards row. A
 * question without a row is left out. A row with no answer text is KEPT and
 * shows "No answer saved yet": dropping it would leave it due forever (it
 * would count on Today but never be served), so the student can still grade
 * it and move it on.
 */
export function toStackCards(served: { id?: string }[], rows: CardRowLike[]): StackCard[] {
  const byId = new Map(rows.map(r => [r.id, r]))
  const out: StackCard[] = []
  for (const q of served) {
    const row = q.id != null ? byId.get(q.id) : undefined
    if (!row) continue
    out.push({
      id: row.id,
      question: row.question,
      answer: row.answer?.trim() ?? '',
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
  const [done, setDone] = useState(false)

  const startRef = useRef(Date.now())
  const shownAtRef = useRef(Date.now())
  // M1: what is graded is saved however the student leaves. gradedRef is the
  // latest list (for unmount / beforeRemove / background handlers),
  // flushedRef how many of them already reached user_progress, and
  // sessionRef whether the one session row was written.
  const gradedRef = useRef<GradedCard[]>([])
  const flushedRef = useRef(0)
  const sessionRef = useRef(false)

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
  /**
   * Writes the graded cards not yet in user_progress and, when `final`, the
   * run's one session row. Idempotent: each card is written once and the
   * session once, whichever of finish / Exit / unmount / beforeRemove /
   * background gets there first. Never blocks the UI.
   */
  function recordRun(list: GradedCard[], final: boolean) {
    const fresh = list.slice(flushedRef.current)
    flushedRef.current = list.length
    const writeSession = final && !sessionRef.current && list.length > 0
    if (writeSession) sessionRef.current = true
    if (fresh.length === 0 && !writeSession) return
    void (async () => {
      // Progress first, then the session (its backup push should carry both).
      if (fresh.length > 0) {
        try {
          await recordProgress(fresh.map(g => ({ flashcardId: g.id, correct: gradeIsCorrect(g.grade), answeredAt: g.at })))
        } catch (err) { warn('recordProgress')(err) }
      }
      if (writeSession) {
        try {
          await recordSession({
            listingSlug: '',
            topicId: '',
            deckId,
            score: list.filter(g => gradeIsCorrect(g.grade)).length,
            total: list.length,
            startTime: startRef.current,
            kind: 'flashcard',
          })
        } catch (err) { warn('recordSession')(err) }
      }
    })()
  }
  const recordRunRef = useRef(recordRun)
  recordRunRef.current = recordRun

  // Leaving by any route saves: unmount (iOS swipe-back, Android back, a
  // router.back()), the navigator's beforeRemove (fires before the exit
  // animation), and the app going to the background (it may be killed there:
  // progress is flushed, the session waits for the run to end).
  const navigation = useContext(NavigationContext)
  useEffect(() => {
    const offRemove = navigation?.addListener?.('beforeRemove', () => recordRunRef.current(gradedRef.current, true))
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background') recordRunRef.current(gradedRef.current, false)
    })
    return () => {
      offRemove?.()
      sub?.remove?.()
      recordRunRef.current(gradedRef.current, true)
    }
  }, [navigation])

  function reveal() {
    if (revealed) return
    setRevealed(true)
    animateReveal()
    // M2: iOS VoiceOver ignores accessibilityLiveRegion, so say the answer.
    const shown = cards[index]
    if (shown) AccessibilityInfo.announceForAccessibility(`Answer: ${shown.answer || NO_ANSWER}`)
  }

  function grade(g: Grade) {
    const card = cards[index]
    if (!card || !revealed) return
    const now = Date.now()
    try {
      void recordSrs([{ flashcardId: card.id, correct: gradeIsCorrect(g), elapsedMs: now - shownAtRef.current, grade: g }])
        .catch(warn('recordSrs'))
    } catch (err) { warn('recordSrs')(err) }

    const next = [...graded, { id: card.id, grade: g, at: now }]
    gradedRef.current = next
    setGraded(next)
    if (index + 1 >= cards.length) {
      recordRun(next, true)
      setDone(true)
      return
    }
    setIndex(index + 1)
    setRevealed(false)
    shownAtRef.current = now
    animateAdvance()
  }

  function exit() {
    recordRun(graded, true)
    onExit()
  }

  // Nothing to show (e.g. every served card vanished): say so honestly,
  // never "Review done · You reviewed 0 cards".
  if (cards.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Nothing to review"
          body="There are no cards to review here right now."
          actionLabel="Go back"
          onAction={onExit}
        />
      </Screen>
    )
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
                  {card.answer
                    ? <Text role="headline">{card.answer}</Text>
                    : <Text role="headline" color={t.textSecondary}>{NO_ANSWER}</Text>}
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
