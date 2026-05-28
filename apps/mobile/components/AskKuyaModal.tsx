import { useCallback, useMemo, useRef, useState } from 'react'
import {
  FlatList, Image, Modal,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'
import { useKuyaChat, type ChatMessage } from '../hooks/useKuyaChat'
import { ChatBubble } from './ChatBubble'

interface Props {
  visible: boolean
  onClose: () => void
}

// Mixed list — mode is now auto-detected from the question text, so suggestions
// no longer split by tab. Order is intentional: a progress question first, then
// a topic, then math, so users discover all three behaviors organically.
const SUGGESTIONS: string[] = [
  'How am I doing this week?',
  'Ano ang photosynthesis?',
  'Anong dapat kong i-focus today?',
  "Explain Newton's 3rd law",
  'Solve 2x + 6 = 14',
  'What is a topic sentence?',
]

export function AskKuyaModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      {visible && <AskKuyaModalInner onClose={onClose} />}
    </Modal>
  )
}

function AskKuyaModalInner({ onClose }: { onClose: () => void }) {
  const { theme: t, typo } = useTheme()
  const { messages, send, abort, clearHistory, isStreaming } = useKuyaChat()
  const [input, setInput] = useState('')
  const listRef = useRef<FlatList<ChatMessage>>(null)
  const insets = useSafeAreaInsets()

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

  // Auto-scroll to bottom on new message / token batch
  const onContentSizeChange = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true })
  }, [])

  const s = useMemo(() => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: t.bg },
    container: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    headerAvatar: { width: 32, height: 32, marginRight: 10 },
    headerTitle: {
      flex: 1,
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.md,
      color: t.textPrimary,
    },
    closeBtn: { padding: 6 },
    closeBtnText: { fontSize: 20, color: t.textSecondary },
    clearBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginRight: 4,
    },
    clearBtnText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: t.textSecondary,
    },
    list: { flex: 1, paddingHorizontal: 12 },
    listContent: { paddingVertical: 12 },
    emptyState: {
      paddingHorizontal: 24,
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyMascot: { width: 72, height: 72, marginBottom: 12 },
    emptyText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textSecondary,
      textAlign: 'center',
      marginBottom: 20,
    },
    suggestSection: { paddingTop: 6, paddingBottom: 8 },
    suggestLabel: {
      fontFamily: 'Lexend_500Medium',
      fontSize: 11,
      color: t.textTertiary,
      marginBottom: 6,
      paddingHorizontal: 16,
    },
    suggestScrollContent: {
      paddingHorizontal: 16,
      gap: 8,
      flexDirection: 'row',
    },
    suggestChip: {
      backgroundColor: t.surfaceSubtle,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
    suggestChipText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: t.textSecondary,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: t.border,
      gap: 8,
    },
    input: {
      flex: 1,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textPrimary,
      maxHeight: 100,
    },
    sendBtn: {
      backgroundColor: t.accent,
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: t.border },
    sendBtnText: { color: '#fff', fontSize: 20, fontFamily: 'Outfit_700Bold' },
  }), [t, typo])

  const showSuggestions = input.length === 0 && !isStreaming
  const sendDisabled = input.trim().length === 0 && !isStreaming

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.container}
        behavior="padding"
      >
      {/* Header */}
      <View style={s.header}>
        <Image
          source={require('../assets/images/kuya-baw-mascot.png')}
          style={s.headerAvatar}
          resizeMode="contain"
        />
        <Text style={s.headerTitle}>Kuya Baw</Text>
        {messages.length > 0 && !isStreaming && (
          <TouchableOpacity
            style={s.clearBtn}
            onPress={clearHistory}
            accessibilityRole="button"
            accessibilityLabel="Clear chat history"
          >
            <Text style={s.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={s.closeBtn}
          onPress={onClosePressed}
          accessibilityRole="button"
          accessibilityLabel="Close chat"
        >
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        style={s.list}
        contentContainerStyle={s.listContent}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        onContentSizeChange={onContentSizeChange}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Image
              source={require('../assets/images/kuya-baw-mascot.png')}
              style={s.emptyMascot}
              resizeMode="contain"
            />
            <Text style={s.emptyText}>
              Hi! Ask me anything — your study progress, an exam topic, or a math problem.
            </Text>
          </View>
        }
      />

      {/* Suggestions */}
      {showSuggestions && (
        <View style={s.suggestSection}>
          <Text style={s.suggestLabel}>💡 Try asking:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.suggestScrollContent}
          >
            {SUGGESTIONS.map(text => (
              <Pressable
                key={text}
                style={s.suggestChip}
                onPress={() => onSuggestionTap(text)}
                accessibilityRole="button"
                accessibilityLabel={`Use suggestion: ${text}`}
              >
                <Text style={s.suggestChipText}>{text}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input */}
      <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Tanong mo kay Kuya..."
          placeholderTextColor={t.textTertiary}
          multiline
          returnKeyType="send"
          onSubmitEditing={onSend}
          editable={!isStreaming}
          accessibilityLabel="Question input"
        />
        <Pressable
          style={[s.sendBtn, sendDisabled && s.sendBtnDisabled]}
          onPress={onSendOrStop}
          disabled={sendDisabled}
          accessibilityRole="button"
          accessibilityLabel={isStreaming ? 'Stop generating' : 'Send question'}
        >
          <Text style={s.sendBtnText}>{isStreaming ? '■' : '→'}</Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
