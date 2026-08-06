import { View, Text, Modal, Pressable, StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { SparkOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../theme/ThemeContext'
import { useModelDownload } from '../hooks/useModelDownload'
import { MODEL_SIZE_LABEL, MODEL_SIZE_BYTES } from '../services/llm'

const MB = 1024 * 1024

interface Props {
  visible: boolean
  onClose: () => void
  /** Called immediately after the model status flips to 'ready' */
  onReady: () => void
}

/**
 * Bottom-sheet for downloading the on-device AI model that powers AI-enhanced
 * flashcards (useAiEnhancement) and the offline tier of listing search.
 * Handles the full lifecycle: absent → downloading (progress bar) → ready
 * (auto-close), unsupported (device can't run the model — no download button).
 */
export function AiModelDownloadSheet({ visible, onClose, onReady }: Props) {
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
  const mbTotal = bytesTotal > 0 ? (bytesTotal / MB).toFixed(0) : String(Math.round(MODEL_SIZE_BYTES / 1e6))

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
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: t.accentSurface,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 16,
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

          <View style={s.iconWrap}>
            <Lineicons icon={SparkOutlined} size={24} color={t.accentText} />
          </View>

          {/* Web: the on-device model only runs on the native app — no download path here. */}
          {Platform.OS === 'web' ? (
            <>
              <Text style={s.title}>AI features run on the mobile app</Text>
              <Text style={s.body}>
                The on-device AI model that powers AI-enhanced flashcards and smarter
                offline search only runs on the Iskotify mobile app.
              </Text>
              <View style={s.btnRow}>
                <Pressable
                  style={({ pressed }) => [s.btnSecondary, pressed && { opacity: 0.7 }]}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Text style={s.btnSecondaryText}>Close</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={s.title}>Download the on-device AI model</Text>

              {isUnsupported ? (
                <Text style={s.body}>
                  This device doesn't have enough memory to run the on-device AI model.
                </Text>
              ) : (
                <Text style={s.body}>
                  {`One-time download (${MODEL_SIZE_LABEL}). Powers AI-enhanced flashcards and smarter offline search. Wi-Fi strongly recommended.`}
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
                {!isUnsupported && (
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

                <Pressable
                  style={({ pressed }) => [s.btnSecondary, pressed && { opacity: 0.7 }]}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={s.btnSecondaryText}>
                    {isDownloading ? 'Continue in background' : isUnsupported ? 'Close' : 'Cancel'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}
