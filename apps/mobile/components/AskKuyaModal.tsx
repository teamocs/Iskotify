import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
// RN Image is fine for a small bundled asset; expo-image is a native module that would break OTA.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { Image } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  ChevronLeftOutlined,
  QuestionMarkCircleOutlined,
  Trash3Outlined,
  Locked1Outlined,
  CloudCheckCircleOutlined,
  ArrowUpwardOutlined,
} from '@lineiconshq/free-icons'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, type Theme, type Typography } from '../theme/tokens'
import { useKuyaChat, type ChatMessage } from '../hooks/useKuyaChat'
import { useDb } from '../hooks/useDb'
import { getSettings } from '../services/settings'
import { getGeminiKey } from '../services/geminiKey'
import { ChatBubble } from './ChatBubble'

interface Props {
  visible: boolean
  onClose: () => void
}

const KUYA_AVATAR = require('../assets/images/kuya-baw-logo.png')

// Suggestion strings are unique, so the string itself is a stable list key.
const suggestionKey = (text: string) => text

// Mixed list — mode is auto-detected from the question text, so suggestions are
// not split by tab. Order is intentional: a progress question first, then a
// topic, then math, so users discover all three behaviors organically.
const SUGGESTIONS: string[] = [
  'How am I doing this week?',
  'Ano ang photosynthesis?',
  'Anong dapat kong i-focus today?',
  "Explain Newton's 3rd law",
  'Solve 2x + 6 = 14',
  'What is a topic sentence?',
]

// Grouped intro lines — what Kuya can help with (Iskotify scope).
const INTRO_LINES = [
  'I can talk through your study progress, an exam topic, a math problem, or scholarships.',
  'Tap a suggestion below, or just type your question.',
]

const HELP_TITLE = 'What can Kuya Baw do?'
const HELP_BODY =
  'Kuya Baw is your study coach. Ask about:\n\n' +
  '• Your progress — "How am I doing this week?"\n' +
  '• An exam topic — "Ano ang photosynthesis?"\n' +
  '• A math problem — "Solve 2x + 6 = 14"\n' +
  '• Scholarships, exams and courses\n\n' +
  'Answers come from your on-device coach (or your own free Gemini key). ' +
  'Always double-check important details.'

export function AskKuyaModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      {visible ? <AskKuyaModalInner onClose={onClose} /> : null}
    </Modal>
  )
}

type Styles = ReturnType<typeof makeStyles>

