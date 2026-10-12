import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { GraduationCap1Outlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'
import { cachedQuery, subscribe } from '../../services/queryCache'
import { Button } from '../ui/Button'
import { IconTile } from '../ui/InsetGroup'
import { Text } from '../ui/Text'
import { heading } from '../ui/a11y'
import {
  scholarshipProfileGaps, scholarshipPromptMessage, shouldShowScholarshipPrompt,
  type ScholarshipPromptSettings,
} from '../../utils/scholarshipProfilePrompt'
import { SCHOLARSHIP_PROMPT_KEY, dismissScholarshipPrompt, readScholarshipPromptSettings } from './scholarshipPromptState'

/**
 * Today's quiet "Complete your scholarship profile" card (P4). The short
 * onboarding asks only name, grade and exam; this card opens the scholarship
 * profile, where the school, target courses, province and the grades/income
 * opt-in now live. Secondary actions only (Today's one primary action is the
 * next step), hidden once complete or dismissed, and silent on a read error.
 */
export function ScholarshipProfilePrompt() {
  const db = useDb()
  const { theme: t } = useTheme()
  const [settings, setSettings] = useState<ScholarshipPromptSettings | null>(null)

  useEffect(() => {
    let alive = true
    const apply = (v: unknown) => { if (alive) setSettings((v as ScholarshipPromptSettings | null) ?? null) }
    // Re-read when settings change (the profile screen saves through updateSettings).
    const unsub = subscribe(SCHOLARSHIP_PROMPT_KEY, apply)
    cachedQuery(SCHOLARSHIP_PROMPT_KEY, 0, () => readScholarshipPromptSettings(db)).then(apply, () => {
      /* unreadable settings: no prompt */
    })
    return () => { alive = false; unsub() }
  }, [db])

  if (!shouldShowScholarshipPrompt(settings)) return null

  const dismiss = () => {
    const now = Date.now()
    setSettings(s => (s ? { ...s, profilePromptDismissedAt: now } : s))
    dismissScholarshipPrompt(db, now).catch((e: unknown) => console.warn('[today] dismiss scholarship prompt:', e))
  }

  return (
    <View
      testID="scholarship-profile-prompt"
      style={{ backgroundColor: t.surface, borderRadius: radius.group, borderCurve: 'continuous', padding: spacing.lg }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <IconTile icon={GraduationCap1Outlined} />
        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
          <Text role="headline" {...heading(2)}>
            Complete your scholarship profile
          </Text>
          <Text role="subheadline" color={t.textSecondary}>
            {scholarshipPromptMessage(scholarshipProfileGaps(settings!))}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        <Button
          label="Complete profile"
          variant="secondary"
          size="sm"
          onPress={() => router.push('/profile/scholarship-info')}
        />
        <Button
          label="Not now"
          variant="ghost"
          size="sm"
          accessibilityHint="Hides this card. Your scholarship profile stays in Profile."
          onPress={dismiss}
        />
      </View>
    </View>
  )
}
