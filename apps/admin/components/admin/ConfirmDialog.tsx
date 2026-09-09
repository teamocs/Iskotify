'use client'

interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-[22px] shadow-[0_32px_80px_rgba(0,0,0,0.18)] p-6 max-w-sm w-full mx-4">
        <p className="font-heading font-bold text-[17px] text-ink mb-1">Are you sure?</p>
        <p className="text-sm text-ink-muted mb-6">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-ink hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-[980px] text-sm font-medium bg-danger text-white hover:bg-danger-strong transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
