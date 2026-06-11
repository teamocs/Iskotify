'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Listing } from '@iskotify/utils'

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
  meta_raw_error: '',
  meta_show_raw: false,
  meta_open: false,
}

function nullableNumber(val: string): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function epochToDateStr(ms: number | null | undefined): string {
  if (!ms) return ''
  try { return new Date(ms).toISOString().slice(0, 10) } catch { return '' }
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

export function ListingDrawer({ listing, onClose }: Props) {
  const parsedMeta = listing?.scholarship_meta != null
    ? parseMetaFields(listing.scholarship_meta)
    : { huc_excluded: false, target_year_levels: '', other_benefits: '' }

  const [form, setForm] = useState(listing ? {
    type: listing.type,
    title: listing.title,
    slug: listing.slug,
    provider: listing.provider,
    description: listing.description ?? '',
    coverage: listing.coverage ?? '',
    deadline: listing.deadline ?? '',
    exam_date: listing.exam_date ?? '',
    results_date: epochToDateStr((listing as any).results_date),
    region: listing.region ?? '',
    status: listing.status,
    grant_amount: listing.grant_amount?.toString() ?? '',
    external_url: listing.external_url ?? '',
    // Scholarship typed fields
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
    // Scholarship meta
    meta_huc_excluded: parsedMeta.huc_excluded,
    meta_target_year_levels: parsedMeta.target_year_levels,
    meta_other_benefits: parsedMeta.other_benefits,
    meta_raw_json: '',
    meta_raw_error: '',
    meta_show_raw: false,
    meta_open: false,
  } : EMPTY)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function setCheck(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.checked }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validate scholarship meta raw JSON if shown
    let scholarship_meta: Record<string, unknown> | null = null
    if (form.type === 'scholarship') {
      const result = buildMetaPayload(
        form.meta_huc_excluded as boolean,
        form.meta_target_year_levels as string,
        form.meta_other_benefits as string,
        form.meta_show_raw as boolean,
        form.meta_raw_json as string,
      )
      if (result.error) {
        setForm(f => ({ ...f, meta_raw_error: result.error }))
        return
      }
      scholarship_meta = result.meta
    }

    setSaving(true)
    const payload: Record<string, unknown> = {
      ...form,
      grant_amount: nullableNumber(form.grant_amount as string),
      deadline: form.deadline || null,
      exam_date: form.exam_date || null,
      results_date: form.results_date || null,
      // Scholarship typed fields
      province: form.province || null,
      city: form.city || null,
      scope: form.scope,
      is_verified: form.is_verified,
      income_ceiling: nullableNumber(form.income_ceiling as string),
      gwa_requirement: nullableNumber(form.gwa_requirement as string),
      monthly_stipend: nullableNumber(form.monthly_stipend as string),
      service_obligation_years: nullableNumber(form.service_obligation_years as string),
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
    delete payload.meta_raw_error
    delete payload.meta_show_raw
    delete payload.meta_open

    const url = listing ? `/api/admin/listings/${listing.id}` : '/api/admin/listings'
    const method = listing ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Something went wrong')
      return
    }
    router.refresh()
    onClose()
  }

  const inputCls = "w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]"
  const labelCls = "block text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-1"
  const sectionCls = "pt-2"
  const sectionTitleCls = "text-[11px] font-bold text-[#1d1d1f] uppercase tracking-wider pb-2 border-b border-black/[0.06] mb-3"

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close drawer"
        className="flex-1 bg-black/20 backdrop-blur-sm border-0 p-0 cursor-default"
        onClick={onClose}
      />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08]">
          <h2 className="font-heading font-bold text-lg text-[#1d1d1f]">
            {listing ? 'Edit Listing' : 'Add Listing'}
          </h2>
          <button onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select value={form.type} onChange={set('type')} className={inputCls}>
                <option value="scholarship">Scholarship</option>
                <option value="exam">Exam</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={set('status')} className={inputCls}>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          {([
            ['title', 'Title', 'text'],
            ['slug', 'Slug', 'text'],
            ['provider', 'Provider / Org', 'text'],
            ['region', 'Region', 'text'],
            ['external_url', 'External URL', 'url'],
            ['deadline', 'Deadline', 'date'],
            ['exam_date', 'Exam Date', 'date'],
            ['results_date', 'Results Date', 'date'],
            ['grant_amount', 'Grant Amount (₱)', 'number']
          ] as [string, string, string][]).map(([field, label, type]) => (
            <div key={field}>
              <label className={labelCls}>{label}</label>
              <input type={type} value={(form as any)[field]} onChange={set(field)} className={inputCls} />
            </div>
          ))}
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={3} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Coverage</label>
            <textarea value={form.coverage} onChange={set('coverage')} rows={2} className={inputCls} />
          </div>

          {/* Scholarship details */}
          <div className={sectionCls}>
            <p className={sectionTitleCls}>Scholarship Details</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Scope</label>
                <select value={form.scope} onChange={set('scope')} className={inputCls}>
                  <option value="national">National</option>
                  <option value="regional">Regional</option>
                  <option value="provincial">Provincial</option>
                  <option value="city">City</option>
                  <option value="school">School</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Province</label>
                  <input type="text" value={form.province as string} onChange={set('province')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>City</label>
                  <input type="text" value={form.city as string} onChange={set('city')} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Income Ceiling (₱/yr)</label>
                  <input type="number" min="0" value={form.income_ceiling as string} onChange={set('income_ceiling')} className={inputCls} placeholder="e.g. 400000" />
                </div>
                <div>
                  <label className={labelCls}>GWA Requirement (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={form.gwa_requirement as string} onChange={set('gwa_requirement')} className={inputCls} placeholder="e.g. 85" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Monthly Stipend (₱/mo)</label>
                  <input type="number" min="0" value={form.monthly_stipend as string} onChange={set('monthly_stipend')} className={inputCls} placeholder="e.g. 7000" />
                </div>
                <div>
                  <label className={labelCls}>Service Obligation (yrs)</label>
                  <input type="number" min="0" step="1" value={form.service_obligation_years as string} onChange={set('service_obligation_years')} className={inputCls} placeholder="e.g. 2" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Application Window</label>
                <input type="text" value={form.application_window as string} onChange={set('application_window')} className={inputCls} placeholder="e.g. Jan 1 – Mar 31 annually" />
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_verified as boolean}
                    onChange={setCheck('is_verified')}
                    className="w-4 h-4 rounded accent-[#800000]"
                  />
                  <span className="text-sm text-[#1d1d1f]">Verified</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.has_entrance_exam as boolean}
                    onChange={setCheck('has_entrance_exam')}
                    className="w-4 h-4 rounded accent-[#800000]"
                  />
                  <span className="text-sm text-[#1d1d1f]">Has Entrance Exam</span>
                </label>
              </div>
            </div>
          </div>

          {/* Scholarship Meta — only for scholarships */}
          {form.type === 'scholarship' && (
            <div className={sectionCls}>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, meta_open: !(f.meta_open as boolean) }))}
                className="w-full flex items-center justify-between pb-2 border-b border-black/[0.06] mb-3"
              >
                <p className={sectionTitleCls.replace('mb-3', '').replace('border-b border-black/[0.06] pb-2', '').trim()}>
                  Scholarship Meta
                </p>
                <span className="text-[#aeaeb2] text-xs">{form.meta_open ? '▲ collapse' : '▼ expand'}</span>
              </button>
              {form.meta_open && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.meta_huc_excluded as boolean}
                      onChange={setCheck('meta_huc_excluded')}
                      className="w-4 h-4 rounded accent-[#800000]"
                    />
                    <span className="text-sm text-[#1d1d1f]">HUC Excluded</span>
                    <span className="text-[10px] text-[#aeaeb2]">(highly urbanized cities ineligible)</span>
                  </label>
                  <div>
                    <label className={labelCls}>Target Year Levels (comma-separated)</label>
                    <input
                      type="text"
                      value={form.meta_target_year_levels as string}
                      onChange={set('meta_target_year_levels')}
                      className={inputCls}
                      placeholder="e.g. Grade 12, Freshman"
                    />
                    <p className="text-[10px] text-[#aeaeb2] mt-1">Stored as an array. E.g. Grade 12, Freshman</p>
                  </div>
                  <div>
                    <label className={labelCls}>Other Benefits (comma-separated)</label>
                    <input
                      type="text"
                      value={form.meta_other_benefits as string}
                      onChange={set('meta_other_benefits')}
                      className={inputCls}
                      placeholder="e.g. Free uniform, Monthly stipend"
                    />
                    <p className="text-[10px] text-[#aeaeb2] mt-1">Stored as an array.</p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        meta_show_raw: !(f.meta_show_raw as boolean),
                        meta_raw_error: '',
                      }))}
                      className="text-[11px] text-[#800000] underline"
                    >
                      {form.meta_show_raw ? 'Hide Advanced JSON' : 'Advanced JSON'}
                    </button>
                    {form.meta_show_raw && (
                      <div className="mt-2">
                        <label className={labelCls}>Raw JSON (structured fields above take precedence on save)</label>
                        <textarea
                          value={form.meta_raw_json as string}
                          onChange={(e) => {
                            setForm(f => ({ ...f, meta_raw_json: e.target.value, meta_raw_error: '' }))
                            try { JSON.parse(e.target.value || '{}') }
                            catch { setForm(f => ({ ...f, meta_raw_error: 'Invalid JSON' })) }
                          }}
                          rows={4}
                          className={inputCls + ' font-mono text-xs'}
                          placeholder='{"huc_excluded": false, "target_year_levels": [], "other_benefits": []}'
                        />
                        {(form.meta_raw_error as string) && (
                          <p className="text-xs text-red-600 mt-1">{form.meta_raw_error as string}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>}
        </form>
        <div className="px-6 py-4 border-t border-black/[0.08] flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]">
            Cancel
          </button>
          <button onClick={handleSubmit as any} disabled={saving} className="px-5 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000] disabled:opacity-50">
            {saving ? 'Saving…' : listing ? 'Save Changes' : 'Create Listing'}
          </button>
        </div>
      </div>
    </div>
  )
}
