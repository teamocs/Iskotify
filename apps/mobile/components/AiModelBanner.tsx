import { useMemo, useState } from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useDb } from '../hooks/useDb'
import { useModelDownload } from '../hooks/useModelDownload'
import { runEnhancement } from '../hooks/useAiEnhancement'
import { useTheme } from '../theme/ThemeContext'

const MODEL_SIZE_LABEL = '~950 MB'

function formatMB(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(0)} MB`
}

export function AiModelBanner() {
  const { theme: t, typo } = useTheme()
  const db = useDb()
  const { modelStatus, progress, bytesDownloaded, bytesTotal, startDownload } = useModelDownload(
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
    downloadingBanner: {
      backgroundColor: 'rgba(128,0,0,0.10)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(128,0,0,0.20)',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 0,
    },
    downloadingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    downloadingTitle: {
      fontSize: typo.xs,
      color: '#fca5a5',
      fontFamily: 'Lexend_500Medium',
    },
    downloadingPct: {
      fontSize: typo.xs,
      color: '#fca5a5',
      fontFamily: 'Outfit_600SemiBold',
    },
    downloadingBytes: {
      fontSize: 11,
      color: 'rgba(252,165,165,0.75)',
      fontFamily: 'Lexend_400Regular',
      marginBottom: 8,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(128,0,0,0.20)',
      overflow: 'hidden',
      marginBottom: 10,
    },
    progressFill: {
      height: 6,
      backgroundColor: '#fca5a5',
      borderRadius: 3,
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

  const pct = Math.round(progress * 100)

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
          style={s.downloadingBanner}
          accessibilityRole="progressbar"
          accessibilityLabel="AI reviewer download progress"
          accessibilityValue={{ now: pct, min: 0, max: 100 }}
        >
          <View style={s.downloadingHeader}>
            <Text style={s.downloadingTitle}>Downloading AI Reviewer Engine…</Text>
            <Text style={s.downloadingPct}>{pct}%</Text>
          </View>
          <Text style={s.downloadingBytes}>
            {formatMB(bytesDownloaded)} of {bytesTotal > 0 ? formatMB(bytesTotal) : MODEL_SIZE_LABEL} · keeps going in background
          </Text>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%` }]} />
          </View>
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
