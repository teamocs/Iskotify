import { View } from 'react-native'
import { router } from 'expo-router'
import { spacing } from '../../theme/tokens'
import { ChoiceRow } from '../onboarding/ChoiceRow'
import { Button } from '../ui/Button'
import type { AgeBand } from '../../utils/consent'

export interface ConsentFormValue {
  ageBand: AgeBand | null
  /** "I've read the Terms and the Privacy Policy". */
  terms: boolean
  /** "My parent or guardian has read the Privacy Policy and agrees…" (under 18 only). */
  guardian: boolean
}

interface Props {
  value: ConsentFormValue
  onChange: (next: ConsentFormValue) => void
}

/**
 * The three consent controls, shared by onboarding's first step and the
 * "we've updated our Terms" screen: an age band, the Terms/Privacy tick and,
 * for under-18s only, a parent/guardian tick. Nothing is pre-chosen. The
 * documents open in the app from separate link buttons (an interactive link
 * must not sit inside the checkbox it labels).
 */
export function ConsentControls({ value, onChange }: Props) {
  const setAge = (ageBand: AgeBand) =>
    onChange({ ...value, ageBand, guardian: ageBand === 'minor' ? value.guardian : false })

  return (
    <View style={{ gap: spacing.xxl }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Your age" style={{ gap: spacing.sm }}>
        <ChoiceRow
          mode="radio"
          label="I'm 18 or older"
          accessibilityLabel="I'm 18 or older"
          selected={value.ageBand === 'adult'}
          onPress={() => setAge('adult')}
        />
        <ChoiceRow
          mode="radio"
          label="I'm under 18"
          accessibilityLabel="I'm under 18"
          selected={value.ageBand === 'minor'}
          onPress={() => setAge('minor')}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <ChoiceRow
          mode="checkbox"
          label="I've read the Terms and the Privacy Policy"
          accessibilityLabel="I've read the Terms and the Privacy Policy"
          selected={value.terms}
          onPress={() => onChange({ ...value, terms: !value.terms })}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm }}>
          <Button label="Read the Terms" variant="ghost" size="sm" onPress={() => router.push('/terms')} />
          <Button label="Read the Privacy Policy" variant="ghost" size="sm" onPress={() => router.push('/privacy')} />
        </View>
      </View>

      {value.ageBand === 'minor' ? (
        <ChoiceRow
          mode="checkbox"
          label="My parent or guardian has read the Privacy Policy and agrees to me using Iskotify"
          accessibilityLabel="My parent or guardian has read the Privacy Policy and agrees to me using Iskotify"
          selected={value.guardian}
          onPress={() => onChange({ ...value, guardian: !value.guardian })}
        />
      ) : null}
    </View>
  )
}
