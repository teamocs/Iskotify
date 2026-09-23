import { describe, it, expect } from 'vitest'
import { readImageSize, mimeForExt } from '../imageSize'

function png(w: number, h: number) {
  const b = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20)
  return b
}

function gif(w: number, h: number) {
  const b = Buffer.alloc(10)
  b.write('GIF89a', 0, 'ascii'); b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8)
  return b
}

function jpeg(w: number, h: number) {
  // SOI, APP0 (len 16), SOF0 (len 17) with height/width
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.alloc(14)])
  const sof = Buffer.alloc(19)
  sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8
  sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof])
}

describe('readImageSize', () => {
  it('reads PNG, GIF and JPEG dimensions', () => {
    expect(readImageSize(png(640, 480))).toEqual({ width: 640, height: 480 })
    expect(readImageSize(gif(120, 90))).toEqual({ width: 120, height: 90 })
    expect(readImageSize(jpeg(800, 600))).toEqual({ width: 800, height: 600 })
  })
  it('returns null for unknown or truncated data', () => {
    expect(readImageSize(Buffer.from('not an image'))).toBeNull()
    expect(readImageSize(Buffer.alloc(0))).toBeNull()
  })
})

describe('mimeForExt', () => {
  it('maps allowed figure extensions and rejects others', () => {
    expect(mimeForExt('diagrams/circuit_3.png')).toBe('image/png')
    expect(mimeForExt('a.JPG')).toBe('image/jpeg')
    expect(mimeForExt('a.svg')).toBe('image/svg+xml')
    expect(mimeForExt('a.exe')).toBeNull()
  })
})
