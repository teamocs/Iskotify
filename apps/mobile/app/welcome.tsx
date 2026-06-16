import { useMemo, useRef, useState, useCallback } from 'react'
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'

interface Slide {
  emoji: string
  title: string
  body: string
}

const SLIDES: Slide[] = [
  {
    emoji: '🏠',
    title: 'Home — your dashboard',
    body: 'A daily greeting, tips from Kuya Baw, and your exam readiness at a glance.',
  },
  {
    emoji: '📚',
    title: 'Exams',
    body: 'Practice by subject or topic, take full mock exams, and track your readiness over time.',
  },
  {
    emoji: '🔎',
    title: 'Lists',
    body: 'Browse universities, scholarships, courses, and career destinations — all searchable.',
  },
  {
    emoji: '💬',
    title: 'Ask Kuya Baw',
    body: 'Tap the center button to ask about your exams, courses, or any study question.',
  },
  {
    emoji: '🔔',
    title: 'Updates',
    body: 'Admission news, upcoming events, plus your calendar and reminders in one place.',
  },
]

/**
 * welcome — a skippable first-run tour shown AFTER onboarding completes.
 *
 * Reached only via router.replace('/welcome') from app/onboarding.tsx, so
 * returning users never see it (no persisted flag needed). Both "Skip" and
 * "Get started" forward into the app via router.replace('/(tabs)').
 */
export default function WelcomeScreen() {
  const { theme: t, typo } = useTheme()
  const { width } = useWindowDimensions()
  const scrollRef = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)
  const lastIndex = SLIDES.length - 1
  const isLast = index === lastIndex

  const s = useMemo(() => StyleSheet.create({
    root:     { flex: 1, backgroundColor: t.bg },
    topBar:   { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, minHeight: 44 },
    skipBtn:  { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, minHeight: 44, justifyContent: 'center' },
    skipTxt:  { fontFamily: 'Lexend_500Medium', fontSize: typo.sm, color: t.textTertiary },
    slide:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
    emojiWrap:{ width: 120, height: 120, borderRadius: radius.pill, backgroundColor: t.accentSurface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xxxl },
    emoji:    { fontSize: 60 },
    title:    { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, textAlign: 'center', marginBottom: spacing.md, letterSpacing: -0.3 },
    body:     { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary, textAlign: 'center', lineHeight: 23, maxWidth: 360 },
    footer:   { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xl, gap: spacing.xl },
    dots:     { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
    dot:      { height: 8, borderRadius: radius.pill },
    btnRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    back:     { paddingVertical: 15, paddingHorizontal: spacing.xl, minHeight: 48, justifyContent: 'center' },
    backTxt:  { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textSecondary },
    primary:  { flex: 1, backgroundColor: t.accentStrong, borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    primaryTxt:{ fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textInverse },
  }), [t, typo])

  const finish = useCallback(() => {
    router.replace('/(tabs)')
  }, [])

  const goTo = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(lastIndex, i))
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true })
    setIndex(clamped)
  }, [lastIndex, width])

  const handleNext = useCallback(() => {
    if (isLast) finish()
    else goTo(index + 1)
  }, [isLast, finish, goTo, index])

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width)
    if (i !== index) setIndex(i)
  }, [width, index])

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <Pressable
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel="Skip the tour"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [s.skipBtn, pressed ? { opacity: 0.6 } : null]}
        >
          <Text style={s.skipTxt} maxFontSizeMultiplier={1.4}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[s.slide, { width }]}>
            <View style={s.emojiWrap}>
              <Text style={s.emoji} accessibilityElementsHidden importantForAccessibility="no">
                {slide.emoji}
              </Text>
            </View>
            <Text style={s.title} maxFontSizeMultiplier={1.4}>{slide.title}</Text>
            <Text style={s.body} maxFontSizeMultiplier={1.4}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.footer}>
        {/* Progress dots */}
        <View
          style={s.dots}
          accessibilityRole="adjustable"
          accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}
        >
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[s.dot, {
                width: i === index ? 24 : 8,
                backgroundColor: i === index ? t.accent : t.surface2,
              }]}
            />
          ))}
        </View>

        {/* Controls */}
        <View style={s.btnRow}>
          {index > 0 ? (
            <Pressable
              onPress={() => goTo(index - 1)}
              accessibilityRole="button"
              accessibilityLabel="Previous slide"
              style={({ pressed }) => [s.back, pressed ? { opacity: 0.6 } : null]}
            >
              <Text style={s.backTxt} maxFontSizeMultiplier={1.4}>Back</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Get started' : 'Next slide'}
            style={({ pressed }) => [s.primary, pressed ? { opacity: 0.85 } : null]}
          >
            <Text style={s.primaryTxt} maxFontSizeMultiplier={1.4}>
              {isLast ? 'Get started' : 'Next'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}
