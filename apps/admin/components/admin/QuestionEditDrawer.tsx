'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/components/ui/Drawer'
import { Field, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { apiRequest } from '@/lib/apiRequest'
import { notifyError, notifySuccess } from '@/lib/toast'
import {
  MIN_OPTIONS, isDraftDirty, questionPatch, validateQuestionDraft,
  type QuestionDraft, type QuestionErrors,
} from '@/lib/admin/reviewQueue'

export interface EditableQuestion extends QuestionDraft {
  question_id: string
}

const letter = (i: number) => String.fromCharCode(65 + i)

/**
 * Edit a Question Bank item's text, options and correct answer in place.
 * Saves only the changed fields through PATCH /api/upcat-questions/[id].
 */
export function QuestionEditDrawer({ question, onClose, onSaved }: {
  question: EditableQuestion
  onClose: () => void
  onSaved?: () => void
}) {
  const router = useRouter()
  const uid = useId()
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [initial] = useState<QuestionDraft>(() => {
    const options = [...question.options]
    while (options.length < MIN_OPTIONS) options.push('')
    return { question_text: question.question_text, options, correct_index: question.correct_index }
  })
  const [draft, setDraft] = useState<QuestionDraft>(initial)
  const [errors, setErrors] = useState<QuestionErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = isDraftDirty(initial, draft)

  function setOption(i: number, value: string) {
    setDraft(d => ({ ...d, options: d.options.map((o, j) => (j === i ? value : o)) }))
  }

  async function handleSubmit() {
    const found = validateQuestionDraft(draft)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) return
    const patch = questionPatch(initial, draft)
    if (Object.keys(patch).length === 0) { onClose(); return }

    setSaving(true)
    const result = await apiRequest(`/api/upcat-questions/${encodeURIComponent(question.question_id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setSaving(false)
    if (!result.ok) {
      setServerError(result.error)
      notifyError(result.error)
      return
    }
    notifySuccess(`Question ${question.question_id} saved`)
    onSaved?.()
    onClose()
    router.refresh()
  }

  const radioErrorId = `${uid}-correct-error`

  return (
    <Drawer
      open
      width="lg"
      onClose={onClose}
      title={`Edit question ${question.question_id}`}
      description="Rewrite weak options by hand. Saving updates the Question Bank; the flag clears if the options now pass."
      initialFocusRef={textRef}
      dirty={dirty}
      onSubmit={handleSubmit}
      footer={close => (
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        {serverError && <ErrorBanner title="Couldn’t save the question" message={serverError} />}

        <Field label="Question text" required error={errors.question_text}>
          {p => (
            <textarea
              {...p}
              ref={textRef}
              rows={4}
              value={draft.question_text}
              onChange={e => setDraft(d => ({ ...d, question_text: e.target.value }))}
              className={`${controlClass} h-auto py-2`}
            />
          )}
        </Field>

        {draft.options.map((opt, i) => (
          <Field key={i} label={`Option ${letter(i)}`} required error={errors[`option_${i}`]}>
            {p => (
              <input
                {...p}
                type="text"
                value={opt}
                onChange={e => setOption(i, e.target.value)}
                className={controlClass}
              />
            )}
          </Field>
        ))}

        <fieldset aria-describedby={errors.correct_index ? radioErrorId : undefined} className="space-y-1.5">
          <legend className="text-ui font-medium text-ink">
            Correct answer
            <span aria-hidden="true" className="ml-0.5 text-danger">*</span>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {draft.options.slice(0, 4).map((opt, i) => (
              <label key={i} className="flex items-center gap-1.5 text-ui text-ink">
                <input
                  type="radio"
                  name={`${uid}-correct`}
                  value={String(i)}
                  checked={draft.correct_index === i}
                  onChange={() => setDraft(d => ({ ...d, correct_index: i }))}
                  className="h-4 w-4 accent-maroon"
                />
                <span>
                  {letter(i)}
                  <span className="sr-only">{opt ? `: ${opt}` : ''}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.correct_index && (
            <p id={radioErrorId} role="alert" className="text-xs font-medium text-danger">{errors.correct_index}</p>
          )}
        </fieldset>
      </div>
    </Drawer>
  )
}
