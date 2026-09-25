'use client'

import { useRef } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'

interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
  /** Label for the confirming button. Defaults to "Delete". */
  confirmLabel?: string
  /** Visual tone of the confirm button. Defaults to "danger". */
  tone?: 'danger' | 'default'
}

/**
 * "Are you sure?" before a destructive action. Built on Dialog, so it shares
 * the modal contract: Cancel is focused first (a stray Enter never destroys
 * anything), Tab is trapped, Escape and the scrim cancel, focus is restored.
 */
export function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Delete', tone = 'danger' }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open
      onClose={onCancel}
      role="alertdialog"
      size="sm"
      title="Are you sure?"
      description={message}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={onCancel}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}
