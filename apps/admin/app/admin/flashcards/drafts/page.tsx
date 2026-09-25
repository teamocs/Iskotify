import Link from 'next/link'
import { Topbar } from '@/components/admin/Topbar'
import { DraftsTable } from '@/components/flashcards/DraftsTable'
import { PageBody } from '@/components/ui/Page'
import { buttonClass } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

export default function DraftsPage() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar
        title="Drafts"
        actions={
          <Link href="/admin/upcat/import" className={buttonClass({ size: 'sm' })}>
            <Icon name="upload" />
            Import CSV
          </Link>
        }
      />
      <PageBody
        width="wide"
        intro="Every unpublished topic, from any source. Select topics and publish them with exam or scholarship tags to ship their cards to the mobile app."
      >
        <DraftsTable />
      </PageBody>
    </div>
  )
}
