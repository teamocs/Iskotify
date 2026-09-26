import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo, Animated, BackHandler, Easing, PanResponder, Platform, Pressable, ScrollView, Text, View,
  findNodeHandle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../hooks/useDb'
import { useTheme } from '../theme/ThemeContext'
import { radius, spacing, textStyle } from '../theme/tokens'
import { useBreakpoint, pagePadding } from '../hooks/useBreakpoint'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { userSettings } from '../db/schema'
import { focusRing, type WebPressableState } from '../components/ui/a11y'
import { TourVisual } from '../components/walkthrough/TourVisuals'
import { TourCard } from '../components/walkthrough/TourCard'
import { TourControls } from '../components/walkthrough/TourControls'
import { markTourSeen } from '../components/walkthrough/tourState'
import {
  TOUR_CARDS, TOUR_LENGTH, keyAction, parseTourSource, swipeAction, tourExit,
} from '../components/walkthrough/tourFlow'

type TourKeyEvent = {
  key: string
  altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean
  defaultPrevented?: boolean
  target?: { tagName?: string; isContentEditable?: boolean } | null
  preventDefault?: () => void
}
// Fields where arrow keys move the caret or the choice, not the tour.
const EDITABLE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']

/**
 * The guided tour: six full-screen cards, one at a time. Opens once right
 * after onboarding (/tour?from=onboarding) and is replayable from Help
 * (/tour?from=help) or any link to /tour.
 *
 * Next / Back / Skip, "n of N" announced politely, swipe on native, arrow keys
 * on web, Android Back steps back a card. Cards cut instantly under reduced
 * motion; otherwise a short ease-out slide says which way the student moved.
 */
