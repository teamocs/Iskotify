import { useState, useCallback, useEffect } from 'react'
import { View, Platform, Alert } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'
import { spacing, weight } from '../theme/tokens'
import { submitDateContribution, type ContribField } from '../services/dateContributions'
import { Sheet, SHEET_EXIT_MS } from './ui/Sheet'
import { Button } from './ui/Button'
import { FilterChip } from './ui/Chip'
import { TextField } from './ui/TextField'
import { Text } from './ui/Text'

interface Props {
  visible: boolean
  onClose: () => void
  listingSlug: string
}

const FIELDS: { key: ContribField; label: string }[] = [
  { key: 'exam_date', label: 'Exam date' },
  { key: 'deadline', label: 'Application deadline' },
  { key: 'results_date', label: 'Results date' },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Lets a signed-in student suggest a correction to a listing's key dates, on
 * the P3 in-place Sheet (it has text inputs, so not a routed formSheet). Each
 * opening gets a fresh form; the submit button is the sheet's one primary
 * action.
 */
export function SuggestDateCorrectionModal({ visible, onClose, listingSlug }: Props) {
  // A fresh form per opening (its state resets), kept mounted through the
  // sheet's exit so the panel does not empty while it slides away.
  const [opening, setOpening] = useState(0)
  useEffect(() => { if (visible) setOpening(n => n + 1) }, [visible])
  return (
    <Sheet visible={visible} title="Suggest a correction" onClose={onClose}>
      {opening > 0 ? <SuggestDateCorrectionForm key={opening} listingSlug={listingSlug} onClose={onClose} /> : null}
    </Sheet>
  )
}

/** Runs after the sheet has finished leaving (an alert or a push over a closing Modal can be dropped on iOS). */
function afterSheetCloses(fn: () => void) {
  setTimeout(fn, SHEET_EXIT_MS + 50)
}

function SuggestDateCorrectionForm({ listingSlug, onClose }: { listingSlug: string; onClose: () => void }) {
  const { theme: t } = useTheme()
  const [field, setField] = useState<ContribField>('exam_date')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)

  // Inline format hint: only once the user has typed something malformed.
  const formatInvalid = date.length > 0 && !DATE_RE.test(date)
  const canSubmit = DATE_RE.test(date) && !submitting

  const submit = useCallback(async () => {
    if (!DATE_RE.test(date)) {
      setError('Enter a valid date')
      return
    }
    setError(null)
    setNeedsAuth(false)
    setSubmitting(true)
    const res = await submitDateContribution({
      listingSlug,
      field,
      date,
      note: note.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
    })
    setSubmitting(false)

    if (res.ok) {
      onClose()
      afterSheetCloses(() => Alert.alert(
        'Thanks',
        "Your suggested date was sent for review. We'll double-check it against the official source.",
      ))
      return
    }
    if (res.needsAuth) {
      setNeedsAuth(true)
      setError(res.error)
      return
    }
    setError(res.error)
  }, [date, field, note, sourceUrl, listingSlug, onClose])

  const goSignIn = useCallback(() => {
    onClose()
    afterSheetCloses(() => router.push('/auth/sign-in'))
  }, [onClose])

  return (
    <View style={{ gap: spacing.md }}>
      <Text role="subheadline" color={t.textSecondary}>
        Spotted a wrong date? Suggest the correct one and we&apos;ll review it against the official source.
      </Text>

      <Text role="footnote" style={weight('600')}>Which date?</Text>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
        accessibilityRole="radiogroup"
        accessibilityLabel="Which date to correct"
      >
        {FIELDS.map(f => (
          <FilterChip key={f.key} label={f.label} selected={field === f.key} onPress={() => setField(f.key)} />
        ))}
      </View>

      <TextField
        label="Correct date"
        value={date}
        onChangeText={(v) => { setDate(v); if (error) setError(null) }}
        placeholder="YYYY-MM-DD"
        hint="Format: year-month-day, e.g. 2026-08-15"
        error={formatInvalid ? 'Use the format YYYY-MM-DD (e.g. 2026-08-15).' : undefined}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        maxLength={10}
        accessibilityLabel="Correct date, format year month day"
      />

      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Where did you see this date?"
        multiline
        accessibilityLabel="Note about this correction"
      />

      <TextField
        label="Source link (optional)"
        value={sourceUrl}
        onChangeText={setSourceUrl}
        placeholder="https://…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel="Source link for this correction"
      />

      {error ? (
        <Text role="footnote" color={t.danger} accessibilityLiveRegion="polite" aria-live="polite">{error}</Text>
      ) : null}

      {needsAuth ? (
        <Button label="Sign in" fullWidth onPress={goSignIn} />
      ) : (
        <Button
          label="Submit suggestion"
          fullWidth
          disabled={!canSubmit}
          loading={submitting}
          onPress={() => void submit()}
        />
      )}
    </View>
  )
}
