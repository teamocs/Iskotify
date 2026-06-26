// Allowlist config for the generic Data Manager.
// Column lists derived from apps/mobile/services/sync.ts pull selects (authoritative).
// updated_at is excluded (auto-managed); it is added server-side on PATCH.

export interface DataTableColumnConfig {
  name: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'json' | 'textarea'
  required?: boolean
}

export interface DataTableConfig {
  table: string
  label: string
  idColumn: string
  idType: 'text' | 'uuid' | 'int'
  searchColumns: string[]
  columns: DataTableColumnConfig[]
  /** One-line description of what this table feeds in the mobile app (shown in the
   *  per-page help pill + the /admin/guide reference). */
  helpText?: string
}

export const DATA_TABLE_CONFIGS: DataTableConfig[] = [
  // ── Career tables ──────────────────────────────────────────────────────────

  {
    table: 'career_courses',
    label: 'Career Courses',
    idColumn: 'course_id',
    idType: 'text',
    searchColumns: ['course_id', 'name', 'cluster'],
    columns: [
      { name: 'course_id', label: 'Course ID', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text' },
      { name: 'cluster', label: 'Cluster', type: 'text' },
      { name: 'career_tag', label: 'Career Tag', type: 'text' },
      { name: 'demand', label: 'Demand', type: 'text' },
      { name: 'board_exam', label: 'Board Exam', type: 'boolean' },
      { name: 'board_exam_name', label: 'Board Exam Name', type: 'text' },
      { name: 'duration_years', label: 'Duration (years)', type: 'number' },
      { name: 'top_countries', label: 'Top Countries (JSON array)', type: 'json' },
      { name: 'summary', label: 'Summary', type: 'textarea' },
      { name: 'student_tip', label: 'Student Tip', type: 'textarea' },
      { name: 'ai_note', label: 'AI Note', type: 'textarea' },
    ],
  },

  {
    table: 'career_facts',
    label: 'Career Facts',
    idColumn: 'id',
    idType: 'uuid',
    searchColumns: ['course_name', 'query_type'],
    columns: [
      { name: 'course_id', label: 'Course ID', type: 'text' },
      { name: 'query_type', label: 'Query Type', type: 'text' },
      { name: 'course_name', label: 'Course Name', type: 'text' },
      { name: 'quick_answer', label: 'Quick Answer', type: 'textarea' },
      { name: 'key_caveat', label: 'Key Caveat', type: 'textarea' },
      { name: 'point_to', label: 'Point To', type: 'text' },
    ],
  },

  {
    table: 'ai_career_impact',
    label: 'AI Career Impact',
    idColumn: 'course_id',
    idType: 'text',
    searchColumns: ['course_id', 'course_name', 'cluster'],
    columns: [
      { name: 'course_id', label: 'Course ID', type: 'text', required: true },
      { name: 'course_name', label: 'Course Name', type: 'text' },
      { name: 'cluster', label: 'Cluster', type: 'text' },
      { name: 'board_exam', label: 'Board Exam', type: 'boolean' },
      { name: 'board_exam_name', label: 'Board Exam Name', type: 'text' },
      { name: 'automation_risk_low', label: 'Automation Risk Low (%)', type: 'number' },
      { name: 'automation_risk_high', label: 'Automation Risk High (%)', type: 'number' },
      { name: 'ai_safety_score', label: 'AI Safety Score', type: 'number' },
      { name: 'ai_safety_label', label: 'AI Safety Label', type: 'text' },
      { name: 'color_code', label: 'Color Code', type: 'text' },
      { name: 'what_ai_takes_over', label: 'What AI Takes Over (JSON array)', type: 'json' },
      { name: 'what_stays_human', label: 'What Stays Human (JSON array)', type: 'json' },
      { name: 'new_jobs_emerging', label: 'New Jobs Emerging (JSON array)', type: 'json' },
      { name: 'skills_to_develop', label: 'Skills to Develop (JSON array)', type: 'json' },
      { name: 'career_outlook_2030', label: 'Career Outlook 2030', type: 'textarea' },
      { name: 'key_stat', label: 'Key Stat', type: 'text' },
      { name: 'key_source', label: 'Key Source', type: 'text' },
      { name: 'key_quote', label: 'Key Quote', type: 'textarea' },
      { name: 'quote_by', label: 'Quote By', type: 'text' },
      { name: 'ph_advantage', label: 'PH Advantage', type: 'textarea' },
      { name: 'ph_notes', label: 'PH Notes', type: 'textarea' },
      { name: 'kuya_baw_summary', label: 'Kuya Baw Summary', type: 'textarea' },
      { name: 'last_updated', label: 'Last Updated', type: 'text' },
    ],
  },

  {
    table: 'career_destinations',
    label: 'Career Destinations',
    idColumn: 'id',
    idType: 'uuid',
    searchColumns: ['course_id', 'country'],
    columns: [
      { name: 'course_id', label: 'Course ID', type: 'text' },
      { name: 'country', label: 'Country', type: 'text' },
      { name: 'demand_rating', label: 'Demand Rating', type: 'text' },
      { name: 'salary_min', label: 'Salary Min', type: 'number' },
      { name: 'salary_max', label: 'Salary Max', type: 'number' },
      { name: 'salary_local', label: 'Salary Local', type: 'text' },
      { name: 'salary_type', label: 'Salary Type', type: 'text' },
      { name: 'visa_pathway', label: 'Visa Pathway', type: 'text' },
      { name: 'pr_pathway', label: 'PR Pathway', type: 'text' },
      { name: 'credential', label: 'Credential', type: 'text' },
      { name: 'licensing_exam', label: 'Licensing Exam', type: 'text' },
      { name: 'language_required', label: 'Language Required', type: 'text' },
      { name: 'timeline_months', label: 'Timeline (months)', type: 'number' },
      { name: 'program_name', label: 'Program Name', type: 'text' },
      { name: 'specializations', label: 'Specializations (JSON array)', type: 'json' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
      { name: 'saturation_warning', label: 'Saturation Warning', type: 'text' },
      { name: 'source', label: 'Source', type: 'text' },
    ],
  },

  {
    table: 'career_countries',
    label: 'Career Countries',
    idColumn: 'code',
    idType: 'text',
    searchColumns: ['code', 'name', 'region'],
    columns: [
      { name: 'code', label: 'Country Code', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text' },
      { name: 'region', label: 'Region', type: 'text' },
      { name: 'immigration_system', label: 'Immigration System', type: 'text' },
      { name: 'why_demand', label: 'Why Demand', type: 'textarea' },
      { name: 'language_required', label: 'Language Required', type: 'text' },
      { name: 'pr_pathway', label: 'PR Pathway', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },

  {
    table: 'career_programs',
    label: 'Career Programs',
    idColumn: 'id',
    idType: 'uuid',
    searchColumns: ['name', 'country_region'],
    columns: [
      { name: 'name', label: 'Name', type: 'text' },
      { name: 'country_region', label: 'Country/Region', type: 'text' },
      { name: 'courses_covered', label: 'Courses Covered (JSON array)', type: 'json' },
      { name: 'managing_body', label: 'Managing Body', type: 'text' },
      { name: 'slots', label: 'Slots', type: 'number' },
      { name: 'requirements', label: 'Requirements', type: 'textarea' },
      { name: 'immigration_outcome', label: 'Immigration Outcome', type: 'text' },
      { name: 'website', label: 'Website', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },

  // ── University / school tables ─────────────────────────────────────────────

  {
    table: 'tertiary_schools',
    label: 'Tertiary Schools',
    idColumn: 'id',
    idType: 'text',
    searchColumns: ['name', 'acronym', 'region'],
    helpText: 'Colleges/universities shown in the app’s Universities directory and school detail pages. id is a stable text slug (e.g. "university-of-the-philippines-diliman").',
    columns: [
      { name: 'id', label: 'ID (slug)', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'acronym', label: 'Acronym', type: 'text' },
      { name: 'region', label: 'Region', type: 'text' },
      { name: 'province', label: 'Province', type: 'text' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'type', label: 'Type', type: 'text' },
      { name: 'is_suc', label: 'Is SUC', type: 'boolean' },
      { name: 'is_luc', label: 'Is LUC', type: 'boolean' },
      { name: 'deped_school_id', label: 'DepEd School ID', type: 'text' },
      { name: 'rank_in_province', label: 'Rank in Province', type: 'number' },
    ],
  },

  {
    table: 'university_profiles',
    label: 'University Profiles',
    idColumn: 'school_id',
    idType: 'text',
    searchColumns: ['school_id'],
    helpText: 'Rich profile (entrance exam, tuition, courses, accreditation) for each tertiary_schools row, shown on school detail pages. school_id must match a tertiary_schools.id.',
    columns: [
      { name: 'school_id', label: 'School ID (FK → tertiary_schools.id)', type: 'text', required: true },
      { name: 'data_tier', label: 'Data Tier', type: 'text' },
      { name: 'institution_type', label: 'Institution Type', type: 'text' },
      { name: 'year_established', label: 'Year Established', type: 'number' },
      { name: 'known_for_courses', label: 'Known For Courses (JSON array)', type: 'json' },
      { name: 'prc_top_courses', label: 'PRC Top Courses (JSON array)', type: 'json' },
      { name: 'ched_coe_cod', label: 'CHED COE/COD', type: 'text' },
      { name: 'accreditation', label: 'Accreditation', type: 'text' },
      { name: 'entrance_exam_name', label: 'Entrance Exam Name', type: 'text' },
      { name: 'entrance_exam_acronym', label: 'Entrance Exam Acronym', type: 'text' },
      { name: 'testing_center_type', label: 'Testing Center Type', type: 'text' },
      { name: 'application_open', label: 'Application Open', type: 'text' },
      { name: 'application_close', label: 'Application Close', type: 'text' },
      { name: 'exam_month', label: 'Exam Month', type: 'text' },
      { name: 'estimated_passing_rate', label: 'Estimated Passing Rate', type: 'number' },
      { name: 'estimated_slots', label: 'Estimated Slots', type: 'number' },
      { name: 'tuition_fee_range', label: 'Tuition Fee Range', type: 'text' },
      { name: 'free_tuition', label: 'Free Tuition', type: 'boolean' },
      { name: 'academic_calendar', label: 'Academic Calendar', type: 'text' },
      { name: 'courses_offered', label: 'Courses Offered (JSON array)', type: 'json' },
      { name: 'scholarships_offered', label: 'Scholarships Offered (JSON array)', type: 'json' },
      { name: 'website_url', label: 'Website URL', type: 'text' },
      { name: 'application_portal_url', label: 'Application Portal URL', type: 'text' },
      { name: 'facebook_url', label: 'Facebook URL', type: 'text' },
      { name: 'exam_difficulty', label: 'Exam Difficulty', type: 'text' },
      { name: 'notable_programs', label: 'Notable Programs (JSON array)', type: 'json' },
      { name: 'prc_strong_boards', label: 'PRC Strong Boards (JSON array)', type: 'json' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
      { name: 'data_confidence', label: 'Data Confidence', type: 'text' },
    ],
  },

  {
    table: 'course_school_rankings',
    label: 'Course School Rankings',
    idColumn: 'id',
    idType: 'text',
    searchColumns: ['school_name', 'course_name', 'region'],
    helpText: 'Per-board-exam school rankings (Wilson score) powering the "top schools by course" lists. id is a stable text key.',
    columns: [
      { name: 'id', label: 'ID', type: 'text', required: true },
      { name: 'course_tab', label: 'Course Tab', type: 'text' },
      { name: 'course_name', label: 'Course Name', type: 'text' },
      { name: 'rank', label: 'Rank', type: 'number' },
      { name: 'school_name', label: 'School Name', type: 'text', required: true },
      { name: 'region', label: 'Region', type: 'text' },
      { name: 'province', label: 'Province', type: 'text' },
      { name: 'wilson_score', label: 'Wilson Score', type: 'number' },
      { name: 'raw_pass_rate', label: 'Raw Pass Rate', type: 'number' },
      { name: 'total_examinees', label: 'Total Examinees', type: 'number' },
      { name: 'total_passers', label: 'Total Passers', type: 'number' },
      { name: 'years_with_data', label: 'Years With Data', type: 'number' },
      { name: 'exam_periods', label: 'Exam Periods', type: 'text' },
      { name: 'tertiary_school_id', label: 'Tertiary School ID', type: 'text' },
    ],
  },

  {
    table: 'course_school_quality',
    label: 'Course School Quality',
    idColumn: 'id',
    idType: 'text',
    searchColumns: ['school_name', 'course_standardized', 'region'],
    helpText: 'Per-course school quality scores/tiers used to rank non-board programs. id is a stable text key.',
    columns: [
      { name: 'id', label: 'ID', type: 'text', required: true },
      { name: 'school_name', label: 'School Name', type: 'text', required: true },
      { name: 'region', label: 'Region', type: 'text' },
      { name: 'province', label: 'Province', type: 'text' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'course_standardized', label: 'Course Standardized', type: 'text' },
      { name: 'course_group', label: 'Course Group', type: 'text' },
      { name: 'school_type', label: 'School Type', type: 'text' },
      { name: 'ched_coe_cod', label: 'CHED COE/COD', type: 'text' },
      { name: 'quality_score', label: 'Quality Score', type: 'number' },
      { name: 'quality_tier', label: 'Quality Tier', type: 'text' },
      { name: 'accreditations', label: 'Accreditations (JSON array)', type: 'json' },
      { name: 'has_prc_board', label: 'Has PRC Board', type: 'boolean' },
      { name: 'qs_subject_rank', label: 'QS Subject Rank', type: 'number' },
      { name: 'data_confidence', label: 'Data Confidence', type: 'text' },
      { name: 'tertiary_school_id', label: 'Tertiary School ID', type: 'text' },
    ],
  },

  // ── UPCAT tables ───────────────────────────────────────────────────────────

  {
    table: 'bar_results',
    label: 'Bar Results',
    idColumn: 'id',
    idType: 'uuid',
    searchColumns: ['school_name', 'region'],
    columns: [
      { name: 'school_name', label: 'School Name', type: 'text', required: true },
      { name: 'region', label: 'Region', type: 'text' },
      { name: 'province', label: 'Province', type: 'text' },
      { name: 'year', label: 'Year', type: 'number' },
      { name: 'pass_rate', label: 'Pass Rate (%)', type: 'number' },
      { name: 'national_avg', label: 'National Average (%)', type: 'number' },
      { name: 'sc_rank', label: 'SC Rank', type: 'number' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },

  {
    table: 'upcat_cutoffs',
    label: 'UPCAT Cutoffs',
    idColumn: 'id',
    idType: 'uuid',
    searchColumns: ['campus', 'program'],
    columns: [
      { name: 'campus', label: 'Campus', type: 'text', required: true },
      { name: 'program', label: 'Program', type: 'text' },
      { name: 'cutoff', label: 'Cutoff', type: 'number' },
      { name: 'year', label: 'Year', type: 'number' },
      { name: 'is_estimate', label: 'Is Estimate', type: 'boolean' },
    ],
  },

  {
    table: 'upcat_facts',
    label: 'UPCAT Facts',
    idColumn: 'id',
    idType: 'uuid',
    searchColumns: ['topic', 'question'],
    columns: [
      { name: 'topic', label: 'Topic', type: 'text' },
      { name: 'question', label: 'Question', type: 'textarea', required: true },
      { name: 'answer', label: 'Answer', type: 'textarea', required: true },
      { name: 'source', label: 'Source', type: 'text' },
      { name: 'valid_year', label: 'Valid Year', type: 'number' },
    ],
  },

  // ── Admissions / operations ────────────────────────────────────────────────

  {
    table: 'admissions_updates',
    label: 'Admissions Updates',
    idColumn: 'id',
    idType: 'text',
    searchColumns: ['id', 'title', 'school_name'],
    helpText: 'Time-sensitive admissions news shown in the app’s Updates feed. id is a stable text key. sources is a JSON array of URLs.',
    columns: [
      { name: 'id', label: 'ID', type: 'text', required: true },
      { name: 'report_date', label: 'Report Date (YYYY-MM-DD)', type: 'text' },
      { name: 'severity', label: 'Severity', type: 'text' },
      { name: 'school_slug', label: 'School Slug', type: 'text' },
      { name: 'school_name', label: 'School Name', type: 'text' },
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'body', label: 'Body', type: 'textarea', required: true },
      { name: 'action_required', label: 'Action Required', type: 'text' },
      { name: 'event_date', label: 'Event Date (YYYY-MM-DD)', type: 'text' },
      { name: 'event_type', label: 'Event Type', type: 'text' },
      { name: 'sources', label: 'Sources (JSON array)', type: 'json' },
      { name: 'verified', label: 'Verified', type: 'boolean' },
    ],
  },

  // ── Exam blueprints (sections / notes / skill categories) ──────────────────

  {
    table: 'exam_skill_categories',
    label: 'Exam Skill Categories',
    idColumn: 'name',
    idType: 'text',
    searchColumns: ['name'],
    helpText: 'Skill categories (e.g. Mathematics, Reading Comprehension) that exam_blueprint_sections map to. name is the primary key.',
    columns: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'requires_spatial_logic', label: 'Requires Spatial Logic', type: 'boolean' },
      { name: 'display_order', label: 'Display Order', type: 'number' },
    ],
  },

  {
    table: 'exam_blueprint_sections',
    label: 'Exam Blueprint Sections',
    idColumn: 'id',
    idType: 'text',
    searchColumns: ['id', 'blueprint_slug', 'name'],
    helpText: 'Sections of a mock-exam blueprint (item count, time). blueprint_slug must match an exam_blueprints.slug — import blueprints first. Also editable inside the Exam Blueprints editor.',
    columns: [
      { name: 'id', label: 'ID', type: 'text', required: true },
      { name: 'blueprint_slug', label: 'Blueprint Slug (FK)', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'skill_category', label: 'Skill Category', type: 'text' },
      { name: 'item_count', label: 'Item Count', type: 'number' },
      { name: 'time_minutes', label: 'Time (minutes)', type: 'number' },
      { name: 'requires_spatial_logic', label: 'Requires Spatial Logic', type: 'boolean' },
      { name: 'display_order', label: 'Display Order', type: 'number' },
    ],
  },

  {
    table: 'exam_course_notes',
    label: 'Exam Course Notes',
    idColumn: 'id',
    idType: 'text',
    searchColumns: ['id', 'blueprint_slug', 'course_cluster'],
    helpText: 'Course-specific guidance shown on a mock-exam blueprint. blueprint_slug must match an exam_blueprints.slug.',
    columns: [
      { name: 'id', label: 'ID', type: 'text', required: true },
      { name: 'blueprint_slug', label: 'Blueprint Slug (FK)', type: 'text', required: true },
      { name: 'course_cluster', label: 'Course Cluster', type: 'text' },
      { name: 'note', label: 'Note', type: 'textarea' },
      { name: 'min_percentile', label: 'Min Percentile', type: 'number' },
      { name: 'display_order', label: 'Display Order', type: 'number' },
    ],
  },

  // ── Mappings & passages ────────────────────────────────────────────────────

  {
    table: 'course_taxonomy_map',
    label: 'Course Taxonomy Map',
    idColumn: 'course_tab',
    idType: 'text',
    searchColumns: ['course_tab', 'label', 'career_course_id'],
    helpText: 'Maps a board-exam course tab (e.g. NURSING) to a career_courses row — drives the Courses tab. course_tab is the primary key.',
    columns: [
      { name: 'course_tab', label: 'Course Tab', type: 'text', required: true },
      { name: 'career_course_id', label: 'Career Course ID (FK)', type: 'text' },
      { name: 'label', label: 'Label', type: 'text' },
      { name: 'kind', label: 'Kind', type: 'text' },
    ],
  },

  {
    table: 'upcat_passages',
    label: 'UPCAT Passages',
    idColumn: 'set_id',
    idType: 'text',
    searchColumns: ['set_id', 'subtest'],
    helpText: 'Reading passages shared by sets of upcat_questions (e.g. Reading Comprehension). set_id is referenced by upcat_questions.set_id. Questions themselves are managed via the UPCAT question-bank importer.',
    columns: [
      { name: 'set_id', label: 'Set ID', type: 'text', required: true },
      { name: 'subtest', label: 'Subtest', type: 'text', required: true },
      { name: 'passage_text', label: 'Passage Text', type: 'textarea', required: true },
    ],
  },
]

// Lookup map: table name → config
export const DATA_TABLE_MAP: Record<string, DataTableConfig> = Object.fromEntries(
  DATA_TABLE_CONFIGS.map(c => [c.table, c])
)

// Set of all allowlisted table names (used in the API route guard)
export const ALLOWED_TABLES = new Set(DATA_TABLE_CONFIGS.map(c => c.table))
