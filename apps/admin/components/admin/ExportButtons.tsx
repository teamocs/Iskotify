'use client'

import { buttonClass } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

interface Props {
  /** Export route base, e.g. "/api/admin/listings/export". `?format=` is appended. */
  baseHref: string
}

// CSV / JSON download links for bespoke pages whose table isn't in the generic
// Data Manager (listings, flashcards, upcat_questions). Browser streams the file.
export function ExportButtons({ baseHref }: Props) {
  const cls = buttonClass({ variant: 'ghost', size: 'sm' })
  return (
    <div className="flex items-center gap-1">
      <a href={`${baseHref}?format=csv`} className={cls}><Icon name="download" />CSV</a>
      <a href={`${baseHref}?format=json`} className={cls}><Icon name="download" />JSON</a>
    </div>
  )
}
