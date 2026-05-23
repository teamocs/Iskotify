import { useMemo, useState } from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useDb } from '../hooks/useDb'
import { useModelDownload } from '../hooks/useModelDownload'
import { runEnhancement } from '../hooks/useAiEnhancement'
import { useTheme } from '../theme/ThemeContext'

const MODEL_SIZE_LABEL = '~950 MB'

export function AiModelBanner() {
  const { theme: t, typo } = useTheme()
  const db = useDb()
  const { modelStatus, progress, startDownload } = useModelDownload(
    () => { void runEnhancement(db).catch(e => console.warn('[AiModelBanner] enhance:', e)) }
  )
  const [showSheet, setShowSheet] = useState(false)

  const s = useMemo(() => StyleSheet.create({
    banner: {
      backgroundColor: 'rgba(128,0,0,0.10)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(128,0,0,0.20)',
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    bannerText: {
      flex: 1,
      fontSize: typo.xs,
      color: '#fca5a5',
      fontFamily: 'Lexend_500Medium',
    },
    bannerChevron: {
      color: '#fca5a5',
      fontSize: 16,
    },
    progressTrack: {
      height: 3,
      backgroundColor: 'rgba(128,0,0,0.15)',
      marginBottom: 2,
    },
    progressFill: {
      height: 3,
      backgroundColor: '#fca5a5',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalDismissOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    sheet: {
      backgroundColor: t.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    sheetTitle: {
      fontSize: typo.lg,
      fontFamily: 'Outfit_700Bold',
      color: t.textPrimary,
      marginBottom: 8,
    },
    sheetLine: {
      fontSize: typo.sm,
      fontFamily: 'Lexend_400Regular',
      color: t.textSecondary,
      marginBottom: 4,
    },
    sheetMeta: {
      fontSize: typo.sm,
      fontFamily: 'Lexend_400Regular',
      color: t.textTertiary,
      marginBottom: 24,
    },
    downloadBtn: {
      backgroundColor: 'rgba(128,0,0,0.82)',
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 10,
    },
    downloadBtnText: {
      color: '#fff',
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.md,
    },
    dismissBtn: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    dismissBtnText: {
      color: t.textTertiary,
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
    },
  }), [t, typo])

  return (
    <>
      {modelStatus === 'absent' && (
        <TouchableOpacity
          style={s.banner}
          onPress={() => setShowSheet(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Enable AI-enhanced practice"
          accessibilityHint={`Opens download prompt for the AI reviewer engine, ${MODEL_SIZE_LABEL}`}
        >
          <Text style={s.bannerText}>
            ✨ Enable AI-enhanced practice — Download Reviewer Engine ({MODEL_SIZE_LABEL})
          </Text>
          <Text style={s.bannerChevron}>›</Text>
        </TouchableOpacity>
      )}

      {modelStatus === 'downloading' && (
        <View
          style={s.progressTrack}
          accessibilityRole="progressbar"
          accessibilityLabel="AI reviewer download progress"
          accessibilityValue={{ now: Math.round(progress * 100), min: 0, max: 100 }}
        >
          <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}

      <Modal
        visible={showSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSheet(false)}
      >
        <View style={s.modalBackdrop}>
          <TouchableOpacity
            style={s.modalDismissOverlay}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Dismiss download prompt"
            onPress={() => setShowSheet(false)}
          />
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>AI Reviewer Engine</Text>
            <Text style={s.sheetLine}>Model: Qwen 2.5 1.5B Instruct (Q4_K_M)</Text>
            <Text style={s.sheetLine}>Download size: {MODEL_SIZE_LABEL}</Text>
            <Text style={s.sheetMeta}>Requires ≥ 2 GB RAM · Downloads in background</Text>
            <TouchableOpacity
              style={s.downloadBtn}
              onPress={() => { setShowSheet(false); startDownload() }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Download AI reviewer engine"
            >
              <Text style={s.downloadBtnText}>Download</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.dismissBtn}
              onPress={() => setShowSheet(false)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss download prompt"
            >
              <Text style={s.dismissBtnText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}
