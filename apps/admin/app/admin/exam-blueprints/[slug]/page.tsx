import { createServerClient } from '@iskotify/utils'
import { BlueprintEditor } from '@/components/admin/BlueprintEditor'

export const dynamic = 'force-dynamic'

interface Blueprint {
  slug: string
  name: string
  acronym: string
  total_items: number
  total_time_minutes: number
  has_guessing_penalty: boolean
  guessing_penalty: number
  section_blocked: boolean
  scoring_note: string
  mechanics_note: string
  status: string
  display_order: number
}

interface Section {
  id: string
  blueprint_slug: string
  name: string
  skill_category: string
  item_count: number
  time_minutes: number | null
  requires_spatial_logic: boolean
  display_order: number
}

interface CourseNote {
  id: string
  blueprint_slug: string
  course_cluster: string
  note: string
  min_percentile: number | null
  display_order: number
}

interface SkillCategory {
  name: string
  requires_spatial_logic: boolean
  display_order: number
}

interface Props {
  params: Promise<{ slug: string }>
}

export default async function BlueprintEditorPage({ params }: Props) {
  const { slug } = await params
  const isNew = slug === 'new'
  const db = createServerClient()

  // Always fetch skill categories for the dropdown
  const { data: categoriesData } = await db
    .from('exam_skill_categories')
    .select('*')
    .order('display_order')
  const categories = (categoriesData ?? []) as SkillCategory[]

  let initialBlueprint: Blueprint | null = null
  let initialSections: Section[] = []
  let initialNotes: CourseNote[] = []

  if (!isNew) {
    const [bpRes, secRes, notesRes] = await Promise.all([
      db.from('exam_blueprints').select('*').eq('slug', slug).single(),
      db.from('exam_blueprint_sections').select('*').eq('blueprint_slug', slug).order('display_order'),
      db.from('exam_course_notes').select('*').eq('blueprint_slug', slug).order('display_order'),
    ])
    initialBlueprint = bpRes.data as Blueprint | null
    initialSections = (secRes.data ?? []) as Section[]
    initialNotes = (notesRes.data ?? []) as CourseNote[]
  }

  return (
    <BlueprintEditor
      initialBlueprint={initialBlueprint}
      initialSections={initialSections}
      initialNotes={initialNotes}
      categories={categories}
      isNew={isNew}
    />
  )
}
