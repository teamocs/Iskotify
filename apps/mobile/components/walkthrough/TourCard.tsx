import { forwardRef } from 'react'
import { Text, View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ArrowRightOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { Button } from '../ui/Button'
import { heading } from '../ui/a11y'
import type { TourCard as TourCardData } from './tourFlow'

interface Props {
  card: TourCardData
  /** First line override (the welcome card greets the student by name). */
  lead?: string
  onTakeMeThere?: () => void
}

/**
 * The words of one tour card: the title as the page's only level-1 heading
 * (it changes with the card), two short lines, and on the tab cards a quiet
 * "Take me there" whose accessible name says where.
 */
export const TourCard = forwardRef<Text, Props>(function TourCard({ card, lead, onTakeMeThere }, ref) {
  const { theme: t } = useTheme()
  return (
    <View style={{ gap: spacing.md }}>
      <Text ref={ref} {...heading(1)} style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.6}>
        {card.title}
      </Text>
      <View style={{ gap: spacing.xs }}>
        <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>{lead ?? card.body[0]}</Text>
        <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>{card.body[1]}</Text>
      </View>
      {card.href && card.tabLabel && onTakeMeThere ? (
        <Button
          label="Take me there"
          accessibilityLabel={`Take me to ${card.tabLabel}`}
          variant="ghost"
          size="sm"
          onPress={onTakeMeThere}
          icon={<Lineicons icon={ArrowRightOutlined} size={16} color={t.accentText} />}
          style={{ marginLeft: -spacing.lg, flexDirection: 'row-reverse' }}
        />
      ) : null}
    </View>
  )
})
