// Locks the GRACEFUL contract of services/embeddings.ts. The native embedding
// call cannot run in Jest, so we only assert the "model missing → null, never
// throws" path (the contract callers depend on) plus the model constants.

const mockInitLlama = jest.fn()
jest.mock('llama.rn', () => ({ initLlama: (...args: unknown[]) => mockInitLlama(...args) }))

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn(),
}))

import { embedText, embedModelExists, EMBED_MODEL_DIM, EMBED_MODEL_DOWNLOAD_URL, EMBED_MODEL_FILENAME } from '../embeddings'

describe('embeddings model constants', () => {
  it('points at an ungated bge-small-en-v1.5 GGUF mirror (CompendiumLabs)', () => {
    expect(EMBED_MODEL_DOWNLOAD_URL).toContain('CompendiumLabs')
    expect(EMBED_MODEL_DOWNLOAD_URL).toContain('bge-small-en-v1.5')
    expect(EMBED_MODEL_DOWNLOAD_URL).toContain('.gguf')
    expect(EMBED_MODEL_FILENAME).toBe('bge-small-en-v1.5-q8_0.gguf')
    expect(EMBED_MODEL_DIM).toBe(384)
  })
})

describe('embedText — graceful contract', () => {
  beforeEach(() => {
    mockInitLlama.mockReset()
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync.mockResolvedValue({ exists: false })
  })

  it('returns null when the model file is absent (never inits, never throws)', async () => {
    const result = await embedText('is coding a safe career?')
    expect(result).toBeNull()
    // Must not attempt to load a non-existent model.
    expect(mockInitLlama).not.toHaveBeenCalled()
  })

  it('embedModelExists reflects the file-system probe', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync.mockResolvedValueOnce({ exists: true })
    expect(await embedModelExists()).toBe(true)
    fs.getInfoAsync.mockResolvedValueOnce({ exists: false })
    expect(await embedModelExists()).toBe(false)
  })

  it('returns null (not a throw) when getInfoAsync itself rejects', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync.mockRejectedValueOnce(new Error('fs blew up'))
    await expect(embedText('x')).resolves.toBeNull()
  })
})
