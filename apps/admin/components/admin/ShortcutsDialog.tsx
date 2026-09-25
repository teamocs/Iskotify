'use client'

import { Dialog } from '@/components/ui/Dialog'
import { SHORTCUT_LIST } from '@/lib/nav/shortcuts'
import { Kbd } from '@/components/ui/Kbd'

export function ShortcutList() {
  return (
    <dl className="divide-y divide-subtle">
      {SHORTCUT_LIST.map(s => (
        <div key={s.label} className="flex items-center justify-between gap-4 py-2">
          <dt className="text-ui text-ink">{s.label}</dt>
          <dd className="flex items-center gap-1 text-xs text-ink-muted">
            {s.keys.map((k, i) => (
              <span key={k} className="flex items-center gap-1">
                {i > 0 && <span>then</span>}
                <Kbd>{k}</Kbd>
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" description="Shortcuts work anywhere except while you are typing in a field." size="sm">
      <ShortcutList />
    </Dialog>
  )
}
