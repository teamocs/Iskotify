import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { exportRowsResponse } from '@/lib/dataTables/exportResponse'
import type { DataTableConfig } from '@/lib/dataTables'

export const runtime = 'nodejs'

// Raw flashcards schema (mirrors the mobile sync select).
const FLASHCARDS_EXPORT: DataTableConfig = {
  table: 'flashcards',
  label: 'Flashcards',
  idColumn: 'id',
  idType: 'uuid',
  searchColumns: [],
  columns: [
    { name: 'id', label: 'ID', type: 'text' },
    { name: 'topic_id', label: 'Topic ID', type: 'text' },
    { name: 'question', label: 'Question', type: 'textarea' },
    { name: 'answer', label: 'Answer', type: 'textarea' },
    { name: 'explanation', label: 'Explanation', type: 'textarea' },
    { name: 'listing_slugs', label: 'Listing Slugs', type: 'json' },
    { name: 'options', label: 'Options', type: 'json' },
    { name: 'correct_answer_index', label: 'Correct Answer Index', type: 'number' },
    { name: 'ai_options', label: 'AI Options', type: 'json' },
    { name: 'ai_correct_index', label: 'AI Correct Index', type: 'number' },
    { name: 'ai_explanation', label: 'AI Explanation', type: 'textarea' },
    { name: 'ai_enhanced_at', label: 'AI Enhanced At', type: 'text' },
    { name: 'status', label: 'Status', type: 'text' },
    { name: 'ext_id', label: 'Ext ID', type: 'text' },
  ],
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const format = new URL(req.url).searchParams.get('format') === 'json' ? 'json' : 'csv'
  return exportRowsResponse(gate.supabase, 'flashcards', 'id', FLASHCARDS_EXPORT, format)
}
