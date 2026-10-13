import { useState, useEffect } from 'react'
import { View, Alert, BackHandler, Platform, type AccessibilityActionEvent } from 'react-native'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  SparkOutlined,
  QuestionMarkCircleOutlined,
  Shield2Outlined,
  ClipboardOutlined,
  ExitOutlined,
  Bug1Outlined,
  Comment1Outlined,
  ChevronLeftOutlined,
  Locked1Outlined,
  Bell1Outlined,
  Alarm1Outlined,
  CalendarDaysOutlined,
  BarChart4Outlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'
import { useTheme } from '../theme/ThemeContext'
import { layout, radius, spacing } from '../theme/tokens'
import { InfoPage } from '../components/info/InfoPage'
import { InsetGroup, InsetRow } from '../components/ui/InsetGroup'
import { Avatar } from '../components/ui/Avatar'
import { Text } from '../components/ui/Text'
import { PressableScale } from '../components/ui/Pressable'
import { decorative, focusRing } from '../components/ui/a11y'
import { useNotifications } from '../hooks/useNotifications'
import { useHomeStats } from '../hooks/useHomeStats'
import { getSettings } from '../services/settings'
import { setAnalyticsOptIn } from '../services/consent'
import { applyAnalyticsConsent } from '../services/analyticsConsent'
import { analyticsAllowed } from '../utils/consent'

function formatHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${h12}:00 ${suffix}`
}

const version = Constants.expoConfig?.version ?? '1.0.0'

/** A 44pt round stepper button (Earlier / Later). */
function StepButton({ label, direction, disabled, onPress }: { label: string; direction: 'back' | 'forward'; disabled: boolean; onPress: () => void }) {
  const { theme: t } = useTheme()
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      style={({ pressed, hovered, focused }) => [{
        width: layout.headerButton.hit, height: layout.headerButton.hit, borderRadius: radius.capsule,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: t.inputBorder,
        backgroundColor: pressed || (hovered && !disabled) ? t.surface2 : t.surface,
      }, focusRing(t.focusRing, focused)]}
    >
      <View {...decorative} style={direction === 'forward' ? { transform: [{ scaleX: -1 }] } : null}>
        <Lineicons icon={ChevronLeftOutlined} size={16} color={t.textPrimary} />
      </View>
    </PressableScale>
  )
}

/**
 * The stepper an InsetRow carries as its trailing control: Earlier · value ·
 * Later. For assistive tech it is one adjustable control named by the setting
 * (swipe up/down on iOS, volume keys on TalkBack); the buttons, for touch and
 * the keyboard, name the setting too.
 */
function Stepper({ label, value, disabled, onEarlier, onLater }: {
  label: string; value: string; disabled: boolean; onEarlier: () => void; onLater: () => void
}) {
  const onAction = (e: AccessibilityActionEvent) => {
    if (disabled) return
    if (e.nativeEvent.actionName === 'increment') onLater()
    if (e.nativeEvent.actionName === 'decrement') onEarlier()
  }
  const name = label.charAt(0).toLowerCase() + label.slice(1)
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      aria-disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <StepButton label={`Earlier ${name}`} direction="back" disabled={disabled} onPress={onEarlier} />
      <Text
        role="headline"
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={1.5}
        style={{ minWidth: 76, textAlign: 'center', fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
      <StepButton label={`Later ${name}`} direction="forward" disabled={disabled} onPress={onLater} />
    </View>
  )
}

/**
 * Settings, in iOS inset groups: footnote section headers, a footer under each
 * group that says what it is for, switch rows that toggle on a tap anywhere on
 * the row. Light-only: there is no appearance setting.
 */
export default function SettingsScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  const [profileName, setProfileName] = useState('Student')
  const [profileEmail, setProfileEmail] = useState('')
  const { focusedListings } = useHomeStats()
  const {
    enabled: notifEnabled, toggle: toggleNotifs,
    dailyReminderHour, weeklySummaryEnabled, setReminderHour, toggleWeeklySummary,
  } = useNotifications()

  useEffect(() => {
    async function load() {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const row = rows[0]
      if (!row) return
      setProfileName(row.fullName || 'Student')
      setProfileEmail(row.email ?? '')
    }
    void load()
  }, [db])

  // Analytics sharing: off for under-18s until they opt in, on for adults until
  // they opt out. Nothing runs before consent (utils/consent.ts analyticsAllowed).
  // null until the saved choice loads: the switch stays disabled so it neither
  // flickers nor rolls back to a value that was never saved.
  const [analyticsOn, setAnalyticsOn] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    void getSettings(db)
      .then(s => { if (alive) setAnalyticsOn(analyticsAllowed(s)) })
      .catch(e => {
        console.warn('[settings] could not read analytics choice:', e)
        // Unknown: show OFF (analytics stays off too, analyticsConsent fails closed).
        if (alive) setAnalyticsOn(false)
      })
    return () => { alive = false }
  }, [db])

  async function toggleAnalytics(next: boolean) {
    const before = analyticsOn
    setAnalyticsOn(next)
    try {
      await setAnalyticsOptIn(db, next)
      await applyAnalyticsConsent(db)
    } catch (e) {
      console.warn('[settings] could not save analytics choice:', e)
      setAnalyticsOn(before)
    }
  }

  function handleExitApp() {
    Alert.alert(
      'Exit Iskotify?',
      'Your progress is saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ],
    )
  }

  const gap = { marginBottom: spacing.xxl }

  return (
    <InfoPage title="Settings" fallbackHref="/(tabs)">
      <InsetGroup header="Profile" headerLevel={2} inset={false} style={gap}>
        <InsetRow
          title={profileName}
          subtitle={profileEmail || 'View your profile'}
          leading={<Avatar name={profileName} size={40} />}
          onPress={() => router.push('/profile')}
        />
      </InsetGroup>

      <InsetGroup
        header="Notifications"
        headerLevel={2}
        inset={false}
        style={gap}
        footer="Daily nudges, reminders and your weekly summary."
      >
        <InsetRow
          title="Push notifications"
          subtitle={notifEnabled ? 'On: daily nudge, weekly summary, exam countdowns' : 'Off'}
          icon={Bell1Outlined}
          switchValue={notifEnabled}
          onSwitchChange={() => void toggleNotifs(focusedListings)}
        />
        <InsetRow
          title="Daily reminder time"
          subtitle="When your daily practice nudge arrives"
          icon={Alarm1Outlined}
          disabled={!notifEnabled}
          trailing={(
            <Stepper
              label="Daily reminder time"
              value={formatHour(dailyReminderHour)}
              disabled={!notifEnabled}
              onEarlier={() => void setReminderHour((dailyReminderHour + 23) % 24, focusedListings)}
              onLater={() => void setReminderHour((dailyReminderHour + 1) % 24, focusedListings)}
            />
          )}
        />
        <InsetRow
          title="Weekly summary"
          subtitle="A Sunday nudge to review your weak areas"
          icon={CalendarDaysOutlined}
          switchValue={weeklySummaryEnabled}
          onSwitchChange={() => void toggleWeeklySummary(focusedListings)}
          disabled={!notifEnabled}
        />
      </InsetGroup>

      <InsetGroup header="Privacy" headerLevel={2} inset={false} style={gap} footer="You choose what is shared.">
        <InsetRow
          title="Share anonymous usage analytics"
          subtitle="Helps us see which parts of Iskotify get used and fix problems. No names or emails."
          icon={BarChart4Outlined}
          numberOfLines={4}
          switchValue={analyticsOn ?? false}
          disabled={analyticsOn === null}
          onSwitchChange={v => void toggleAnalytics(v)}
        />
        <InsetRow
          title="Grades and family details"
          subtitle="Choose whether we use them, or clear them"
          icon={Locked1Outlined}
          iconTone="neutral"
          onPress={() => router.push('/profile/scholarship-info')}
        />
      </InsetGroup>

      <InsetGroup header="Feedback" headerLevel={2} inset={false} style={gap} footer="Tell us what to fix or what would help.">
        <InsetRow title="Report a bug" icon={Bug1Outlined} iconTone="neutral" onPress={() => router.push('/settings/report-bug')} />
        <InsetRow title="Leave feedback" icon={Comment1Outlined} iconTone="neutral" onPress={() => router.push('/settings/leave-feedback')} />
      </InsetGroup>

      <InsetGroup header="About" headerLevel={2} inset={false} style={gap}>
        <InsetRow title="About Iskotify" icon={SparkOutlined} onPress={() => router.push('/about')} />
        <InsetRow title="Help and support" icon={QuestionMarkCircleOutlined} iconTone="neutral" onPress={() => router.push('/help')} />
        <InsetRow title="Privacy policy" icon={Shield2Outlined} iconTone="neutral" onPress={() => router.push('/privacy')} />
        <InsetRow title="Terms of service" icon={ClipboardOutlined} iconTone="neutral" onPress={() => router.push('/terms')} />
      </InsetGroup>

      {/* BackHandler.exitApp only works on Android; elsewhere the row would do nothing. */}
      {Platform.OS === 'android' ? (
        <InsetGroup header="Session" headerLevel={2} inset={false} style={gap}>
          <InsetRow title="Exit app" icon={ExitOutlined} iconTone="danger" destructive chevron={false} onPress={handleExitApp} />
        </InsetGroup>
      ) : null}

      <Text role="caption" color={t.textSecondary} style={{ textAlign: 'center' }}>{`Iskotify v${version}`}</Text>
    </InfoPage>
  )
}
