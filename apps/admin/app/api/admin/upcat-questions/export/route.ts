import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { exportRowsResponse } from '@/lib/dataTables/exportResponse'
import type { DataTableConfig } from '@/lib/dataTables'

export const runtime = 'nodejs'

// Raw upcat_questions schema (correct_index is 0-3) — this is the backup/round-trip
// shape, NOT the authoring CSV (option_a..d + letter answer) used by the importer.
const UPCAT_QUESTIONS_EXPORT: DataTableConfig = {
  table: 'upcat_questions',
  label: 'UPCAT Questions',
  idColumn: 'question_id',
  idType: 'text',
  searchColumns: [],
  columns: [
    { name: 'question_id', label: 'Question ID', type: 'text' },
    { name: 'subtest', label: 'Subtest', type: 'text' },
    { name: 'main_subject', label: 'Main Subject', type: 'text' },
    { name: 'topic', label: 'Topic', type: 'text' },
    { name: 'subtopic', label: 'Subtopic', type: 'text' },
    { name: 'question_format', label: 'Question Format', type: 'text' },
    { name: 'cognitive_level', label: 'Cognitive Level', type: 'text' },
    { name: 'difficulty', label: 'Difficulty', type: 'text' },
    { name: 'curriculum_alignment', label: 'Curriculum Alignment', type: 'text' },
    { name: 'question_text', label: 'Question Text', type: 'textarea' },
    { name: 'options', label: 'Options', type: 'json' },
    { name: 'correct_index', label: 'Correct Index (0-3)', type: 'number' },
    { name: 'explanation', label: 'Explanation', type: 'textarea' },
    { name: 'set_id', label: 'Set ID', type: 'text' },
    { name: 'set_position', label: 'Set Position', type: 'number' },
    { name: 'has_visual', label: 'Has Visual', type: 'boolean' },
    { name: 'status', label: 'Status', type: 'text' },
    { name: 'skill_category', label: 'Skill Category', type: 'text' },
  ],
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const format = new URL(req.url).searchParams.get('format') === 'json' ? 'json' : 'csv'
  return exportRowsResponse(gate.supabase, 'upcat_questions', 'question_id', UPCAT_QUESTIONS_EXPORT, format)
}