export default function TourScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const reduced = useReducedMotion()
  const params = useLocalSearchParams<{ from?: string }>() ?? {}
  const source = parseTourSource(params.from)

  const [index, setIndex] = useState(0)
  const [firstName, setFirstName] = useState('')
  const titleRef = useRef<Text>(null)
  const card = TOUR_CARDS[index]!
  const last = index === TOUR_LENGTH - 1

  // Seen as soon as it opens: it never auto-opens again. Also reads the name
  // for the welcome card's greeting.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
        const name = rows[0]?.fullName?.trim().split(/\s+/)[0] ?? ''
        if (alive && name) setFirstName(name)
        await markTourSeen(db)
      } catch (e) {
        console.warn('[tour] seen state:', e)
      }
    })()
    return () => { alive = false }
  }, [db])

  // Card change: a short directional slide (skipped under reduced motion), and
  // on native, screen-reader focus moves to the new title.
  const anim = useRef(new Animated.Value(1)).current
  const dirRef = useRef(1)
  const go = useCallback((delta: 1 | -1) => {
    setIndex(i => {
      const n = Math.max(0, Math.min(TOUR_LENGTH - 1, i + delta))
      if (n !== i) dirRef.current = delta
      return n
    })
  }, [])
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (!reduced) {
      anim.setValue(0)
      Animated.timing(anim, {
        toValue: 1, duration: 260, easing: Easing.out(Easing.exp), useNativeDriver: Platform.OS !== 'web',
      }).start()
    }
    if (Platform.OS === 'web') return
    const id = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null
      if (node) AccessibilityInfo.setAccessibilityFocus(node)
    }, 120)
    return () => clearTimeout(id)
  }, [index, reduced, anim])

  const leave = useCallback((action: 'skip' | 'finish' | string) => {
    const exit = tourExit(source, action)
    if (exit.method === 'replace') router.replace(exit.href as Href)
    else if (exit.method === 'dismissTo') router.dismissTo(exit.href as Href)
    else if (router.canGoBack()) router.back()
    else router.replace(exit.href as Href)
  }, [source])

  const next = useCallback(() => { if (last) leave('finish'); else go(1) }, [last, leave, go])
  const back = useCallback(() => go(-1), [go])

  // Android Back: previous card; on the first card the system handles it.
  const indexRef = useRef(index)
  indexRef.current = index
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (indexRef.current === 0) return false
      go(-1)
      return true
    })
    return () => sub.remove()
  }, [go])

  // Web: arrow keys move between cards, read only inside the tour's own
  // region (focused on mount, so they work straight away). Never a
  // document-level listener, which also caught a screen reader's browse-mode
  // arrows; and never a modified arrow (Alt+Arrow is the browser's
  // back/forward) or one typed into an editable field.
  const regionRef = useRef<View>(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    ;(regionRef.current as unknown as { focus?: () => void } | null)?.focus?.()
  }, [])
  const onKeyDown = useCallback((e: TourKeyEvent) => {
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
    const el = e.target
    if (el?.isContentEditable || (el?.tagName && EDITABLE_TAGS.includes(el.tagName))) return
    const a = keyAction(e.key)
    if (a === 'next' && indexRef.current < TOUR_LENGTH - 1) { e.preventDefault?.(); go(1) }
    if (a === 'back' && indexRef.current > 0) { e.preventDefault?.(); go(-1) }
  }, [go])
  // RN's View types omit onKeyDown and a -1 tabIndex on web; RNW forwards both.
  const region = {
    ref: regionRef,
    testID: 'tour-region',
    style: { flex: 1, outlineWidth: 0 },
    ...(Platform.OS === 'web' ? ({ tabIndex: -1, onKeyDown } as object) : null),
  }

  // Native: swipe left/right between cards.
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_e, g) => {
      const a = swipeAction(g.dx, g.dy, g.vx)
      if (a === 'next') go(1)
      if (a === 'back') go(-1)
    },
  }), [go])
  const swipe = Platform.OS === 'web' ? {} : pan.panHandlers

  const compact = bp !== 'expanded'
  const gutter = pagePadding(bp)
  const slide = {
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [dirRef.current * 24, 0] }) }],
  }
  const lead = card.id === 'welcome' && firstName ? `Hi ${firstName}! ${card.body[0]}` : undefined
  const takeMeThere = card.href ? () => leave(card.href!) : undefined
  const nextLabel = last ? 'Tara, simulan na natin' : 'Next'

  const skip = !last ? (
    <Pressable
      onPress={() => leave('skip')}
      accessibilityRole="button"
      accessibilityLabel="Skip the tour"
      hitSlop={4}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressableState
        return [{
          minHeight: 44, minWidth: 44, paddingHorizontal: spacing.md, borderRadius: radius.md,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
        }, focusRing(t.focusRing, focused)]
      }}
    >
      <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={1.6}>Skip</Text>
    </Pressable>
  ) : <View style={{ height: 44 }} />

  const words = (
    <Animated.View style={slide}>
      <TourCard ref={titleRef} card={card} lead={lead} onTakeMeThere={takeMeThere} />
    </Animated.View>
  )
  const controls = <TourControls index={index} onBack={back} onNext={next} nextLabel={nextLabel} />

  if (compact) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
        <View {...region}>
        <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: gutter }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginRight: -spacing.sm, paddingTop: spacing.xs }}>
            {skip}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, gap: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg }} {...swipe}>
            <Animated.View style={slide}><TourVisual id={card.id} compact /></Animated.View>
            {words}
          </ScrollView>
          <View style={{ paddingBottom: spacing.md, paddingTop: spacing.sm }}>{controls}</View>
        </View>
        </View>
      </SafeAreaView>
    )
  }

  // Desktop / large tablet: one card, illustration beside the words.
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View {...region}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: gutter }}>
        <View
          {...swipe}
          style={{
            width: '100%', maxWidth: 1040, alignSelf: 'center', flexDirection: 'row', gap: spacing.xxxl,
            backgroundColor: t.surface, borderRadius: radius.xxl, borderCurve: 'continuous',
            padding: spacing.xxxl, boxShadow: t.shadowMd,
          }}
        >
          <Animated.View style={[{ flex: 11, minWidth: 0 }, slide]}><TourVisual id={card.id} compact={false} /></Animated.View>
          <View style={{ flex: 9, minWidth: 0, justifyContent: 'space-between', gap: spacing.xxl }}>
            <View style={{ alignItems: 'flex-end', marginRight: -spacing.md, marginTop: -spacing.md }}>{skip}</View>
            <View style={{ flex: 1, justifyContent: 'center' }}>{words}</View>
            {controls}
          </View>
        </View>
      </ScrollView>
      </View>
    </SafeAreaView>
  )
}