/** One horizontal suggestion chip. Memoized so the row list stays cheap. */
function SuggestionChip({
  text, onPick, styles: s,
}: { text: string; onPick: (text: string) => void; styles: Styles }) {
  const onPress = useCallback(() => onPick(text), [onPick, text])
  return (
    <Pressable
      style={({ pressed }) => [s.suggestChip, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use suggestion: ${text}`}
    >
      <Text style={s.suggestChipText} maxFontSizeMultiplier={1.4}>{text}</Text>
    </Pressable>
  )
}

/** Empty-state intro: mascot avatar + a speech-bubble that greets by first name. */
function KuyaIntro({ firstName, styles: s }: { firstName: string; styles: Styles }) {
  return (
    <View style={s.introRow}>
      <View style={s.avatarRing}>
        <Image source={KUYA_AVATAR} style={s.avatarImg} resizeMode="cover" />
      </View>
      <View style={s.introBubble}>
        <Text style={s.introGreeting} maxFontSizeMultiplier={1.4}>Hi {firstName}!</Text>
        {INTRO_LINES.map(line => (
          <Text key={line} style={s.introLine} maxFontSizeMultiplier={1.4}>{line}</Text>
        ))}
      </View>
    </View>
  )
}

function AskKuyaModalInner({ onClose }: { onClose: () => void }) {
  const { theme: t, typo } = useTheme()
  const db = useDb()
  const { messages, send, abort, clearHistory, isStreaming } = useKuyaChat()
  const [input, setInput] = useState('')
  const [firstName, setFirstName] = useState('there')
  const [cloudOn, setCloudOn] = useState(false)
  const listRef = useRef<FlatList<ChatMessage>>(null)
  const insets = useSafeAreaInsets()

  // Read name + provider state once on open (same idiom as KuyaChatProvider /
  // useKuyaChat: one DB read + one SecureStore read, user-initiated so cheap).
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [settings, geminiKey] = await Promise.all([getSettings(db), getGeminiKey()])
        if (!alive) return
        const first = (settings.fullName ?? '').trim().split(/\s+/)[0]
        setFirstName(first && first.length > 0 ? first : 'there')
        setCloudOn(settings.aiProvider === 'gemini' && geminiKey !== null)
      } catch {
        // Non-fatal — keep defaults (greet "there", cloud off).
      }
    })()
    return () => { alive = false }
  }, [db])

  const onSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    send(text)
    setInput('')
  }, [input, isStreaming, send])

  const onSendOrStop = useCallback(() => {
    if (isStreaming) abort()
    else onSend()
  }, [isStreaming, abort, onSend])

  const onClosePressed = useCallback(() => {
    abort()
    onClose()
  }, [abort, onClose])

  const onSuggestionTap = useCallback((text: string) => {
    setInput(text)
  }, [])

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => <ChatBubble message={item} />,
    [],
  )

  const onClearChat = useCallback(() => { void clearHistory() }, [clearHistory])

  const onHelp = useCallback(() => {
    Alert.alert(HELP_TITLE, HELP_BODY)
  }, [])

  // Cloud AI pill: when off, route to the existing enable-cloud screen
  // (settings/gemini-key) — the same affordance KuyaDownloadSheet uses. When
  // on, the pill is a non-routing status indicator.
  const onCloudPill = useCallback(() => {
    if (cloudOn) return
    onClose()
    router.push('/settings/gemini-key')
  }, [cloudOn, onClose])

  // Auto-scroll to bottom on new message / token batch
  const onContentSizeChange = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true })
  }, [])

  const hasMessages = messages.length > 0
  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  const showSuggestions = input.length === 0 && !isStreaming
  const sendDisabled = input.trim().length === 0 && !isStreaming

  // Intro shown above the (empty) list as a header so it scrolls with content.
  const introHeader = useMemo(
    () => <KuyaIntro firstName={firstName} styles={s} />,
    [firstName, s],
  )

  const renderSuggestion = useCallback(
    ({ item }: { item: string }) => (
      <SuggestionChip text={item} onPick={onSuggestionTap} styles={s} />
    ),
    [onSuggestionTap, s],
  )

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={s.container} behavior="padding">
        {/* ── Header ── */}
        <View style={s.header}>
          <Pressable
            style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}
            onPress={onClosePressed}
            accessibilityRole="button"
            accessibilityLabel="Close chat"
            hitSlop={6}
          >
            <Lineicons icon={ChevronLeftOutlined} size={22} color={t.textPrimary} />
          </Pressable>

          <View style={s.headerTitleWrap}>
            <Text style={s.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>Ask Kuya Baw</Text>
            <Text style={s.headerSubtitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              Exams, courses, scholarships — or how you&apos;re doing
            </Text>
          </View>

          {hasMessages && !isStreaming ? (
            <Pressable
              style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}
              onPress={onClearChat}
              accessibilityRole="button"
              accessibilityLabel="Clear chat history"
              hitSlop={6}
            >
              <Lineicons icon={Trash3Outlined} size={20} color={t.textSecondary} />
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}
            onPress={onHelp}
            accessibilityRole="button"
            accessibilityLabel={HELP_TITLE}
            hitSlop={6}
          >
            <Lineicons icon={QuestionMarkCircleOutlined} size={22} color={t.textSecondary} />
          </Pressable>
        </View>

        {/* ── Messages (intro renders as the list header / empty state) ── */}
        <FlatList
          ref={listRef}
          style={s.list}
          contentContainerStyle={s.listContent}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          onContentSizeChange={onContentSizeChange}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={hasMessages ? null : introHeader}
        />

        {/* ── Suggestions ── */}
        {showSuggestions ? (
          <View style={s.suggestSection}>
            <Text style={s.suggestLabel} maxFontSizeMultiplier={1.4}>Try asking:</Text>
            <FlatList
              horizontal
              data={SUGGESTIONS}
              keyExtractor={suggestionKey}
              renderItem={renderSuggestion}
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.suggestScrollContent}
            />
          </View>
        ) : null}

        {/* ── Input zone ── */}
        <View style={[s.inputZone, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about exams, courses, or scholarships…"
              placeholderTextColor={t.textTertiary}
              multiline
              returnKeyType="send"
              onSubmitEditing={onSend}
              editable={!isStreaming}
              maxFontSizeMultiplier={1.4}
              accessibilityLabel="Question input"
            />
            <Pressable
              style={[s.sendBtn, sendDisabled && s.sendBtnDisabled]}
              onPress={onSendOrStop}
              disabled={sendDisabled}
              accessibilityRole="button"
              accessibilityLabel={isStreaming ? 'Stop generating' : 'Send question'}
            >
              <Lineicons icon={ArrowUpwardOutlined} size={22} color={t.textInverse} />
            </Pressable>
          </View>

          {/* Provider / unlock pill */}
          <View style={s.pillRow}>
            <Pressable
              style={({ pressed }) => [s.pill, cloudOn ? s.pillOn : s.pillOff, pressed && !cloudOn && { opacity: 0.7 }]}
              onPress={onCloudPill}
              disabled={cloudOn}
              accessibilityRole="button"
              accessibilityLabel={cloudOn ? 'Cloud AI is on' : 'Unlock Cloud AI'}
            >
              <Lineicons
                icon={cloudOn ? CloudCheckCircleOutlined : Locked1Outlined}
                size={14}
                color={cloudOn ? t.success : t.textSecondary}
              />
              <Text style={cloudOn ? s.pillTextOn : s.pillTextOff} maxFontSizeMultiplier={1.3}>
                {cloudOn ? 'Cloud AI on' : 'Unlock Cloud AI'}
              </Text>
            </Pressable>
          </View>

          {/* Footer microcopy */}
          <View style={s.footer}>
            <Text style={s.footerText} maxFontSizeMultiplier={1.4}>
              Kuya Baw can make mistakes — double-check important details.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function makeStyles(t: Theme, typo: Typography) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: t.bg },
    container: { flex: 1, backgroundColor: t.bg },

    // ── Header ────────────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    // Rounded-square tile matching the Home header tiles.
    tile: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: { flex: 1, justifyContent: 'center' },
    headerTitle: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.md,
      color: t.textPrimary,
      letterSpacing: -0.2,
    },
    headerSubtitle: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: t.textTertiary,
      marginTop: 1,
    },

    // ── List ──────────────────────────────────────────────────────────────
    list: { flex: 1, paddingHorizontal: spacing.md },
    listContent: { paddingVertical: spacing.md, flexGrow: 1 },

    // ── Intro / empty state ────────────────────────────────────────────────
    introRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    avatarRing: {
      width: 60,
      height: 60,
      borderRadius: radius.pill,
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.border,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImg: { width: 60, height: 60 },
    introBubble: {
      flex: 1,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.xl,
      borderCurve: 'continuous',
      borderTopLeftRadius: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    introGreeting: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.base,
      color: t.textPrimary,
    },
    introLine: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      lineHeight: typo.sm * 1.5,
      color: t.textSecondary,
    },

    // ── Suggestions ────────────────────────────────────────────────────────
    suggestSection: { paddingTop: spacing.md, paddingBottom: spacing.sm },
    suggestLabel: {
      fontFamily: 'Lexend_500Medium',
      fontSize: typo.xs,
      color: t.textTertiary,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    suggestScrollContent: {
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
      flexDirection: 'row',
    },
    suggestChip: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      alignSelf: 'flex-start',
      minHeight: 36,
      justifyContent: 'center',
    },
    suggestChipText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: t.textSecondary,
    },

    // ── Input cluster ──────────────────────────────────────────────────────
    inputZone: {
      borderTopWidth: 1,
      borderTopColor: t.border,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.xl,
      borderCurve: 'continuous',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textPrimary,
      maxHeight: 120,
      minHeight: 48,
    },
    sendBtn: {
      backgroundColor: t.accentStrong,
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: t.border },

    // Provider pill row (under the input)
    pillRow: { flexDirection: 'row', alignItems: 'center' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      minHeight: 32,
    },
    pillOff: { backgroundColor: t.surface, borderColor: t.border },
    pillOn: { backgroundColor: t.successSurface, borderColor: t.success },
    pillTextOff: {
      fontFamily: 'Lexend_500Medium',
      fontSize: typo.xs,
      color: t.textSecondary,
    },
    pillTextOn: {
      fontFamily: 'Lexend_600SemiBold',
      fontSize: typo.xs,
      color: t.success,
    },

    // ── Footer microcopy ───────────────────────────────────────────────────
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    footerText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: t.textTertiary,
      textAlign: 'center',
    },
  })
}
