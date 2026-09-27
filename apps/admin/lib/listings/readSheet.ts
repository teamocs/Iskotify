import { google } from 'googleapis'
import Papa from 'papaparse'

export interface SheetData {
  title: string
  tab: string
  headers: string[]
  records: Record<string, string>[]
}

const ROW_CAP = 5000

interface ServiceAccount {
  credentials: Record<string, unknown>
  clientEmail: string
}

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const credentials = JSON.parse(raw) as Record<string, unknown>
    const clientEmail = typeof credentials.client_email === 'string' ? credentials.client_email : ''
    return { credentials, clientEmail }
  } catch {
    return null
  }
}

function rowsToRecords(values: string[][]): { headers: string[]; records: Record<string, string>[] } {
  const [headerRow, ...rows] = values
  const headers = (headerRow ?? []).map(h => String(h ?? ''))
  const records = rows.slice(0, ROW_CAP).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? '')])),
  )
  return { headers, records }
}

async function readViaApi(sheetId: string, gid: string | undefined, credentials: Record<string, unknown>): Promise<SheetData> {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
  const title = meta.data.properties?.title ?? sheetId
  const sheetsList = meta.data.sheets ?? []
  const wantedGid = gid !== undefined && gid !== '' ? Number(gid) : undefined
  const match = wantedGid !== undefined
    ? sheetsList.find(s => s.properties?.sheetId === wantedGid)
    : undefined
  const chosen = match ?? sheetsList[0]
  const tab = chosen?.properties?.title ?? 'Sheet1'

  const valuesRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: tab })
  const { headers, records } = rowsToRecords((valuesRes.data.values ?? []) as string[][])
  return { title, tab, headers, records }
}

async function readViaCsv(sheetId: string, gid: string | undefined): Promise<SheetData> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid ?? 0}`
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`CSV export request failed with status ${res.status}`)
  const text = await res.text()
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const headers = parsed.meta.fields ?? []
  const records = (parsed.data ?? []).slice(0, ROW_CAP)
  return { title: sheetId, tab: String(gid ?? 0), headers, records }
}

function isAccessError(err: unknown): boolean {
  const code = (err as { code?: number | string } | null)?.code
  return code === 403 || code === 404 || code === '403' || code === '404'
}

/**
 * Reads a sheet's rows: the Sheets API with our service account first (so
 * private sheets work once shared with it), falling back to the sheet's
 * public CSV export when the API can't see it. Both paths only ever fetch a
 * URL we build from the caller's already-validated `sheetId` — never the raw
 * pasted link — which is the SSRF guard (see sheetLink.ts).
 */
export async function readSheet({ sheetId, gid }: { sheetId: string; gid?: string }): Promise<SheetData> {
  const account = getServiceAccount()
  if (account) {
    try {
      return await readViaApi(sheetId, gid, account.credentials)
    } catch (err) {
      if (!isAccessError(err)) throw err
      // Fall through to the public CSV export below.
    }
  }
  try {
    return await readViaCsv(sheetId, gid)
  } catch {
    throw new Error(
      account?.clientEmail
        ? `Share the sheet with ${account.clientEmail} (Viewer), or set General access to "Anyone with the link".`
        : 'Share the sheet\'s General access to "Anyone with the link", or configure GOOGLE_SERVICE_ACCOUNT_JSON.',
    )
  }
}
