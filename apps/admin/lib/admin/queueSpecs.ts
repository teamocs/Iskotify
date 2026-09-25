/**
 * The three moderation queues (reported questions, bug reports, feedback) as
 * data: which table columns sort, which filters exist and what each allowed
 * value means in the database. The list routes allow-list against these, and
 * the queue pages read the same ids from the URL, so the two cannot drift.
 * Pure: safe to import from client and server code.
 */

import type { SortState, TableStateOptions } from '@/lib/table/tableState'
import { REVIEW_STATUSES } from './bulkStatus'

/** Rows per page on every queue. */
export const QUEUE_PAGE_SIZE = 50

/** One allowed filter value, as the database condition it stands for. */
export type QueueCondition =
  | { op: 'eq'; column: string; value: string | number }
  | { op: 'ilike'; column: string; pattern: string }
  | { op: 'is'; column: string; value: null }
  | { op: 'or'; filter: string }

export interface QueueSpec {
  table: string
  /** Table column id (as in the URL) → database column. Insertion order is the column order. */
  sorts: Record<string, string>
  defaultSort: SortState
  /** Columns the search box matches (case-insensitive substring, any of them). */
  search: string[]
  /** Filter id → allowed value → condition. Anything else is rejected. */
  filters: Record<string, Record<string, QueueCondition>>
}

const statusFilter: Record<string, QueueCondition> = Object.fromEntries(
  REVIEW_STATUSES.map(s => [s, { op: 'eq', column: 'status', value: s }]),
)

/** The reasons the mobile app offers (ReportQuestionModal); details follow after " — ". */
export const PRESET_REASONS = ['Wrong answer', 'Typo or formatting issue', 'Question is unclear'] as const

export const REPORTS_QUEUE: QueueSpec = {
  table: 'question_reports',
  sorts: { question: 'question_text', source: 'source_table', reason: 'reason', status: 'status', reported: 'created_at' },
  defaultSort: { id: 'reported', dir: 'desc' },
  search: ['question_text', 'reason', 'question_id'],
  filters: {
    status: statusFilter,
    reason: {
      ...Object.fromEntries(PRESET_REASONS.map(r => [r, { op: 'ilike', column: 'reason', pattern: `${r}%` }])),
      other: {
        op: 'or',
        filter: `reason.is.null,and(${PRESET_REASONS.map(r => `reason.not.ilike."${r}%"`).join(',')})`,
      },
    },
    source: {
      flashcards: { op: 'eq', column: 'source_table', value: 'flashcards' },
      upcat_questions: { op: 'eq', column: 'source_table', value: 'upcat_questions' },
    },
  },
}

export const APP_REPORTS_QUEUE: QueueSpec = {
  table: 'app_bug_reports',
  sorts: { screen: 'screen', device: 'platform', status: 'status', reported: 'created_at' },
  defaultSort: { id: 'reported', dir: 'desc' },
  search: ['screen', 'description', 'app_version', 'platform'],
  filters: {
    status: statusFilter,
    platform: {
      android: { op: 'ilike', column: 'platform', pattern: 'android' },
      ios: { op: 'ilike', column: 'platform', pattern: 'ios' },
      other: { op: 'or', filter: 'platform.is.null,and(platform.not.ilike.android,platform.not.ilike.ios)' },
    },
  },
}

export const FEEDBACK_QUEUE: QueueSpec = {
  table: 'app_feedback',
  sorts: { rating: 'rating', status: 'status', submitted: 'created_at' },
  defaultSort: { id: 'submitted', dir: 'desc' },
  search: ['message'],
  filters: {
    status: statusFilter,
    rating: {
      ...Object.fromEntries([1, 2, 3, 4, 5].map(n => [String(n), { op: 'eq', column: 'rating', value: n }])),
      none: { op: 'is', column: 'rating', value: null },
    },
  },
}

/** The DataTable URL-state options for a queue: the same ids its route allow-lists. */
export function queueTableOptions(spec: QueueSpec): TableStateOptions & { sortable: string[]; filters: string[]; defaultSort: SortState } {
  return { sortable: Object.keys(spec.sorts), filters: Object.keys(spec.filters), defaultSort: spec.defaultSort }
}
