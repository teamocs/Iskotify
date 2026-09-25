'use client'

import { useId, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Listing } from '@iskotify/utils'
import { saveListing } from '@/lib/admin/listingsApi'
import { notifySuccess, notifyError } from '@/lib/toast'
import { isDirty } from '@/lib/admin/formDirty'
import { Drawer } from '@/components/ui/Drawer'
import { Field, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Icon } from '@/components/ui/Icon'

interface Props {
  listing: Listing | null   // null = new listing
  onClose: () => void
}

const EMPTY = {
  type: 'scholarship', title: '', slug: '', provider: '', description: '',
  coverage: '', deadline: '', exam_date: '', results_date: '', region: '', status: 'active',
  grant_amount: '',
  external_url: '',
  // Scholarship typed fields
  province: '',
  city: '',
  scope: 'national',
  is_verified: false,
  income_ceiling: '',
  gwa_requirement: '',
  monthly_stipend: '',
  service_obligation_years: '',
  has_entrance_exam: false,
  application_window: '',
  // Scholarship meta JSONB fields
  meta_huc_excluded: false,
  meta_target_year_levels: '',
  meta_other_benefits: '',
  meta_raw_json: '',
}

type ListingForm = typeof EMPTY

function nullableNumber(val: string): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function parseMetaFields(metaJson: unknown): {
  huc_excluded: boolean
  target_year_levels: string
  other_benefits: string
} {
  let meta: Record<string, unknown> = {}
  if (typeof metaJson === 'string') {
    try { meta = JSON.parse(metaJson) } catch { /* ignore */ }
  } else if (metaJson && typeof metaJson === 'object') {
    meta = metaJson as Record<string, unknown>
  }
  return {
    huc_excluded: !!meta.huc_excluded,
    target_year_levels: Array.isArray(meta.target_year_levels)
      ? (meta.target_year_levels as unknown[]).flatMap(v => { const s = String(v).trim(); return s ? [s] : [] }).join(', ')
      : '',
    other_benefits: Array.isArray(meta.other_benefits)
      ? (meta.other_benefits as unknown[]).flatMap(v => { const s = String(v).trim(); return s ? [s] : [] }).join(', ')
      : '',
  }
}

function buildMetaPayload(
  hucExcluded: boolean,
  targetYearLevelsRaw: string,
  otherBenefitsRaw: string,
  showRaw: boolean,
  rawJson: string,
): { meta: Record<string, unknown> | null; error: string } {
  let base: Record<string, unknown> = {}
  if (showRaw && rawJson.trim()) {
    try { base = JSON.parse(rawJson) }
    catch { return { meta: null, error: 'Invalid JSON — fix or clear the Advanced JSON field.' } }
  }
  const target_year_levels = targetYearLevelsRaw.split(',').flatMap(s => { const t = s.trim(); return t ? [t] : [] })
  const other_benefits = otherBenefitsRaw.split(',').flatMap(s => { const t = s.trim(); return t ? [t] : [] })
  return {
    meta: { ...base, huc_excluded: hucExcluded, target_year_levels, other_benefits },
    error: '',
  }
}

function toForm(listing: Listing | null): ListingForm {
  if (!listing) return EMPTY
  const parsedMeta = listing.scholarship_meta != null
    ? parseMetaFields(listing.scholarship_meta)
    : { huc_excluded: false, target_year_levels: '', other_benefits: '' }
  return {
    type: listing.type,
    title: listing.title,
    slug: listing.slug,
    provider: listing.provider,
    description: listing.description ?? '',
    coverage: listing.coverage ?? '',
    deadline: listing.deadline ?? '',
    exam_date: listing.exam_date ?? '',
    results_date: listing.results_date ?? '',
    region: listing.region ?? '',
    status: listing.status,
    grant_amount: listing.grant_amount?.toString() ?? '',
    external_url: listing.external_url ?? '',
    province: listing.province ?? '',
    city: listing.city ?? '',
    scope: listing.scope ?? 'national',
    is_verified: listing.is_verified ?? false,
    income_ceiling: listing.income_ceiling?.toString() ?? '',
    gwa_requirement: listing.gwa_requirement?.toString() ?? '',
    monthly_stipend: listing.monthly_stipend?.toString() ?? '',
    service_obligation_years: listing.service_obligation_years?.toString() ?? '',
    has_entrance_exam: listing.has_entrance_exam ?? false,
    application_window: listing.application_window ?? '',
    meta_huc_excluded: parsedMeta.huc_excluded,
    meta_target_year_levels: parsedMeta.target_year_levels,
    meta_other_benefits: parsedMeta.other_benefits,
    meta_raw_json: '',
  }
}

type RequiredKey = 'type' | 'status' | 'title' | 'slug' | 'provider' | 'region'
const REQUIRED_LABELS: Record<RequiredKey, string> = {
  type: 'Type', status: 'Status', title: 'Title', slug: 'Slug', provider: 'Provider / org', region: 'Region',
}

