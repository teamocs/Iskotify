import { useMemo } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'

// ─── Full-screen non-dismissable disclaimer modal ────────────────────────────

interface ScoreDisclaimerModalProps {
  visible: boolean
  onAcknowledge: () => void
}

const EN_TEXT =
  'This is an unofficial estimate only. Iskotify is not affiliated with, ' +
  'authorized by, or endorsed by the University of the Philippines. Your real ' +
  'admission result depends on UP’s official process, which we cannot replicate. ' +
  'Always verify at upcat.up.edu.ph. This estimate is not a guarantee of admission.'

const TL_TEXT =
  'Ito ay hindi opisyal na estima lamang. Ang Iskotify ay walang kaugnayan sa, ' +
  'hindi awtorisado ng, at hindi inendorso ng University of the Philippines. ' +
  'Ang tunay mong resulta ay nakabatay sa opisyal na proseso ng UP na hindi namin ' +
  'magagaya. Palaging i-verify sa upcat.up.edu.ph. Hindi garantiya ng pagpasa ' +
  'ang estima na ito.'

export function ScoreDisclaimerModal({ visible, onAcknowledge }: ScoreDisclaimerModalProps) {
  const { theme: t, typo } = useTheme()

  const s = useMemo(
    () =>
      StyleSheet.create({
        safeArea: {
          flex: 1,
          backgroundColor: t.bg,
        },
        scroll: { flex: 1 },
        scrollContent: {
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: 24,
        },
        warningBadge: {
          alignSelf: 'flex-start',
          backgroundColor: '#92400e22',
          borderWidth: 1,
          borderColor: '#d97706',
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          marginBottom: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        warningIcon: {
          fontSize: typo.base,
          color: '#d97706',
        },
        warningBadgeText: {
          fontFamily: 'Lexend_500Medium',
          fontSize: typo.xs,
          color: '#d97706',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        },
        heading: {
          fontFamily: 'Outfit_700Bold',
          fontSize: typo.xl,
          color: t.textPrimary,
          marginBottom: 20,
          lineHeight: 30,
        },
        divider: {
          height: 1,
          backgroundColor: t.border,
          marginBottom: 20,
        },
        langLabel: {
          fontFamily: 'Lexend_500Medium',
          fontSize: typo.xs,
          color: t.textTertiary,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          marginBottom: 8,
        },
        bodyText: {
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.sm,
          color: t.textSecondary,
          lineHeight: 22,
          marginBottom: 24,
        },
        ackBtnWrapper: {
          paddingHorizontal: 24,
          paddingBottom: 16,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: t.border,
          backgroundColor: t.bg,
        },
        ackBtn: {
          backgroundColor: '#b45309',
          borderRadius: 14,
          paddingVertical: 16,
          alignItems: 'center',
          justifyContent: 'center',
        },
        ackBtnText: {
          fontFamily: 'Outfit_700Bold',
          fontSize: typo.md,
          color: '#fff',
        },
        ackBtnSubtext: {
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.xs,
          color: 'rgba(255,255,255,0.75)',
          marginTop: 2,
        },
      }),
    [t, typo],
  )

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      // onRequestClose is a no-op: back button / gesture cannot dismiss this modal
      onRequestClose={() => {}}
    >
      <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {/* Warning badge */}
          <View style={s.warningBadge}>
            <Text style={s.warningIcon}>&#9888;</Text>
            <Text style={s.warningBadgeText}>Important Notice</Text>
          </View>

          <Text style={s.heading}>Score Estimate Disclaimer</Text>

          <View style={s.divider} />

          {/* English */}
          <Text style={s.langLabel}>English</Text>
          <Text style={s.bodyText}>{EN_TEXT}</Text>

          {/* Filipino */}
          <Text style={s.langLabel}>Filipino</Text>
          <Text style={s.bodyText}>{TL_TEXT}</Text>
        </ScrollView>

        {/* Acknowledge button — only way to exit */}
        <View style={s.ackBtnWrapper}>
          <Pressable
            style={s.ackBtn}
            onPress={onAcknowledge}
            accessibilityRole="button"
            accessibilityLabel="I understand — acknowledge disclaimer"
          >
            <Text style={s.ackBtnText}>I understand / Naiintindihan ko</Text>
            <Text style={s.ackBtnSubtext}>Tap to continue</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

// ─── Permanent inline notice ─────────────────────────────────────────────────

export function ScoreDisclaimerNotice() {
  const { theme: t, typo } = useTheme()

  const s = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: '#92400e18',
          borderWidth: 1,
          borderColor: '#d9770640',
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          marginHorizontal: 16,
          marginBottom: 12,
        },
        icon: {
          fontSize: typo.sm,
          color: '#b45309',
        },
        text: {
          flex: 1,
          fontFamily: 'Lexend_400Regular',
          fontSize: typo.xs,
          color: '#b45309',
          lineHeight: 16,
        },
      }),
    [t, typo],
  )

  return (
    <View
      style={s.container}
      accessibilityRole="text"
      accessibilityLabel="Unofficial estimate disclaimer"
    >
      <Text style={s.icon}>&#9888;</Text>
      <Text style={s.text}>
        Unofficial estimate — verify at upcat.up.edu.ph{' · '}Hindi opisyal na estima
      </Text>
    </View>
  )
}
