import type { ReactNode } from 'react'
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { ApkUrlForm } from '@/components/admin/ApkUrlForm'
import { UpdateApkUrlForm } from '@/components/admin/UpdateApkUrlForm'
import { UpdateEmailTemplateForm } from '@/components/admin/UpdateEmailTemplateForm'
import { EarlyAccessTable, type EarlyAccessRegistration } from '@/components/admin/EarlyAccessTable'
import { PageBody } from '@/components/ui/Page'
import { Card } from '@/components/ui/Card'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Icon } from '@/components/ui/Icon'
import { DEFAULT_UPDATE_EMAIL_TEMPLATE } from '@/lib/updateRollout'

export const dynamic = 'force-dynamic'

async function getData(): Promise<{
  rows: EarlyAccessRegistration[]
  error: string | null
  apkUrl: string
  updateApkUrl: string
  updateEmailTemplate: string
}> {
  const db = createServerClient()

  const [
    { data: regData, error: regError },
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
    error: regError?.message ?? null,
    apkUrl: (configData?.value ?? '') as string,
    updateApkUrl: (updateApkData?.value ?? '') as string,
    updateEmailTemplate: (updateTemplateData?.value ?? '') as string,
  }
}

/** Whether a download link is configured, said in words with an icon (not colour alone). */
function LinkStatus({ url, setText, unsetText }: { url: string; setText: ReactNode; unsetText: ReactNode }) {
  if (!url) {
    return (
      <div className="flex items-start gap-2 rounded-sm bg-warning-soft px-3 py-2 text-ui text-warning-strong">
        <Icon name="alert" className="mt-0.5" />
        <p>{unsetText}</p>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-sm bg-success-soft px-3 py-2 text-ui text-success-strong">
      <Icon name="check" className="mt-0.5" />
      <div className="min-w-0">
        <p className="font-medium">{setText}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-maroon underline">
          {url}
        </a>
      </div>
    </div>
  )
}

export default async function EarlyAccessPage() {
  const { rows, error, apkUrl, updateApkUrl, updateEmailTemplate } = await getData()

  return (
    <>
      <Topbar title="Early Access" />
      <PageBody
        width="wide"
        intro="Send the early-access APK to people who registered, and manage the update build for existing users."
      >
        <Card
          title="Early-access APK link"
          description="Emailed to registrants when you press Send APK. Host the APK on GitHub Releases or Google Drive and paste the permanent URL."
        >
          <div className="space-y-3">
            <LinkStatus
              url={apkUrl}
              setText="APK link set. Send APK emails this URL."
              unsetText="No APK link set yet. Paste the hosted download URL below before sending emails."
            />
            <ApkUrlForm currentUrl={apkUrl} />
          </div>
        </Card>

        <Card
          title="App update for existing users"
          description="For pushing an update to people who already installed Iskotify, separate from the first-install APK above. Set the new build's URL, then edit the email that explains how to install it."
        >
          <div className="space-y-5">
            <LinkStatus
              url={updateApkUrl}
              setText="Update APK link set. The update email points at this URL."
              unsetText="No update APK link set yet. Paste the hosted download URL for the new build below."
            />
            <UpdateApkUrlForm currentUrl={updateApkUrl} />
            <UpdateEmailTemplateForm initialTemplate={updateEmailTemplate || DEFAULT_UPDATE_EMAIL_TEMPLATE} />
          </div>
        </Card>

        <Card
          title="Registrations"
          description={error ? undefined : `${rows.length} registration${rows.length !== 1 ? 's' : ''}`}
          flush
        >
          {error ? (
            <div className="p-4">
              <ErrorBanner title="Couldn’t load registrations" message={error} />
            </div>
          ) : (
            <EarlyAccessTable rows={rows} />
          )}
        </Card>
      </PageBody>
    </>
  )
}
