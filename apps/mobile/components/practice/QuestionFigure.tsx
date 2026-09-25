import { useMemo, useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../theme/tokens'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ExpandArrow1Outlined, XmarkOutlined } from '@lineiconshq/free-icons'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { decorative } from '../ui/a11y'

export interface QuestionFigureProps {
  /** Public Supabase Storage URL. Absent/null → component renders nothing. */
  imageUrl?: string | null
  /** Caption / alt text (source's FigureCaption). Falls back to "Question figure". */
  imageAlt?: string | null
  /** Intrinsic pixel size, when known — drives the aspect ratio so layout doesn't jump. */
  imageWidth?: number | null
  imageHeight?: number | null
}

// Used when the server hasn't backfilled intrinsic dimensions for a figure yet
// (image_width/image_height nullable) — a reasonable default for diagrams/charts
// so the reserved space isn't wildly wrong before the image itself loads.
const FALLBACK_ASPECT_RATIO = 4 / 3

/**
 * Renders a question's figure (circuit diagram, infographic, comic-panel sequence,
 * chart) between the stem and the options, in every Q&A surface. Disk-cached via
 * expo-image so a previously-viewed figure keeps working offline; tapping opens a
 * full-screen zoom modal. Renders nothing when the question carries no image.
 */
export function QuestionFigure(props: QuestionFigureProps) {
  if (!props.imageUrl) return null
  // Keyed by URL: the exam pagers reuse one QuestionCard as the student moves
  // on, so a failed load (or an open zoom) must not carry over to the next
  // question's figure.
  return <FigureView key={props.imageUrl} {...props} imageUrl={props.imageUrl} />
}

function FigureView({ imageUrl, imageAlt, imageWidth, imageHeight }: QuestionFigureProps & { imageUrl: string }) {
  const { theme: t } = useTheme()
  const reduced = useReducedMotion()
  const s = useMemo(() => makeStyles(t), [t])
  const [zoomOpen, setZoomOpen] = useState(false)
  const [failed, setFailed] = useState(false)

  const aspectRatio = imageWidth && imageHeight ? imageWidth / imageHeight : FALLBACK_ASPECT_RATIO
  const label = imageAlt?.trim() || 'Question figure'

  // Offline and never cached (or a genuinely broken URL): show a bordered
  // placeholder carrying the caption instead of a broken-image box.
  if (failed) {
    return (
      <View style={[s.placeholder, { aspectRatio }]}>
        <Text style={s.placeholderCaption} maxFontSizeMultiplier={1.4}>{label}</Text>
        <Text style={s.placeholderNote} maxFontSizeMultiplier={1.4}>Figure unavailable offline</Text>
      </View>
    )
  }

  return (
    <>
      <Pressable
        accessibilityRole="image"
        accessibilityLabel={label}
        accessibilityHint="Opens the figure full screen"
        onPress={() => setZoomOpen(true)}
        style={s.wrap}
      >
        <Image
          testID="question-figure-image"
          source={{ uri: imageUrl }}
          style={[s.image, { aspectRatio }]}
          contentFit="contain"
          cachePolicy="disk"
          onError={() => setFailed(true)}
        />
        <View {...decorative} style={s.zoomBadge}>
          <Lineicons icon={ExpandArrow1Outlined} size={16} color={t.textInverse} />
        </View>
      </Pressable>

      <Modal
        visible={zoomOpen}
        transparent
        animationType={reduced ? 'none' : 'fade'}
        statusBarTranslucent
        onRequestClose={() => setZoomOpen(false)}
      >
        <View style={s.zoomOverlay} accessibilityViewIsModal accessibilityLabel="Figure viewer">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close figure"
            hitSlop={12}
            style={s.zoomClose}
            onPress={() => setZoomOpen(false)}
          >
            <Lineicons icon={XmarkOutlined} size={20} color={t.textInverse} />
          </Pressable>
          <Image
            accessible
            accessibilityLabel={`${label}, enlarged`}
            source={{ uri: imageUrl }}
            style={s.zoomImage}
            contentFit="contain"
            cachePolicy="disk"
          />
        </View>
      </Modal>
    </>
  )
}

function makeStyles(t: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    wrap: {
      marginBottom: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      overflow: 'hidden',
      alignSelf: 'stretch',
      backgroundColor: t.surface2,
    },
    image: { width: '100%' },
    placeholder: {
      marginBottom: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1.5,
      borderColor: t.border,
      backgroundColor: t.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
      gap: 4,
    },
    placeholderCaption: { ...textStyle('bodySm', t.textSecondary), textAlign: 'center' },
    placeholderNote: { ...textStyle('caption', t.textTertiary), textAlign: 'center' },
    zoomBadge: {
      position: 'absolute', right: spacing.sm, bottom: spacing.sm, width: 32, height: 32,
      borderRadius: radius.pill, backgroundColor: t.scrim, alignItems: 'center', justifyContent: 'center',
    },
    zoomOverlay: {
      flex: 1,
      backgroundColor: t.scrim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    zoomClose: {
      position: 'absolute',
      top: 48,
      right: 20,
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: t.scrimControl,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    zoomImage: { width: '100%', height: '80%' },
  })
}
