import { redirect } from 'next/navigation'

// The legacy 6-column flashcard CSV importer has been retired in favor of the
// unified Question Bank importer, which validates every row, supports inline
// error-fixing, preserves passages, and feeds both the UPCAT mock-exam engine and
// the flashcard quiz. Any old link/bookmark lands on the new importer.
export default function LegacyFlashcardImportRedirect() {
  redirect('/admin/upcat/import')
}
