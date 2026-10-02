import { Text, type TextStyle } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { textStyle } from '../../theme/tokens'

type WebLinkProps = { href?: string }

function LegalLink({ label, to }: { label: string; to: '/terms' | '/privacy' }) {
  const { theme: t } = useTheme()
  // On web this is a real <a href> (keyboard-focusable); the click is handled
  // in the app so the single-page app does not reload.
  const web: WebLinkProps = { href: to }
  return (
    <Text
      {...web}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={(e?: { preventDefault?: () => void }) => { e?.preventDefault?.(); router.push(to) }}
      style={{ color: t.accentText, textDecorationLine: 'underline' } as TextStyle}
    >
      {label}
    </Text>
  )
}

/**
 * "By continuing you agree to the Terms and acknowledge the Privacy Policy",
 * with both documents one tap away (landing and sign-in). `verb` words the
 * action ("By starting" on the guest diagnostic's intro).
 */
export function LegalLine({ verb = 'continuing' }: { verb?: string } = {}) {
  const { theme: t } = useTheme()
  return (
    <Text style={[textStyle('caption', t.textSecondary), { textAlign: 'center' }]} maxFontSizeMultiplier={2}>
      {`By ${verb} you agree to the `}
      <LegalLink label="Terms" to="/terms" />
      {' and acknowledge the '}
      <LegalLink label="Privacy Policy" to="/privacy" />
      {'.'}
    </Text>
  )
}