/** The fields the listings API refuses to save without, as per-field messages. */
export function validateListingForm(form: Pick<ListingForm, RequiredKey>): Partial<Record<RequiredKey, string>> {
  const errors: Partial<Record<RequiredKey, string>> = {}
  for (const key of Object.keys(REQUIRED_LABELS) as RequiredKey[]) {
    if (!String(form[key] ?? '').trim()) errors[key] = `${REQUIRED_LABELS[key]} is required.`
  }
  return errors
}

type Errors = Partial<Record<keyof ListingForm, string>>

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-subtle pt-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  )
}

function Check({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 cursor-pointer accent-maroon" />
      <label htmlFor={id} className="cursor-pointer text-sm text-ink">
        {label}
        {hint && <span className="ml-1 text-xs text-ink-muted">{hint}</span>}
      </label>
    </div>
  )
}

export function ListingDrawer({ listing, onClose }: Props) {
  const formId = useId()
  const fid = (name: string) => `${formId}-${name}`
  const [initial] = useState(() => toForm(listing))
  const [form, setForm] = useState<ListingForm>(initial)
  const [metaOpen, setMetaOpen] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const dirty = isDirty(form, initial)

  function set<K extends keyof ListingForm>(field: K, value: ListingForm[K]) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => {
      if (!e[field]) return e
      const next = { ...e }
      delete next[field]
      return next
    })
  }
  const text = (field: keyof ListingForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(field, e.target.value as never)

  async function handleSubmit() {
    setServerError('')
    const found: Errors = validateListingForm(form)

    // Validate scholarship meta raw JSON if shown
    let scholarship_meta: Record<string, unknown> | null = null
    if (form.type === 'scholarship') {
      const result = buildMetaPayload(
        form.meta_huc_excluded,
        form.meta_target_year_levels,
        form.meta_other_benefits,
        showRaw,
        form.meta_raw_json,
      )
      if (result.error) {
        found.meta_raw_json = result.error
        setMetaOpen(true)
      }
      scholarship_meta = result.meta
    }

    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      // The raw JSON field may only mount on this render; focus what exists now.
      document.getElementById(fid(first))?.focus()
      return
    }

    setSaving(true)
    const payload: Record<string, unknown> = {
      ...form,
      grant_amount: nullableNumber(form.grant_amount),
      deadline: form.deadline || null,
      exam_date: form.exam_date || null,
      results_date: form.results_date || null,
      // Scholarship typed fields
      province: form.province || null,
      city: form.city || null,
      scope: form.scope,
      is_verified: form.is_verified,
      income_ceiling: nullableNumber(form.income_ceiling),
      gwa_requirement: nullableNumber(form.gwa_requirement),
      monthly_stipend: nullableNumber(form.monthly_stipend),
      service_obligation_years: nullableNumber(form.service_obligation_years),
      has_entrance_exam: form.has_entrance_exam,
      application_window: form.application_window || null,
    }
    // Attach scholarship_meta only for scholarships
    if (form.type === 'scholarship' && scholarship_meta !== null) {
      payload.scholarship_meta = scholarship_meta
    }
    // Strip internal UI-only fields
    delete payload.meta_huc_excluded
    delete payload.meta_target_year_levels
    delete payload.meta_other_benefits
    delete payload.meta_raw_json

    try {
      const result = await saveListing(payload, listing?.id)
      if (!result.ok) {
        setServerError(result.error)
        notifyError(result.error)
        return
      }
      notifySuccess(listing ? 'Listing saved' : 'Listing created')
      router.refresh()
      onClose()
    } catch {
      setServerError('Network error')
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const input = (field: keyof ListingForm, label: string, type: string, opts: { required?: boolean; placeholder?: string; extra?: Record<string, string> } = {}) => (
    <Field key={field} id={fid(field)} label={label} required={opts.required} error={errors[field]}>
      {p => (
        <input
          {...p}
          type={type}
          value={form[field] as string}
          onChange={text(field)}
          placeholder={opts.placeholder}
          {...opts.extra}
          className={`${controlClass} ${type === 'number' || type === 'date' ? 'tabular-nums' : ''}`}
        />
      )}
    </Field>
  )

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={listing ? 'Edit listing' : 'Add listing'}
      onSubmit={handleSubmit}
      dirty={dirty}
      footer={close => (
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>
            {saving ? 'Saving…' : listing ? 'Save changes' : 'Create listing'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {serverError && <ErrorBanner title="Couldn’t save this listing" message={serverError} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={fid('type')} label="Type" required error={errors.type}>
            {p => (
              <select {...p} value={form.type} onChange={text('type')} className={controlClass}>
                <option value="scholarship">Scholarship</option>
                <option value="exam">Exam</option>
              </select>
            )}
          </Field>
          <Field id={fid('status')} label="Status" required error={errors.status}>
            {p => (
              <select {...p} value={form.status} onChange={text('status')} className={controlClass}>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="closed">Closed</option>
              </select>
            )}
          </Field>
        </div>

        {input('title', 'Title', 'text', { required: true })}
        {input('slug', 'Slug', 'text', { required: true })}
        <div className="grid gap-3 sm:grid-cols-2">
          {input('provider', 'Provider / org', 'text', { required: true })}
          {input('region', 'Region', 'text', { required: true })}
        </div>
        {input('external_url', 'External URL', 'url')}
        <div className="grid gap-3 sm:grid-cols-3">
          {input('deadline', 'Deadline', 'date')}
          {input('exam_date', 'Exam date', 'date')}
          {input('results_date', 'Results date', 'date')}
        </div>
        {input('grant_amount', 'Grant amount (₱)', 'number')}

        <Field id={fid('description')} label="Description">
          {p => <textarea {...p} value={form.description} onChange={text('description')} rows={3} className={`${controlClass} h-auto py-2`} />}
        </Field>
        <Field id={fid('coverage')} label="Coverage">
          {p => <textarea {...p} value={form.coverage} onChange={text('coverage')} rows={2} className={`${controlClass} h-auto py-2`} />}
        </Field>

        <Section title="Scholarship details">
          <Field id={fid('scope')} label="Scope">
            {p => (
              <select {...p} value={form.scope} onChange={text('scope')} className={controlClass}>
                <option value="national">National</option>
                <option value="regional">Regional</option>
                <option value="provincial">Provincial</option>
                <option value="city">City</option>
                <option value="school">School</option>
              </select>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('province', 'Province', 'text')}
            {input('city', 'City', 'text')}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('income_ceiling', 'Income ceiling (₱/yr)', 'number', { placeholder: 'e.g. 400000', extra: { min: '0' } })}
            {input('gwa_requirement', 'GWA requirement (%)', 'number', { placeholder: 'e.g. 85', extra: { min: '0', max: '100', step: '0.01' } })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('monthly_stipend', 'Monthly stipend (₱/mo)', 'number', { placeholder: 'e.g. 7000', extra: { min: '0' } })}
            {input('service_obligation_years', 'Service obligation (yrs)', 'number', { placeholder: 'e.g. 2', extra: { min: '0', step: '1' } })}
          </div>
          {input('application_window', 'Application window', 'text', { placeholder: 'e.g. Jan 1 – Mar 31 annually' })}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Check id={fid('is_verified')} label="Verified" checked={form.is_verified} onChange={v => set('is_verified', v)} />
            <Check id={fid('has_entrance_exam')} label="Has entrance exam" checked={form.has_entrance_exam} onChange={v => set('has_entrance_exam', v)} />
          </div>
        </Section>

        {form.type === 'scholarship' && (
          <section className="space-y-3 border-t border-subtle pt-4">
            <h3>
              <button
                type="button"
                aria-expanded={metaOpen}
                aria-controls={fid('meta')}
                onClick={() => setMetaOpen(o => !o)}
                className="flex w-full items-center justify-between text-sm font-semibold text-ink"
              >
                Scholarship meta
                <Icon name={metaOpen ? 'chevron-up' : 'chevron-down'} className="text-ink-muted" />
              </button>
            </h3>
            {metaOpen && (
              <div id={fid('meta')} className="space-y-3">
                <Check
                  id={fid('meta_huc_excluded')}
                  label="HUC excluded"
                  hint="(highly urbanized cities ineligible)"
                  checked={form.meta_huc_excluded}
                  onChange={v => set('meta_huc_excluded', v)}
                />
                <Field id={fid('meta_target_year_levels')} label="Target year levels" hint="Comma-separated; stored as a list. E.g. Grade 12, Freshman">
                  {p => <input {...p} type="text" value={form.meta_target_year_levels} onChange={text('meta_target_year_levels')} className={controlClass} placeholder="e.g. Grade 12, Freshman" />}
                </Field>
                <Field id={fid('meta_other_benefits')} label="Other benefits" hint="Comma-separated; stored as a list.">
                  {p => <input {...p} type="text" value={form.meta_other_benefits} onChange={text('meta_other_benefits')} className={controlClass} placeholder="e.g. Free uniform, Monthly stipend" />}
                </Field>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowRaw(s => !s); setErrors(e => ({ ...e, meta_raw_json: undefined })) }}
                >
                  {showRaw ? 'Hide advanced JSON' : 'Advanced JSON'}
                </Button>
                {showRaw && (
                  <Field
                    id={fid('meta_raw_json')}
                    label="Raw JSON"
                    hint="The structured fields above take precedence on save."
                    error={errors.meta_raw_json}
                  >
                    {p => (
                      <textarea
                        {...p}
                        value={form.meta_raw_json}
                        onChange={e => {
                          const v = e.target.value
                          set('meta_raw_json', v)
                          try { JSON.parse(v || '{}') }
                          catch { setErrors(er => ({ ...er, meta_raw_json: 'Invalid JSON' })) }
                        }}
                        rows={4}
                        className={`${controlClass} h-auto py-2 font-mono text-xs`}
                        placeholder='{"huc_excluded": false, "target_year_levels": [], "other_benefits": []}'
                      />
                    )}
                  </Field>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </Drawer>
  )
}
