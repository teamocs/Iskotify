import { useEffect, useId, useRef, useState } from 'react'
import {
  AccessibilityInfo, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, findNodeHandle,
  useWindowDimensions,
} from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { XmarkOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { motion, radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint, type Breakpoint } from '../../hooks/useBreakpoint'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { decorative, focusRing, type WebPressableState } from './a11y'
import { Glass } from './Glass'

// Native keyboard avoidance: react-native-keyboard-controller's version tracks
// the IME frame-by-frame on Android (where adjustResize does not reach inside a
// Modal window) and iOS alike. Web needs none: the browser resizes the viewport.
const NativeKeyboardAvoidingView: React.ComponentType<{ behavior: 'padding'; style?: object; children: React.ReactNode }> | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native-only module; a static import would pull it into the web bundle
  Platform.OS === 'web' ? null : require('react-native-keyboard-controller').KeyboardAvoidingView

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** The exit: a quick ease-out (Reduce Motion: the 160ms crossfade). */
export const SHEET_EXIT_MS = 220

/** How far a centred dialog rises as it appears (a bottom sheet travels the whole screen). */
const DIALOG_RISE = spacing.xxl

/** Bottom sheet on phones (thumb reach); a centered dialog from medium up. */
export function sheetPresentation(bp: Breakpoint): 'bottom' | 'dialog' {
  return bp === 'compact' ? 'bottom' : 'dialog'
}

interface Props {
  visible: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Sticky footer (e.g. the sheet's one primary Button). */
  footer?: React.ReactNode
  closeLabel?: string
}

/**
 * The IN-PLACE sheet: a Modal panel with the full modal contract. Use it for
 * anything with text inputs (Android's native formSheet does not lift above
 * the keyboard reliably); a sheet that is its own route uses
 * `sheetRouteOptions()` from ./sheetRoute instead.
 *
 * - Android Back / web Escape close it (onRequestClose);
 * - the backdrop is tappable but hidden from assistive tech (aria-hidden on
 *   web) and out of the Tab order;
 * - the panel is modal for screen readers, is named by its title, and moves
 *   screen-reader focus to the title on open (native). On web,
 *   react-native-web's Modal supplies role="dialog", aria-modal, the Tab trap
 *   and focus restore on close; the dialog is named via aria-labelledby → the
 *   title's id. The trap focuses the first descendant that accepts .focus()
 *   in DOM order (tabIndex=-1 still does), so the panel is rendered BEFORE the
 *   backdrop (zIndex keeps it on top) and initial focus lands on Close.
 * - Shape: the 28pt sheet radius (top corners on phones, all four for the
 *   centred dialog from medium widths up), the title row on a glass header.
 * - Motion: slides up on spring.smooth while the backdrop fades in, and
 *   slides back out (220ms ease-out) before it unmounts; under Reduce Motion
 *   the panel and backdrop only crossfade (160ms) both ways. While closing it
 *   ignores touches and close requests, so onClose fires once.
 */
export function Sheet({ visible, title, onClose, children, footer, closeLabel = 'Close' }: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const { reduceMotion } = usePlatformCapabilities()
  const insets = useSafeInsets()
  const { height: windowHeight } = useWindowDimensions()
  const titleRef = useRef<Text>(null)
  const titleId = `sheet-title-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const mode = sheetPresentation(bp)
  const bottom = mode === 'bottom'
  const progress = useSharedValue(0)
  // Stays true through the exit animation, so the Modal outlives `visible`.
  const [mounted, setMounted] = useState(visible)
  const closing = !visible && mounted
  const requestClose = () => { if (visible) onClose() }

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return
    const id = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null
      if (node) AccessibilityInfo.setAccessibilityFocus(node)
    }, 250)
    return () => clearTimeout(id)
  }, [visible])

  useEffect(() => {
    if (visible) {
      setMounted(true)
      // Assigning a new animation cancels an in-flight exit; it carries on
      // from wherever the exit had reached.
      progress.value = reduceMotion
        ? withTiming(1, { duration: motion.duration.reduced })
        : withSpring(1, motion.spring.smooth)
      return
    }
    const duration = reduceMotion ? motion.duration.reduced : SHEET_EXIT_MS
    progress.value = withTiming(0, { duration, easing: Easing.out(Easing.cubic) })
    // The cleanup runs when `visible` flips back (reopened mid-exit) and on
    // unmount, so a stale timer never hides an open sheet.
    const id = setTimeout(() => setMounted(false), duration)
    return () => clearTimeout(id)
    // `progress` is a stable shared value. Listing it would re-run this on
    // every render where a mock (or a remount) hands back a new object, and
    // each re-run restarts the unmount timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion])

  const travel = bottom ? windowHeight : DIALOG_RISE
  const panelMotion = useAnimatedStyle(() => {
    const p = progress.value
    if (reduceMotion) return { opacity: Math.min(1, p), transform: [{ translateY: 0 }] }
    // Clamp the spring's overshoot so a bottom sheet never lifts off the edge.
    return {
      opacity: bottom ? 1 : Math.min(1, p),
      transform: [{ translateY: Math.max(0, (1 - p) * travel) }],
    }
  })
  const backdropMotion = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value) }))

  const corner = radius.sheet

  return (
    <Modal
      visible={visible || mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
      aria-labelledby={titleId}
    >
      <KeyboardShell>
      <View
        style={{
          flex: 1,
          justifyContent: bottom ? 'flex-end' : 'center',
          alignItems: bottom ? 'stretch' : 'center',
          padding: bottom ? 0 : spacing.xxl,
        }}
      >
        <Animated.View
          testID="sheet-panel"
          pointerEvents={closing ? 'none' : 'auto'}
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[
            {
              zIndex: 1,
              width: '100%',
              maxWidth: bottom ? undefined : 560,
              maxHeight: bottom ? '90%' : '85%',
              backgroundColor: t.surfaceRaised,
              borderTopLeftRadius: corner,
              borderTopRightRadius: corner,
              borderBottomLeftRadius: bottom ? 0 : corner,
              borderBottomRightRadius: bottom ? 0 : corner,
              borderCurve: 'continuous',
              paddingBottom: bottom ? insets.bottom + spacing.lg : spacing.lg,
              boxShadow: t.shadowMd,
            },
            panelMotion,
          ]}
        >
          <Glass
            variant="header"
            testID="sheet-header"
            style={[
              {
                borderTopLeftRadius: corner,
                borderTopRightRadius: corner,
                borderCurve: 'continuous',
                paddingBottom: spacing.xs,
              },
              // The web recipe's outer shadow belongs to floating chrome, not a band inside a panel.
              Platform.OS === 'web' ? ({ boxShadow: 'none' } as object) : null,
            ]}
          >
            {bottom ? (
              <View
                testID="sheet-grabber"
                {...decorative}
                style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: radius.capsule, backgroundColor: t.divider, marginTop: spacing.sm }}
              />
            ) : null}
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                paddingLeft: spacing.xl, paddingRight: spacing.sm, paddingTop: spacing.sm,
              }}
            >
              <Text ref={titleRef} nativeID={titleId} accessibilityRole="header" style={[textStyle('headline', t.textPrimary), { flex: 1 }]}>
                {title}
              </Text>
              <Pressable
                onPress={requestClose}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                style={(state) => {
                  const { pressed, focused } = state as WebPressableState
                  return [
                    {
                      width: 44, height: 44, borderRadius: radius.capsule, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: pressed ? t.surface2 : 'transparent',
                    },
                    focusRing(t.focusRing, focused),
                  ]
                }}
              >
                <View {...decorative}>
                  <Lineicons icon={XmarkOutlined} size={20} color={t.textSecondary} />
                </View>
              </Pressable>
            </View>
          </Glass>
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm }}>{footer}</View> : null}
        </Animated.View>
        <AnimatedPressable
          testID="sheet-backdrop"
          onPress={requestClose}
          pointerEvents={closing ? 'none' : 'auto'}
          accessible={false}
          focusable={false}
          tabIndex={-1}
          {...decorative}
          style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }, backdropMotion]}
        />
      </View>
      </KeyboardShell>
    </Modal>
  )
}

/** Lifts the sheet above the software keyboard on native so its inputs stay visible. */
function KeyboardShell({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web' || !NativeKeyboardAvoidingView) return <>{children}</>
  return <NativeKeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>{children}</NativeKeyboardAvoidingView>
}
