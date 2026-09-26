import { Button } from '../../ui/Button'

interface Labels {
  back?: string
  skip?: string
  next?: string
  review?: string
}

interface Props {
  isLast: boolean
  canGoBack: boolean
  /** The current question has an answer (Next stays disabled until it does). */
  answered: boolean
  /** submit() is in flight — every control goes inert. */
  submitting?: boolean
  onBack: () => void
  onSkip: () => void
  onNext: () => void
  /** Opens the review sheet. The last question never submits directly. */
  onReview: () => void
  /** Spoken names, when a runner wants fuller ones than the visible words. */
  labels?: Labels
}

/**
 * The runner footer: Back · Skip · Next, or Back · Review & submit on the
 * last question. Sized by content except the one primary action, which takes
 * the rest of the (capped) reading column.
 */
export function RunnerActions({
  isLast, canGoBack, answered, submitting = false, onBack, onSkip, onNext, onReview, labels,
}: Props) {
  return (
    <>
      <Button
        label="Back"
        variant="secondary"
        accessibilityLabel={labels?.back}
        disabled={!canGoBack || submitting}
        onPress={onBack}
      />
      {isLast ? (
        <Button
          label="Review & submit"
          accessibilityLabel={labels?.review}
          disabled={submitting}
          onPress={onReview}
          style={{ flexGrow: 1 }}
        />
      ) : (
        <>
          <Button label="Skip" variant="ghost" accessibilityLabel={labels?.skip} disabled={submitting} onPress={onSkip} />
          <Button
            label="Next"
            accessibilityLabel={labels?.next}
            disabled={!answered || submitting}
            onPress={onNext}
            style={{ flexGrow: 1 }}
          />
        </>
      )}
    </>
  )
}
