// Shared fixtures for the Drive sync tests.
import { vi } from 'vitest'
import type { DriveEntry, DriveGateway, MediaStore } from '../syncDriveFolder'

export const MATH_CSV = [
  'ID,Topic,Subtopic,Difficulty,Question,A,B,C,D,Answer,Solution',
  'UPCAT-MATH-001,Algebra,Ratio,Average,Q1?,a,b,c,d,B,s1',
  'UPCAT-MATH-002,Geometry,Angles,Easy,Q2?,a,b,c,d,A,s2',
].join('\n')

export const SCI_CSV = [
  'ID,Topic,Subtopic,Difficulty,HasFigure,FigureFile,FigureCaption,Question,A,B,C,D,Answer,Solution',
  'UPCAT-SCI-001,Physics,Speed,Easy,no,,,Q1?,a,b,c,d,D,s',
  'UPCAT-SCI-003,Physics,Circuits,Average,yes,diagrams/circuit_3.png,Series circuit,Q3?,a,b,c,d,C,s',
  'UPCAT-SCI-004,Physics,Circuits,Average,yes,diagrams/circuit_3.png,Series circuit,Q4?,a,b,c,d,A,s',
  'UPCAT-SCI-005,Biology,Cells,Easy,yes,diagrams/missing.png,A cell,Q5?,a,b,c,d,B,s',
].join('\n')

export function pngBytes(w: number, h: number) {
  const b = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20)
  return b
}

export function entry(p: Partial<DriveEntry> & { id: string; name: string }): DriveEntry {
  return { mimeType: 'text/csv', md5Checksum: `md5-${p.id}`, modifiedTime: '2026-09-14T00:00:00Z', path: 'Iskotify Questions', ...p }
}

export function gateway(entries: DriveEntry[], texts: Record<string, string>, bytes: Record<string, Buffer> = {}) {
  const drive: DriveGateway = {
    listTree: vi.fn(async () => entries),
    downloadText: vi.fn(async (e: DriveEntry) => {
      if (!(e.id in texts)) throw new Error(`boom ${e.id}`)
      return texts[e.id]!
    }),
    downloadBytes: vi.fn(async (e: DriveEntry) => bytes[e.id]!),
  }
  return drive
}

export const noAi = async () => null
export const aiReturns = (json: unknown) => vi.fn(async () => JSON.stringify(json))

export function mediaStore() {
  const media: MediaStore = { upload: vi.fn(async (key: string) => `https://cdn.test/question-media/${key}`) }
  return media
}
