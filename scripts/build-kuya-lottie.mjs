// Builds apps/mobile/assets/animations/kuya-baw-hero.json — a Lottie image-
// sequence animation of the Kuya Baw hero mascot, generated from
// apps/mobile/assets/images/kuya_baw_animated_for_hero_section.mp4.
//
// The source video has a flat #3E7E4A green screen; frames are chroma-keyed
// to TRANSPARENT (not green) so the hero band behind it can be the app's
// maroon accent. Each frame is palette-quantized PNG8+alpha (~10 KB) and
// embedded as a base64 asset; one image layer per frame with ip/op windows
// produces the sequence.
//
// Reproduce:
//   1. ffmpeg -i apps/mobile/assets/images/kuya_baw_animated_for_hero_section.mp4 \
//        -vf "fps=12,colorkey=0x3E7E4A:0.18:0.08,despill=type=green,crop=792:672:64:32,scale=320:-2" \
//        <framesDir>/f%03d.png
//   2. npm i sharp (anywhere; pass via NODE_PATH if not local)
//   3. node scripts/build-kuya-lottie.mjs <framesDir>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const framesDir = process.argv[2]
if (!framesDir) { console.error('usage: node build-kuya-lottie.mjs <framesDir>'); process.exit(1) }

const FR = 12
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(repoRoot, 'apps', 'mobile', 'assets', 'animations', 'kuya-baw-hero.json')

const files = readdirSync(framesDir).filter(f => f.endsWith('.png')).sort()
if (files.length === 0) { console.error('no frames found in ' + framesDir); process.exit(1) }

const assets = []
const layers = []
let w = 0, h = 0

for (let i = 0; i < files.length; i++) {
  const quantized = await sharp(join(framesDir, files[i]))
    .png({ palette: true, colors: 128, quality: 70, compressionLevel: 9, effort: 10 })
    .toBuffer()
  const meta = await sharp(quantized).metadata()
  w = meta.width; h = meta.height
  assets.push({
    id: `img_${i}`, w, h, u: '',
    p: `data:image/png;base64,${quantized.toString('base64')}`, e: 1,
  })
  layers.push({
    ddd: 0, ind: i + 1, ty: 2, nm: `f${i}`, refId: `img_${i}`, sr: 1,
    ks: {
      o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
      p: { a: 0, k: [w / 2, h / 2, 0] }, a: { a: 0, k: [w / 2, h / 2, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0, ip: i, op: i + 1, st: 0, bm: 0,
  })
}

const lottie = {
  v: '5.7.4', fr: FR, ip: 0, op: files.length, w, h,
  nm: 'Kuya Baw Hero', ddd: 0, assets, layers, markers: [],
}

writeFileSync(outPath, JSON.stringify(lottie))
const mb = (Buffer.byteLength(JSON.stringify(lottie)) / 1024 / 1024).toFixed(2)
console.log(`wrote ${outPath} — ${files.length} frames @ ${FR}fps, ${w}x${h}, ${mb} MB`)
