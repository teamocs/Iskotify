import { useEffect, useId, useRef } from 'react'
import {
  AccessibilityInfo, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, findNodeHandle,
} from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { XmarkOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint, type Breakpoint } from '../../hooks/useBreakpoint'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { decorative } from './a11y'

// Native keyboard avoidance: react-native-keyboard-controller's version tracks
// the IME frame-by-frame on Android (where adjustResize does not reach inside a
// Modal window) and iOS alike. Web needs none: the browser resizes the viewport.
const NativeKeyboardAvoidingView: React.ComponentType<{ behavior: 'padding'; style?: object; children: React.ReactNode }> | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native-only module; a static import would pull it into the web bundle
  Platform.OS === 'web' ? null : require('react-native-keyboard-controller').KeyboardAvoidingView

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
 * Modal panel with the full modal contract:
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
 * - Fades (no slide) and cuts instantly under reduced motion.
 */
export function Sheet({ visible, title, onClose, children, footer, closeLabel = 'Close' }: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const reduced = useReducedMotion()
  const insets = useSafeInsets()
  const titleRef = useRef<Text>(null)
  const titleId = `sheet-title-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const mode = sheetPresentation(bp)
  const bottom = mode === 'bottom'

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return
    const id = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null
      if (node) AccessibilityInfo.setAccessibilityFocus(node)
    }, 250)
    return () => clearTimeout(id)
  }, [visible])

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onClose}
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
        <View
          testID="sheet-panel"
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={{
            zIndex: 1,
            width: '100%',
            maxWidth: bottom ? undefined : 560,
            maxHeight: bottom ? '90%' : '85%',
            backgroundColor: t.surfaceRaised,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            borderBottomLeftRadius: bottom ? 0 : radius.xxl,
            borderBottomRightRadius: bottom ? 0 : radius.xxl,
            borderCurve: 'continuous',
            paddingBottom: bottom ? insets.bottom + spacing.lg : spacing.lg,
            boxShadow: t.shadowMd,
          }}
        >
          {bottom ? (
            <View
              testID="sheet-grabber"
              {...decorative}
              style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: t.divider, marginTop: spacing.sm }}
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
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              style={({ pressed }) => ({
                width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                backgroundColor: pressed ? t.surface2 : 'transparent',
              })}
            >
              <Lineicons icon={XmarkOutlined} size={20} color={t.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm }}>{footer}</View> : null}
        </View>
        <Pressable
          testID="sheet-backdrop"
          onPress={onClose}
          accessible={false}
          focusable={false}
          tabIndex={-1}
          {...decorative}
          style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]}
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
