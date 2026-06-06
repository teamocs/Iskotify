export type ListingStatus = 'active' | 'closed' | 'upcoming'
export type ListingType = 'scholarship' | 'exam'

export type ListingEvent = {
  name: string
  date: string
}

export type ListingScope = 'national' | 'regional' | 'provincial' | 'city' | 'school'

export type Listing = {
  id: string
  type: ListingType
  title: string
  slug: string
  provider: string
  description: string
  requirements: string[]
  coverage: string
  deadline: string | null
  exam_date: string | null
  results_date: string | null
  events: ListingEvent[]
  target_courses: string[]
  target_year_levels: string[]
  tags: string[]
  status: ListingStatus
  region: string
  grant_amount: number | null
  external_url: string
  image_url: string
  // Epic B scholarship typed fields
  province: string | null
  city: string | null
  scope: ListingScope
  is_verified: boolean
  income_ceiling: number | null
  gwa_requirement: number | null
  monthly_stipend: number | null
  service_obligation_years: number | null
  has_entrance_exam: boolean
  application_window: string | null
  created_at: string
  updated_at: string
}

export type ListingUpsert = Omit<Listing, 'id' | 'created_at'>
