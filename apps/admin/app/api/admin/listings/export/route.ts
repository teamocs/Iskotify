import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { exportRowsResponse } from '@/lib/dataTables/exportResponse'
import type { DataTableConfig } from '@/lib/dataTables'

export const runtime = 'nodejs'

// Column order/types for the listings export CSV (array/jsonb → JSON-in-cell).
const LISTINGS_EXPORT: DataTableConfig = {
  table: 'listings',
  label: 'Listings',
  idColumn: 'id',
  idType: 'uuid',
  searchColumns: [],
  columns: [
    { name: 'id', label: 'ID', type: 'text' },
    { name: 'type', label: 'Type', type: 'text' },
    { name: 'title', label: 'Title', type: 'text' },
    { name: 'slug', label: 'Slug', type: 'text' },
    { name: 'provider', label: 'Provider', type: 'text' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'requirements', label: 'Requirements', type: 'json' },
    { name: 'coverage', label: 'Coverage', type: 'text' },
    { name: 'deadline', label: 'Deadline', type: 'text' },
    { name: 'exam_date', label: 'Exam Date', type: 'text' },
    { name: 'results_date', label: 'Results Date', type: 'text' },
    { name: 'events', label: 'Events', type: 'json' },
    { name: 'target_courses', label: 'Target Courses', type: 'json' },
    { name: 'target_year_levels', label: 'Target Year Levels', type: 'json' },
    { name: 'tags', label: 'Tags', type: 'json' },
    { name: 'status', label: 'Status', type: 'text' },
    { name: 'region', label: 'Region', type: 'text' },
    { name: 'grant_amount', label: 'Grant Amount', type: 'number' },
    { name: 'external_url', label: 'External URL', type: 'text' },
    { name: 'image_url', label: 'Image URL', type: 'text' },
    { name: 'province', label: 'Province', type: 'text' },
    { name: 'city', label: 'City', type: 'text' },
    { name: 'scope', label: 'Scope', type: 'text' },
    { name: 'is_verified', label: 'Is Verified', type: 'boolean' },
    { name: 'income_ceiling', label: 'Income Ceiling', type: 'number' },
    { name: 'gwa_requirement', label: 'GWA Requirement', type: 'number' },
    { name: 'monthly_stipend', label: 'Monthly Stipend', type: 'number' },
    { name: 'service_obligation_years', label: 'Service Obligation Years', type: 'number' },
    { name: 'has_entrance_exam', label: 'Has Entrance Exam', type: 'boolean' },
    { name: 'application_window', label: 'Application Window', type: 'text' },
    { name: 'scholarship_meta', label: 'Scholarship Meta', type: 'json' },
    { name: 'target_courses_source', label: 'Target Courses Source', type: 'text' },
  ],
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const format = new URL(req.url).searchParams.get('format') === 'json' ? 'json' : 'csv'
  return exportRowsResponse(gate.supabase, 'listings', 'id', LISTINGS_EXPORT, format)
}
