import { DATA_TABLE_CONFIGS } from './dataTables'

/**
 * The /admin/data index: every allow-listed reference table with a human label,
 * a group, and one line on what it feeds. Replaces the 19 raw links that used to
 * sit in the sidebar.
 */

export type DataTableGroup = 'careers' | 'schools' | 'exams' | 'operations'

export const DATA_TABLE_GROUPS: { value: DataTableGroup; label: string }[] = [
  { value: 'careers', label: 'Courses & careers' },
  { value: 'schools', label: 'Universities & rankings' },
  { value: 'exams', label: 'Exams & knowledge' },
  { value: 'operations', label: 'Operations' },
]

// Sentence-case labels (the configs use Title Case for form headers) plus a
// description for tables whose config has no helpText.
const META: Record<string, { label: string; group: DataTableGroup; description?: string }> = {
  career_courses: { label: 'Career courses', group: 'careers', description: 'Course profiles (duration, board exam, demand) behind the Courses tab.' },
  career_facts: { label: 'Career facts', group: 'careers', description: 'Quick answers and caveats shown on course detail pages.' },
  ai_career_impact: { label: 'AI career impact', group: 'careers', description: 'Automation risk and outlook for each course.' },
  career_destinations: { label: 'Career destinations', group: 'careers', description: 'Countries, salaries and visa pathways per course.' },
  career_countries: { label: 'Career countries', group: 'careers', description: 'Country profiles referenced by career destinations.' },
  career_programs: { label: 'Career programs', group: 'careers', description: 'Overseas work and migration programs by course.' },
  course_taxonomy_map: { label: 'Course taxonomy map', group: 'careers' },
  tertiary_schools: { label: 'Tertiary schools', group: 'schools' },
  university_profiles: { label: 'University profiles', group: 'schools' },
  course_school_rankings: { label: 'Course rankings', group: 'schools' },
  course_school_quality: { label: 'Course quality', group: 'schools' },
  bar_results: { label: 'Bar results', group: 'schools', description: 'Bar exam pass rates per school and year.' },
  upcat_cutoffs: { label: 'UPCAT cutoffs', group: 'exams', description: 'Historical campus and program cutoffs used by the Estimated Admission Score.' },
  upcat_facts: { label: 'UPCAT facts', group: 'exams', description: 'Question-and-answer facts about the UPCAT shown in the app.' },
  upcat_passages: { label: 'UPCAT passages', group: 'exams' },
  exam_skill_categories: { label: 'Skill categories', group: 'exams' },
  exam_blueprint_sections: { label: 'Blueprint sections', group: 'exams' },
  exam_course_notes: { label: 'Blueprint notes', group: 'exams' },
  admissions_updates: { label: 'Admissions updates (raw table)', group: 'operations' },
}

export interface DataTableIndexEntry { table: string; label: string; group: DataTableGroup; description: string; href: string }

export const DATA_TABLE_INDEX: DataTableIndexEntry[] = DATA_TABLE_CONFIGS.map(c => {
  const meta = META[c.table]
  return {
    table: c.table,
    label: meta?.label ?? c.label,
    group: meta?.group ?? 'operations',
    description: meta?.description ?? c.helpText ?? c.label,
    href: `/admin/data/${c.table}`,
  }
})
