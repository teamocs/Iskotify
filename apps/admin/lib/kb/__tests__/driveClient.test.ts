import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'stream'

const mockExport = vi.fn()
const mockGet = vi.fn()
const mockList = vi.fn()

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    drive: vi.fn(() => ({ files: { export: mockExport, get: mockGet, list: mockList } })),
  },
}))

import { createDriveGateway } from '../driveClient'
import { FileTooLargeError } from '../fileTooLarge'
import type { DriveEntry } from '../syncDriveFolder'

const CREDS = JSON.stringify({ client_email: 'sync@x.iam.gserviceaccount.com' })
const entry = (mimeType: string): DriveEntry => ({ id: 'file-id-0000000000', name: 'x', mimeType, path: '' })
const DOC = 'application/vnd.google-apps.document'

describe('createDriveGateway().downloadText', () => {
  beforeEach(() => {
    mockExport.mockReset()
    mockGet.mockReset()
  })

  it('exports a Google Doc as plain text', async () => {
    mockExport.mockResolvedValue({ data: 'Weekly report' })
    const text = await createDriveGateway(CREDS).downloadText(entry(DOC))
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

  it('with a byte cap, streams the export and returns it when it fits', async () => {
    mockExport.mockResolvedValue({ data: Readable.from([Buffer.from('Weekly '), Buffer.from('report')]) })
    const text = await createDriveGateway(CREDS).downloadText(entry(DOC), { maxBytes: 100 })
    expect(text).toBe('Weekly report')
    expect(mockExport).toHaveBeenCalledWith({ fileId: 'file-id-0000000000', mimeType: 'text/plain' }, { responseType: 'stream' })
  })

  it('with a byte cap, stops reading an export that is too large', async () => {
    let pulled = 0
    const endless = new Readable({ read() { pulled++; this.push(Buffer.alloc(64, 'x')) } })
    mockExport.mockResolvedValue({ data: endless })
    await expect(createDriveGateway(CREDS).downloadText(entry(DOC), { maxBytes: 1000 })).rejects.toBeInstanceOf(FileTooLargeError)
    expect(pulled).toBeLessThan(40)
    expect(endless.destroyed).toBe(true)
  })
})

describe('createDriveGateway().listTree', () => {
  beforeEach(() => mockList.mockReset())

  it('stops listing once the deadline has passed', async () => {
    mockList.mockResolvedValue({ data: { files: [{ id: 'sub-folder-000000', name: 's', mimeType: 'application/vnd.google-apps.folder' }] } })
    await expect(createDriveGateway(CREDS).listTree('root-folder-0000000', { deadline: Date.now() - 1 })).rejects.toThrow(/time/)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('lists normally without a deadline', async () => {
    mockList.mockResolvedValue({ data: { files: [{ id: 'f-000000000000', name: 'a.csv', mimeType: 'text/csv' }] } })
    expect(await createDriveGateway(CREDS).listTree('root-folder-0000000')).toEqual([expect.objectContaining({ id: 'f-000000000000' })])
  })
})
