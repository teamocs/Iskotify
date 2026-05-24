import { useMemo } from 'react'
import { StyleSheet, View, Text, Modal, Pressable } from 'react-native'
import { useTheme } from '../theme/ThemeContext'

interface Props {
  visible: boolean
  timeRemainingSecs: number
  onResume: () => void
  onEnd: () => void
}

function formatMinutes(secs: number): string {
  const minutes = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (minutes <= 0) return `${remSecs} sec`
  return `${minutes} min ${remSecs > 0 ? `${remSecs} sec` : ''}`.trim()
}

export function SessionPausedOverlay({ visible, timeRemainingSecs, onResume, onEnd }: Props) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: t.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    icon: { fontSize: 64, marginBottom: 20 },
    title: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.h2,
      color: t.textPrimary,
      marginBottom: 8,
    },
    sub: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.md,
      color: t.textSecondary,
      marginBottom: 36,
      textAlign: 'center',
    },
    resumeBtn: {
      backgroundColor: 'rgba(128,0,0,0.85)',
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 40,
      width: '100%',
      alignItems: 'center',
      marginBottom: 12,
    },
    resumeBtnTxt: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.md,
      color: '#fff',
    },
    endBtn: {
      paddingVertical: 12,
      width: '100%',
      alignItems: 'center',
    },
    endBtnTxt: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textSecondary,
    },
  }), [t, typo])

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => { /* swallow back */ }}>
      <View style={s.backdrop}>
        <Text style={s.icon}>⏸</Text>
        <Text style={s.title}>Session Paused</Text>
        <Text style={s.sub}>Time remaining: {formatMinutes(timeRemainingSecs)}</Text>
        <Pressable
          style={s.resumeBtn}
          onPress={onResume}
          accessibilityRole="button"
          accessibilityLabel="Resume session"
        >
          <Text style={s.resumeBtnTxt}>Resume Session</Text>
        </Pressable>
        <Pressable
          style={s.endBtn}
          onPress={onEnd}
          accessibilityRole="button"
          accessibilityLabel="End session"
        >
          <Text style={s.endBtnTxt}>End Session</Text>
        </Pressable>
      </View>
    </Modal>
  )
}
