import { View, Text, Pressable } from 'react-native'
import { router, type Href } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint, pagePadding, contentMaxWidth } from '../../hooks/useBreakpoint'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { WebTopSpacer } from '../ui/WebTopSpacer'

interface Props {
  /**
   * Where Back goes when there is no history — a deep link, a shared URL, or
   * a web refresh lands here with nothing to go back to.
   */
  fallbackHref: string
  /**
   * Screen title. When given it is the page's header; omit it when the page
   * body carries its own title (a detail hero), so there is one header, not two.
   */
  title?: string
  /** Trailing actions. */
  actions?: React.ReactNode
  /**
   * Inside a <Screen header>, which already supplies the column, gutter and
   * web top spacing: skip our own and just pull the button onto the gutter.
   */
  bare?: boolean
}

/** Leave a detail screen: history back, or the parent route after a deep link. */
export function goBackOr(fallbackHref: string): void {
  if (router.canGoBack?.()) router.back()
  else router.replace(fallbackHref as Href)
}

/**
 * Top bar for Explore's stack screens: a 44pt back button with a drawn
 * chevron and a spoken name, plus an optional header title. Shares the page's
 * content column so it lines up with the body on tablets and desktop.
 */
export function DetailTopBar({ fallbackHref, title, actions, bare = false }: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()

  return (
    <View>
      {bare ? null : <WebTopSpacer />}
      <View
        style={bare ? {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          marginLeft: -spacing.sm,
          minHeight: 56,
        } : {
          width: '100%',
          maxWidth: bp === 'compact' ? undefined : contentMaxWidth('wide'),
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: pagePadding(bp) - spacing.sm,
          paddingVertical: spacing.xs,
          minHeight: 56,
        }}
      >
        <Pressable
          onPress={() => goBackOr(fallbackHref)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={(state) => {
            const { pressed, hovered, focused } = state as WebPressableState
            return [
              {
                width: 44, height: 44, borderRadius: radius.pill,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
              },
              focusRing(t.focusRing, focused),
            ]
          }}
        >
          <View {...decorative}>
            <Lineicons icon={ChevronLeftOutlined} size={22} color={t.textPrimary} />
          </View>
        </Pressable>
        {title ? (
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={[textStyle('headline', t.textPrimary), { flex: 1, minWidth: 0 }]}
          >
            {title}
          </Text>
        ) : <View style={{ flex: 1 }} />}
        {actions}
      </View>
    </View>
  )
}
