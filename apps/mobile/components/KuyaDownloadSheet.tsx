// RN Image is fine for a bundled asset; expo-image is a native module that would break OTA.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { View, Text, Image, Modal, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'
import { useModelDownload } from '../hooks/useModelDownload'
import { MODEL_SIZE_LABEL } from '../services/llm'

const MB = 1024 * 1024

interface Props {
  visible: boolean
  onClose: () => void
  /** Called immediately after the model status flips to 'ready' */
  onReady: () => void
}

/**
 * Bottom-sheet shown when the user taps Kuya Baw but the model is not yet
 * downloaded. Handles the full lifecycle: absent → downloading (progress bar)
 * → ready (auto-close + open chat), unsupported (no download button).
 */
export function KuyaDownloadSheet({ visible, onClose, onReady }: Props) {
  // Pass onReady as the onDownloadComplete callback so the hook fires it
  // the moment the native download task signals done (status flips to 'ready').
  const { modelStatus, progress, bytesDownloaded, bytesTotal, startDownload, lastError } =
    useModelDownload(() => {
      onClose()
      onReady()
    })

  const { theme: t, typo } = useTheme()
  const insets = useSafeAreaInsets()

  const percent = Math.round(progress * 100)
  const mbDownloaded = (bytesDownloaded / MB).toFixed(0)
  const mbTotal = bytesTotal > 0 ? (bytesTotal / MB).toFixed(0) : '~3303'

  const isDownloading = modelStatus === 'downloading'
  const isUnsupported = modelStatus === 'unsupported'
  const hasError = lastError !== null && !isDownloading

  const s = StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    dismissArea: { flex: 1 },
    sheet: {
      backgroundColor: t.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 12,
      paddingHorizontal: 20,
      paddingBottom: Math.max(insets.bottom + 16, 32),
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: t.divider,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 20,
    },
    mascot: {
      width: 72,
      height: 72,
      alignSelf: 'center',
      marginBottom: 12,
    },
    title: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.lg,
      color: t.textPrimary,
      textAlign: 'center',
      marginBottom: 8,
    },
    body: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textSecondary,
      textAlign: 'center',
      marginBottom: 20,
      lineHeight: 20,
    },
    errorText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: '#f87171',
      textAlign: 'center',
      marginBottom: 12,
    },
    progressWrap: {
      marginBottom: 8,
    },
    progressTrack: {
      height: 8,
      backgroundColor: t.surfaceSubtle,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: {
      height: 8,
      backgroundColor: t.accent,
      borderRadius: 4,
    },
    progressLabel: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: t.textTertiary,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 16,
    },
    btnRow: {
      gap: 10,
    },
    btnPrimary: {
      backgroundColor: t.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    btnPrimaryText: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.base,
      color: '#ffffff',
    },
    btnSecondary: {
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
    },
    btnSecondaryText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: t.textSecondary,
    },
    btnGemini: {
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(128,0,0,0.25)',
      backgroundColor: t.accentSurface,
    },
    btnGeminiText: {
      fontFamily: 'Lexend_600SemiBold',
      fontSize: typo.sm,
      color: t.accentText,
    },
  })

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        {/* Tapping outside the sheet dismisses it (download keeps running) */}
        <Pressable style={s.dismissArea} onPress={onClose} accessibilityLabel="Dismiss" />

        <View style={s.sheet}>
          <View style={s.handle} />

          <Image
            source={require('../assets/images/kuya-baw-mascot.png')}
            style={s.mascot}
            resizeMode="contain"
          />

          <Text style={s.title}>Kuya Baw needs to download his brain 🧠</Text>

          {isUnsupported ? (
            <Text style={s.body}>
              {`This phone can't run Kuya's on-device brain — use a free Gemini key instead.`}
            </Text>
          ) : (
            <Text style={s.body}>
              {`One-time download (${MODEL_SIZE_LABEL}). Wi-Fi strongly recommended.`}
            </Text>
          )}

          {hasError ? (
            <Text style={s.errorText}>
              {lastError?.message ?? 'Download failed. Please try again.'}
            </Text>
          ) : null}

          {isDownloading ? (
            <View style={s.progressWrap}>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${percent}%` }]} />
              </View>
              <Text style={s.progressLabel}>
                {percent}% — {mbDownloaded} / {mbTotal} MB
              </Text>
            </View>
          ) : null}

          <View style={s.btnRow}>
            {isUnsupported ? (
              <Pressable
                style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.82 }]}
                onPress={() => {
                  onClose()
                  router.push('/settings/gemini-key')
                }}
                accessibilityRole="button"
                accessibilityLabel="Use your own Gemini key"
              >
                <Text style={s.btnPrimaryText}>
                  Use a free Gemini key instead
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.82 }]}
                onPress={isDownloading ? undefined : startDownload}
                disabled={isDownloading}
                accessibilityRole="button"
                accessibilityLabel={isDownloading ? 'Downloading…' : hasError ? 'Retry download' : 'Download'}
              >
                <Text style={s.btnPrimaryText}>
                  {isDownloading ? 'Downloading…' : hasError ? 'Retry' : 'Download'}
                </Text>
              </Pressable>
            )}

            {isUnsupported ? null : (
              <Pressable
                style={({ pressed }) => [s.btnGemini, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  onClose()
                  router.push('/settings/gemini-key')
                }}
                accessibilityRole="button"
                accessibilityLabel="Use your own Gemini key instead"
              >
                <Text style={s.btnGeminiText}>
                  Use your own Gemini key instead (free)
                </Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [s.btnSecondary, pressed && { opacity: 0.7 }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={s.btnSecondaryText}>
                {isDownloading ? 'Continue in background' : 'Cancel'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
