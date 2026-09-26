import { Modal, ScrollView, Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Screen } from '../ui/Screen'
import { PageTitle } from '../ui/PageTitle'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { InfoBanner } from '../ui/InfoBanner'
import { heading } from '../ui/a11y'

// ─── Full-screen non-dismissable disclaimer gate ─────────────────────────────
// PRODUCT.md "Hard compliance": the EN/TL disclaimer must be accepted before
// the first view of the Estimated Admission Score. The only way out is the
// acknowledge button (onRequestClose is a no-op, there is no backdrop).

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

function LanguageSection({ title, body, lang }: { title: string; body: string; lang: string }) {
  const { theme: t } = useTheme()
  return (
    <Card style={{ gap: spacing.sm }}>
      <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>
        {title}
      </Text>
      <Text
        {...({ lang } as Record<string, unknown>)}
        style={textStyle('body', t.textSecondary)}
        maxFontSizeMultiplier={2}
      >
        {body}
      </Text>
    </Card>
  )
}

export function ScoreDisclaimerModal({ visible, onAcknowledge }: ScoreDisclaimerModalProps) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  // Phones keep the action pinned under the text (it was a sticky footer
  // before); wider windows put it at the end of the reading column.
  const sticky = bp === 'compact'

  const acknowledge = (
    <Button
      label="I understand / Naiintindihan ko"
      accessibilityLabel="I understand — acknowledge disclaimer"
      onPress={onAcknowledge}
      size="lg"
      fullWidth={sticky}
    />
  )

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      // onRequestClose is a no-op: back button / gesture cannot dismiss this modal
      onRequestClose={() => {}}
    >
      <Screen scroll={false} edges={['top', 'bottom']}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg }}
        >
          <PageTitle
            title="Before you see your estimate"
            lead="The Estimated Admission Score is based on historical cutoffs. Please read this note, in English or Filipino, first."
          />
          <LanguageSection title="English" body={EN_TEXT} lang="en" />
          <LanguageSection title="Filipino" body={TL_TEXT} lang="fil" />
          {sticky ? null : <View style={{ marginTop: spacing.sm }}>{acknowledge}</View>}
        </ScrollView>

        {sticky ? (
          <View
            testID="disclaimer-footer"
            style={{
              paddingTop: spacing.md,
              paddingBottom: spacing.lg, // SafeAreaView (edges bottom) adds the inset
              borderTopWidth: 1,
              borderTopColor: t.divider,
              backgroundColor: t.bg,
            }}
          >
            {acknowledge}
          </View>
        ) : null}
      </Screen>
    </Modal>
  )
}

// ─── Permanent inline notice ─────────────────────────────────────────────────

export function ScoreDisclaimerNotice() {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Unofficial estimate disclaimer: verify at upcat.up.edu.ph. Hindi opisyal na estima."
      style={{ marginBottom: spacing.lg }}
    >
      <InfoBanner
        tone="neutral"
        message={'Unofficial estimate — verify at upcat.up.edu.ph · Hindi opisyal na estima'}
      />
    </View>
  )
}
