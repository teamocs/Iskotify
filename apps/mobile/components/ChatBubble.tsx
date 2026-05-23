import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeContext'
import type { ChatMessage } from '../hooks/useKuyaChat'

interface Props {
  message: ChatMessage
}

export function ChatBubble({ message }: Props) {
  const { theme: t, typo } = useTheme()
  const isUser = message.role === 'user'

  const s = useMemo(() => StyleSheet.create({
    container: { marginVertical: 6 },
    labelRow: { paddingHorizontal: 4, marginBottom: 2 },
    labelRowUser: { alignItems: 'flex-end' },
    labelRowAssistant: { alignItems: 'flex-start' },
    label: {
      fontFamily: 'Lexend_500Medium',
      fontSize: 11,
      color: t.textTertiary,
    },
    row: { flexDirection: 'row' },
    rowUser: { justifyContent: 'flex-end' },
    rowAssistant: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '82%', padding: 12, borderRadius: 14 },
    bubbleUser: {
      backgroundColor: t.accent,
      borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
      backgroundColor: t.surface,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: t.border,
    },
    text: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      lineHeight: 20,
    },
    textUser: { color: '#fff' },
    textAssistant: { color: t.textPrimary },
    cursor: { color: t.textSecondary },
    error: {
      color: '#ef4444',
      marginTop: 4,
      fontSize: typo.xs,
      fontFamily: 'Lexend_400Regular',
    },
  }), [t, typo])

  const timeStr = new Date(message.timestamp).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <View style={s.container}>
      <View style={[s.labelRow, isUser ? s.labelRowUser : s.labelRowAssistant]}>
        <Text style={s.label}>{isUser ? `you · ${timeStr}` : `Kuya Baw · ${timeStr}`}</Text>
      </View>
      <View style={[s.row, isUser ? s.rowUser : s.rowAssistant]}>
        <View
          style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAssistant]}
          accessibilityRole="text"
          accessibilityLiveRegion={message.isStreaming ? 'polite' : 'none'}
        >
          <Text style={[s.text, isUser ? s.textUser : s.textAssistant]}>
            {message.text}
            {message.isStreaming && <Text style={s.cursor}>▍</Text>}
          </Text>
          {message.error && <Text style={s.error}>{message.error}</Text>}
        </View>
      </View>
    </View>
  )
}
