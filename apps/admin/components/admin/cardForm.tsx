'use client'

import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { updateCard } from '@/lib/admin/topicsApi'
import { notifySuccess, notifyError } from '@/lib/toast'

export interface CardValues {
  question: string
  answer: string
  explanation: string
}

export type CardErrors = Partial<Record<'question' | 'answer', string>>

/** Question and answer are required; the explanation is optional. */
export function validateCard(v: CardValues): CardErrors {
  const errors: CardErrors = {}
  if (!v.question.trim()) errors.question = 'Enter the question.'
  if (!v.answer.trim()) errors.answer = 'Enter the answer.'
  return errors
}

export const isCardDirty = (a: CardValues, b: CardValues) =>
  a.question !== b.question || a.answer !== b.answer || a.explanation !== b.explanation

const textareaClass = `${controlClass} h-auto py-2 resize-y`

/** The three card fields, wired to their labels and errors. */
export function CardFields({ values, errors, onChange, questionRef }: {
  values: CardValues
  errors: CardErrors
  onChange: (next: CardValues) => void
  /** Pass to the dialog's initialFocusRef so it opens on the question. */
  questionRef?: RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className="space-y-3">
      <Field label="Question" required error={errors.question}>
        {p => (
          <textarea {...p} ref={questionRef} rows={3} value={values.question} placeholder="e.g. What is the quadratic formula?"
            onChange={e => onChange({ ...values, question: e.target.value })} className={textareaClass} />
        )}
      </Field>
      <Field label="Answer" required error={errors.answer}>
        {p => (
          <textarea {...p} rows={3} value={values.answer} placeholder="e.g. x = (-b ± √(b²-4ac)) / 2a"
            onChange={e => onChange({ ...values, answer: e.target.value })} className={textareaClass} />
        )}
      </Field>
      <Field label="Explanation" hint="Optional. Shown after the student answers.">
        {p => (
          <textarea {...p} rows={2} value={values.explanation} placeholder="e.g. Derived from completing the square…"
            onChange={e => onChange({ ...values, explanation: e.target.value })} className={textareaClass} />
        )}
      </Field>
    </div>
  )
}

export interface EditableCard {
  id: string
  question: string
  answer: string
  explanation: string | null
}

/** Edit one card's question, answer and explanation. */
export function EditCardDialog({ card, onClose, onSaved }: {
  card: EditableCard
  onClose: () => void
  onSaved: (saved: EditableCard) => void
}) {
  const initial: CardValues = { question: card.question, answer: card.answer, explanation: card.explanation ?? '' }
  const [values, setValues] = useState(initial)
  const questionRef = useRef<HTMLTextAreaElement>(null)
  const [errors, setErrors] = useState<CardErrors>({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(_e: FormEvent<HTMLFormElement>) {
    if (saving) return
    const found = validateCard(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    setServerError('')
    const payload = { question: values.question.trim(), answer: values.answer.trim(), explanation: values.explanation.trim() || null }
    try {
      const result = await updateCard(card.id, payload)
      if (!result.ok) {
        setServerError(result.error)
        notifyError(result.error)
        return
      }
      notifySuccess('Card saved')
      onSaved({ id: card.id, ...payload })
    } catch {
      setServerError('Network error')
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => { if (!saving) onClose() }}
      title="Edit card"
      initialFocusRef={questionRef}
      onSubmit={handleSubmit}
      dirty={isCardDirty(values, initial)}
      footer={close => (
        <>
          <Button onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>{saving ? 'Saving…' : 'Save card'}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        {serverError && <ErrorBanner title="Couldn’t save the card" message={serverError} />}
        <CardFields values={values} errors={errors} onChange={setValues} questionRef={questionRef} />
      </div>
    </Dialog>
  )
}
