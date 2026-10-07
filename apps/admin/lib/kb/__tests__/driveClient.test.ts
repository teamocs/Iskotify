import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExport = vi.fn()
const mockGet = vi.fn()

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    drive: vi.fn(() => ({ files: { export: mockExport, get: mockGet, list: vi.fn() } })),
  },
}))

import { createDriveGateway } from '../driveClient'
import type { DriveEntry } from '../syncDriveFolder'

const CREDS = JSON.stringify({ client_email: 'sync@x.iam.gserviceaccount.com' })
const entry = (mimeType: string): DriveEntry => ({ id: 'file-id-0000000000', name: 'x', mimeType, path: '' })

describe('createDriveGateway().downloadText', () => {
  beforeEach(() => {
    mockExport.mockReset()
    mockGet.mockReset()
  })

  it('exports a Google Doc as plain text', async () => {
    mockExport.mockResolvedValue({ data: 'Weekly report' })
    const text = await createDriveGateway(CREDS).downloadText(entry('application/vnd.google-apps.document'))
    expect(text).toBe('Weekly report')
    expect(mockExport).toHaveBeenCalledWith({ fileId: 'file-id-0000000000', mimeType: 'text/plain' }, { responseType: 'text' })
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('still exports a Google Sheet as CSV', async () => {
    mockExport.mockResolvedValue({ data: 'a,b' })
    await createDriveGateway(CREDS).downloadText(entry('application/vnd.google-apps.spreadsheet'))
    expect(mockExport).toHaveBeenCalledWith({ fileId: 'file-id-0000000000', mimeType: 'text/csv' }, { responseType: 'text' })
  })

  it('downloads other files as they are', async () => {
    mockGet.mockResolvedValue({ data: 'id,q' })
    await createDriveGateway(CREDS).downloadText(entry('text/csv'))
    expect(mockGet).toHaveBeenCalledWith({ fileId: 'file-id-0000000000', alt: 'media', supportsAllDrives: true }, { responseType: 'text' })
  })
})
