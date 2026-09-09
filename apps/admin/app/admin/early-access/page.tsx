import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { SendApkButton } from '@/components/admin/SendApkButton'
import { ApkUrlForm } from '@/components/admin/ApkUrlForm'
import { UpdateApkUrlForm } from '@/components/admin/UpdateApkUrlForm'
import { UpdateEmailTemplateForm } from '@/components/admin/UpdateEmailTemplateForm'
import { DEFAULT_UPDATE_EMAIL_TEMPLATE } from '@/lib/updateRollout'

export const dynamic = 'force-dynamic'

interface EarlyAccessRegistration {
  id: string
  full_name: string | null
  email: string
  school: string | null
  grade_level: string | null
  platform: string | null
  status: string
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-warning-soft text-warning-strong',
  approved: 'bg-info-soft text-info-strong',
  sent:     'bg-success-soft text-success-strong',
  expired:  'bg-danger-soft text-danger-strong',
}

async function getData(): Promise<{
  rows: EarlyAccessRegistration[]
  apkUrl: string
  updateApkUrl: string
  updateEmailTemplate: string
}> {
  const db = createServerClient()

  const [
    { data: regData },
    { data: configData },
    { data: updateApkData },
    { data: updateTemplateData },
  ] = await Promise.all([
    db
      .from('early_access_registrations')
      .select('id,full_name,email,school,grade_level,platform,status,created_at')
      .order('created_at', { ascending: false }),
    db
      .from('app_config')
      .select('value')
      .eq('key', 'early_access_apk_url')
      .maybeSingle(),
    db
      .from('app_config')
      .select('value')
      .eq('key', 'update_apk_url')
      .maybeSingle(),
    db
      .from('app_config')
      .select('value')
      .eq('key', 'update_email_template')
      .maybeSingle(),
  ])

  return {
    rows: (regData ?? []) as EarlyAccessRegistration[],
    apkUrl: (configData?.value ?? '') as string,
    updateApkUrl: (updateApkData?.value ?? '') as string,
    updateEmailTemplate: (updateTemplateData?.value ?? '') as string,
  }
}

export default async function EarlyAccessPage() {
  const { rows, apkUrl, updateApkUrl, updateEmailTemplate } = await getData()

  return (
    <>
      <Topbar title="Early Access" />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-ink font-heading font-bold text-xl tracking-tight">Early-access registrations</h2>
          <p className="text-ink-muted text-sm mt-0.5">
            {rows.length} registration{rows.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Early-access APK link section */}
        <div className="space-y-3">
          <div>
            <p className="text-[13px] font-semibold text-ink">Early-access APK link</p>
            <p className="text-[12px] text-ink-muted mt-0.5">
              The link below is emailed to registrants when you press &ldquo;Send APK&rdquo;. Host the APK on GitHub Releases or Google Drive and paste the permanent URL here.
            </p>
          </div>

          {apkUrl ? (
            <div className="flex items-start gap-3 rounded-[12px] px-4 py-3 bg-success-soft border border-success/25">
              <span className="text-success text-base leading-none mt-0.5" aria-hidden="true">&#10003;</span>
              <div className="min-w-0">
                <p className="text-[13px] text-success-strong font-medium">APK link set &mdash; &ldquo;Send APK&rdquo; emails this URL.</p>
                <a
                  href={apkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-maroon underline break-all"
                >
                  {apkUrl}
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-[12px] px-4 py-3 bg-warning-soft border border-warning/25">
              <span className="text-amber-500 text-base leading-none mt-0.5" aria-hidden="true">&#9888;</span>
              <p className="text-[13px] text-warning-strong">
                No APK link set yet &mdash; paste the hosted download URL below before sending emails.
              </p>
            </div>
          )}

          <ApkUrlForm currentUrl={apkUrl} />
        </div>

        {/* App update section — for users who already installed Iskotify */}
        <div className="space-y-3">
          <div>
            <p className="text-[13px] font-semibold text-ink">App update &mdash; for existing users</p>
            <p className="text-[12px] text-ink-muted mt-0.5">
              This APK and email are for pushing an <strong>update</strong> to users who already installed Iskotify &mdash; distinct from the first-install early-access APK above. Set the hosted URL of the new build, then edit the email that tells existing users how to install it.
            </p>
          </div>

          {updateApkUrl ? (
            <div className="flex items-start gap-3 rounded-[12px] px-4 py-3 bg-success-soft border border-success/25">
              <span className="text-success text-base leading-none mt-0.5" aria-hidden="true">&#10003;</span>
              <div className="min-w-0">
                <p className="text-[13px] text-success-strong font-medium">Update APK link set &mdash; the update email points at this URL.</p>
                <a
                  href={updateApkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-maroon underline break-all"
                >
                  {updateApkUrl}
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-[12px] px-4 py-3 bg-warning-soft border border-warning/25">
              <span className="text-amber-500 text-base leading-none mt-0.5" aria-hidden="true">&#9888;</span>
              <p className="text-[13px] text-warning-strong">
                No update APK link set yet &mdash; paste the hosted download URL for the new build below.
              </p>
            </div>
          )}

          <UpdateApkUrlForm currentUrl={updateApkUrl} />
          <UpdateEmailTemplateForm initialTemplate={updateEmailTemplate || DEFAULT_UPDATE_EMAIL_TEMPLATE} />
        </div>

        <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-surface-3">
                  {['Email', 'Name', 'School', 'Grade', 'Status', 'Registered', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-ink-subtle uppercase tracking-wider border-b border-black/[0.05] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-black/[0.015] transition-colors">
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] font-medium text-ink">{row.email}</td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-ink-muted">{row.full_name || '—'}</td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-ink-muted">{row.school || '—'}</td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-ink-muted whitespace-nowrap">{row.grade_level || '—'}</td>
                    <td className="px-5 py-3 border-b border-black/[0.04]">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[12px] text-ink-muted whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04]">
                      {row.status !== 'expired' && (
                        <SendApkButton id={row.id} status={row.status} />
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-ink-subtle">
                      No early-access registrations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
