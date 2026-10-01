import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Trash3Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../theme/ThemeContext'
import { spacing, textStyle } from '../theme/tokens'
import { useDb } from '../hooks/useDb'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { TextField } from './ui/TextField'
import { decorative } from './ui/a11y'
import { deleteAccount, isDeleteConfirmed, DELETE_CONFIRM_WORD } from '../services/deleteAccount'

const DELETED = [
  'Your account and sign-in.',
  'Your cloud backup: progress, settings, notes and saved items.',
  'The bug reports, feedback and question reports you sent, with their screenshots.',
]

interface Props {
  visible: boolean
  onClose: () => void
  /** Called once the server has deleted the account and this device is cleared. */
  onDeleted: () => void
}

/**
 * The confirmation for "Delete account". It says what goes and what stays, and
 * only enables the destructive button once DELETE has been typed. Used on
 * native and web alike (window.confirm is too thin for a decision this big).
 */
export function DeleteAccountSheet({ visible, onClose, onDeleted }: Props) {
  const { theme: t } = useTheme()
  const db = useDb()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Every opening starts clean.
  useEffect(() => {
    if (visible) { setTyped(''); setError(''); setBusy(false) }
  }, [visible])

  const confirmed = isDeleteConfirmed(typed)

  async function confirm() {
    if (!confirmed || busy) return
    setBusy(true)
    setError('')
    const result = await deleteAccount(db)
    if (result.ok) {
      onDeleted()
      return
    }
    setBusy(false)
    setError(result.error)
  }

  return (
    <Sheet
      visible={visible}
      title="Delete your account?"
      onClose={() => { if (!busy) onClose() }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            variant="danger"
            fullWidth
            label="Delete my account"
            icon={<Lineicons icon={Trash3Outlined} size={18} color={t.dangerStrong} />}
            disabled={!confirmed}
            loading={busy}
            onPress={() => void confirm()}
          />
          <Button variant="ghost" fullWidth label="Cancel" disabled={busy} onPress={onClose} />
        </View>
      }
    >
      <View style={{ gap: spacing.md }}>
        <Text style={textStyle('body', t.textPrimary)} maxFontSizeMultiplier={2}>
          This permanently deletes:
        </Text>
        <View style={{ gap: spacing.xs }}>
          {DELETED.map(line => (
            <View key={line} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View {...decorative} style={{ width: 5, height: 5, borderRadius: 3, marginTop: 10, backgroundColor: t.textSecondary }} />
              <Text style={[textStyle('body', t.textPrimary), { flex: 1 }]} maxFontSizeMultiplier={2}>{line}</Text>
            </View>
          ))}
        </View>
        <Text style={textStyle('body', t.textPrimary)} maxFontSizeMultiplier={2}>
          This can’t be undone.
        </Text>

        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
          We keep nothing about you afterwards, except the purchase records tax law requires if you bought Full Access, no longer linked to you.
        </Text>
        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
          Your notes on this device stay until you delete them from Notes. Usage analytics are not removed by this button; email teamocsph@gmail.com and we will delete what is linked to you.
        </Text>

        <TextField
          label={`Type ${DELETE_CONFIRM_WORD} to confirm`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          editable={!busy}
          returnKeyType="done"
          onSubmitEditing={() => void confirm()}
        />

        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={textStyle('bodySm', t.danger)} maxFontSizeMultiplier={2}>
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  )
}
