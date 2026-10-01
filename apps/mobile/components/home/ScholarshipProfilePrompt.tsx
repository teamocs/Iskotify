import { useEffect, useState } from 'react'
import { View, Text } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GraduationCap1Outlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { cachedQuery, subscribe } from '../../services/queryCache'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { decorative, heading } from '../ui/a11y'
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
    <Card testID="scholarship-profile-prompt">
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View
          {...decorative}
          style={{
            width: 36, height: 36, borderRadius: radius.md, borderCurve: 'continuous',
            alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSurface,
          }}
        >
          <Lineicons icon={GraduationCap1Outlined} size={18} color={t.accentText} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
          <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>
            Complete your scholarship profile
          </Text>
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
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
    </Card>
  )
}
