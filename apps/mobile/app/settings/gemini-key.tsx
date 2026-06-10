import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { getGeminiKey, setGeminiKey, clearGeminiKey } from '../../services/geminiKey'
import { validateGeminiKey } from '../../services/geminiClient'
import { updateSettings } from '../../services/settings'
import { useDb } from '../../hooks/useDb'

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey'

type ScreenState = 'loading' | 'empty' | 'has-key' | 'entering'

export default function GeminiKeyScreen() {
  const { theme: t, typo } = useTheme()
  const db = useDb()

  const [screenState, setScreenState] = useState<ScreenState>('loading')
  const [maskedKey, setMaskedKey] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [successShown, setSuccessShown] = useState(false)

  // Load existing key on mount
  useEffect(() => {
    void (async () => {
      const existing = await getGeminiKey()
      if (existing && existing.length > 0) {
        const last4 = existing.slice(-4)
        setMaskedKey(`••••••••${last4}`)
        setScreenState('has-key')
      } else {
        setScreenState('empty')
      }
    })()
  }, [])

  const handleOpenAIStudio = useCallback(() => {
    void Linking.openURL(AI_STUDIO_URL)
  }, [])

  const handleSave = useCallback(async () => {
    const key = inputValue.trim()
    if (!key) {
      setSaveError('Please paste your API key before saving.')
      return
    }
    setSaveError(null)
    setIsSaving(true)
    try {
      const result = await validateGeminiKey(key)
      if (!result.ok) {
        setSaveError(result.message)
        return
      }
      await setGeminiKey(key)
      await updateSettings(db, { aiProvider: 'gemini' })
      setSuccessShown(true)
    } catch {
      setSaveError("Something went wrong — please try again.")
    } finally {
      setIsSaving(false)
    }
  }, [inputValue, db])

  const handleReplace = useCallback(() => {
    setInputValue('')
    setSaveError(null)
    setSuccessShown(false)
    setScreenState('entering')
  }, [])

  const handleRemove = useCallback(() => {
    Alert.alert(
      'Remove Gemini Key',
      'Kuya Baw will switch back to the on-device model. Your key will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await clearGeminiKey()
              await updateSettings(db, { aiProvider: 'local' })
              setMaskedKey('')
              setScreenState('empty')
            })()
          },
        },
      ]
    )
  }, [db])

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    backRow: {
      flexDirection: 'row' as const,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xs,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    pageTitle: {
      fontSize: typo.h2,
      fontWeight: '700' as const,
      color: t.textPrimary,
      letterSpacing: -0.3,
      fontFamily: 'Outfit_700Bold',
      marginBottom: spacing.sm,
    },
    pageSub: {
      fontSize: typo.sm,
      color: t.textSecondary,
      fontFamily: 'Lexend_400Regular',
      lineHeight: typo.sm * 1.6,
      marginBottom: spacing.xl,
    },
    guideCard: { marginBottom: spacing.lg },
    guideTitle: {
      fontSize: typo.base,
      fontWeight: '700' as const,
      color: t.textPrimary,
      fontFamily: 'Outfit_700Bold',
      marginBottom: spacing.md,
    },
    stepRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    stepNum: {
      width: 26,
      height: 26,
      borderRadius: radius.sm,
      backgroundColor: t.accentSurface,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderCurve: 'continuous' as const,
      flexShrink: 0,
    },
    stepNumText: {
      fontSize: typo.xs,
      fontWeight: '700' as const,
      color: t.accentText,
      fontFamily: 'Outfit_700Bold',
    },
    stepText: {
      flex: 1,
      fontSize: typo.sm,
      color: t.textSecondary,
      fontFamily: 'Lexend_400Regular',
      lineHeight: typo.sm * 1.55,
      paddingTop: 4,
    },
    stepBold: { fontFamily: 'Lexend_600SemiBold', color: t.textPrimary },
    freeNote: {
      fontSize: typo.xs,
      color: t.textTertiary,
      fontFamily: 'Lexend_400Regular',
      lineHeight: typo.xs * 1.5,
      marginTop: spacing.xs,
    },
    openBtn: {
      backgroundColor: t.accent,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center' as const,
      marginBottom: spacing.lg,
      borderCurve: 'continuous' as const,
      minHeight: 48,
      justifyContent: 'center' as const,
    },
    openBtnText: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.base,
      color: '#ffffff',
    },
    inputLabel: {
      fontSize: typo.sm,
      fontWeight: '600' as const,
      color: t.textPrimary,
      fontFamily: 'Lexend_600SemiBold',
      marginBottom: spacing.sm,
    },
    input: {
      backgroundColor: t.surfaceSubtle,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: typo.sm,
      color: t.textPrimary,
      fontFamily: 'Lexend_400Regular',
      minHeight: 48,
      borderCurve: 'continuous' as const,
      marginBottom: spacing.sm,
    },
    errorText: {
      fontSize: typo.xs,
      color: '#f87171',
      fontFamily: 'Lexend_400Regular',
      marginBottom: spacing.md,
      lineHeight: typo.xs * 1.5,
    },
    saveBtn: {
      backgroundColor: t.accent,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center' as const,
      minHeight: 48,
      justifyContent: 'center' as const,
      borderCurve: 'continuous' as const,
    },
    saveBtnText: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.base,
      color: '#ffffff',
    },
    successCard: { marginBottom: spacing.lg },
    successTitle: {
      fontSize: typo.base,
      fontWeight: '700' as const,
      color: '#4ade80',
      fontFamily: 'Outfit_700Bold',
      marginBottom: spacing.xs,
    },
    successBody: {
      fontSize: typo.sm,
      color: t.textSecondary,
      fontFamily: 'Lexend_400Regular',
      lineHeight: typo.sm * 1.6,
    },
    doneBtn: {
      backgroundColor: t.accent,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center' as const,
      marginTop: spacing.md,
      minHeight: 48,
      justifyContent: 'center' as const,
      borderCurve: 'continuous' as const,
    },
    doneBtnText: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.base,
      color: '#ffffff',
    },
    existingCard: { marginBottom: spacing.lg },
    existingLabel: {
      fontSize: typo.xs,
      color: t.textTertiary,
      fontFamily: 'Lexend_400Regular',
      marginBottom: spacing.xs,
    },
    existingKey: {
      fontSize: typo.base,
      color: t.textPrimary,
      fontFamily: 'Lexend_600SemiBold',
      marginBottom: spacing.xs,
    },
    providerStatus: {
      fontSize: typo.xs,
      color: '#4ade80',
      fontFamily: 'Lexend_400Regular',
    },
    actionRow: {
      flexDirection: 'row' as const,
      gap: spacing.md,
      marginTop: spacing.md,
    },
    replaceBtn: {
      flex: 1,
      backgroundColor: t.accentSurface,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: 'rgba(128,0,0,0.25)',
      minHeight: 44,
      justifyContent: 'center' as const,
      borderCurve: 'continuous' as const,
    },
    replaceBtnText: {
      fontFamily: 'Lexend_600SemiBold',
      fontSize: typo.sm,
      color: t.accentText,
    },
    removeBtn: {
      flex: 1,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.30)',
      backgroundColor: 'rgba(239,68,68,0.07)',
      minHeight: 44,
      justifyContent: 'center' as const,
      borderCurve: 'continuous' as const,
    },
    removeBtnText: {
      fontFamily: 'Lexend_600SemiBold',
      fontSize: typo.sm,
      color: '#f87171',
    },
  }), [t, typo])

  // Numbered guide steps content
  const GuideSteps = useMemo(() => (
    <Card elevated style={s.guideCard}>
      <Text style={s.guideTitle}>How to get your free key</Text>
      <View style={s.stepRow}>
        <View style={s.stepNum}><Text style={s.stepNumText}>1</Text></View>
        <Text style={s.stepText} maxFontSizeMultiplier={1.4}>
          Tap the button below to open{' '}
          <Text style={s.stepBold}>Google AI Studio</Text>.
        </Text>
      </View>
      <View style={s.stepRow}>
        <View style={s.stepNum}><Text style={s.stepNumText}>2</Text></View>
        <Text style={s.stepText} maxFontSizeMultiplier={1.4}>
          Sign in with your{' '}
          <Text style={s.stepBold}>Google account</Text>.
        </Text>
      </View>
      <View style={s.stepRow}>
        <View style={s.stepNum}><Text style={s.stepNumText}>3</Text></View>
        <Text style={s.stepText} maxFontSizeMultiplier={1.4}>
          Tap{' '}
          <Text style={s.stepBold}>"Create API key"</Text>.
        </Text>
      </View>
      <View style={[s.stepRow, { marginBottom: 0 }]}>
        <View style={s.stepNum}><Text style={s.stepNumText}>4</Text></View>
        <Text style={s.stepText} maxFontSizeMultiplier={1.4}>
          Copy the key, come back, and paste it below.
        </Text>
      </View>
      <Text style={s.freeNote} maxFontSizeMultiplier={1.4}>
        Creating a key is free — Google includes a free daily allowance, enough for everyday studying.
      </Text>
    </Card>
  ), [s])

  if (screenState === 'loading') {
    return (
      <SafeAreaView style={s.root}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.backRow}>
        <Pressable
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
      </View>

      <ScreenScroll tabBarInset={false} padded>
        <Text style={s.pageTitle}>Use your own Gemini key</Text>
        <Text style={s.pageSub}>
          Kuya Baw can use Google's Gemini in the cloud — free to set up with your own key.
        </Text>

        {screenState === 'has-key' && !successShown ? (
          <>
            <Card elevated style={s.existingCard}>
              <Text style={s.existingLabel}>Current key</Text>
              <Text style={s.existingKey} maxFontSizeMultiplier={1.4}>{maskedKey}</Text>
              <Text style={s.providerStatus}>Gemini is active for Kuya Baw</Text>
              <View style={s.actionRow}>
                <Pressable
                  style={({ pressed }) => [s.replaceBtn, pressed && { opacity: 0.7 }]}
                  onPress={handleReplace}
                  accessibilityRole="button"
                  accessibilityLabel="Replace key"
                >
                  <Text style={s.replaceBtnText} maxFontSizeMultiplier={1.4}>Replace key</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.7 }]}
                  onPress={handleRemove}
                  accessibilityRole="button"
                  accessibilityLabel="Remove key"
                >
                  <Text style={s.removeBtnText} maxFontSizeMultiplier={1.4}>Remove key</Text>
                </Pressable>
              </View>
            </Card>
            {GuideSteps}
          </>
        ) : null}

        {successShown ? (
          <Card elevated style={s.successCard}>
            <Text style={s.successTitle}>You're all set!</Text>
            <Text style={s.successBody}>
              Kuya Baw will now answer using Gemini. You can change this any time from Settings.
            </Text>
            <Pressable
              style={({ pressed }) => [s.doneBtn, pressed && { opacity: 0.82 }]}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={s.doneBtnText}>Done</Text>
            </Pressable>
          </Card>
        ) : null}

        {(screenState === 'empty' || screenState === 'entering') && !successShown ? (
          <>
            {GuideSteps}

            <Pressable
              style={({ pressed }) => [s.openBtn, pressed && { opacity: 0.82 }]}
              onPress={handleOpenAIStudio}
              accessibilityRole="link"
              accessibilityLabel="Open Google AI Studio"
            >
              <Text style={s.openBtnText}>Open Google AI Studio</Text>
            </Pressable>

            <Text style={s.inputLabel}>Paste your API key</Text>
            <TextInput
              style={s.input}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="AIza..."
              placeholderTextColor={t.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="password"
              accessibilityLabel="API key input"
            />

            {saveError ? (
              <Text style={s.errorText} maxFontSizeMultiplier={1.4}>{saveError}</Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.82 }, isSaving && { opacity: 0.7 }]}
              onPress={() => void handleSave()}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel={isSaving ? 'Validating key…' : 'Save key'}
            >
              {isSaving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={s.saveBtnText}>Save and activate</Text>
              )}
            </Pressable>
          </>
        ) : null}
      </ScreenScroll>
    </SafeAreaView>
  )
}
