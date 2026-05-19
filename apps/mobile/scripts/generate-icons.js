// One-time script: node scripts/generate-icons.js
const { Resvg } = require('@resvg/resvg-js')
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const svgContent = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'images', 'logo.svg'),
  'utf-8'
)

function renderAt(size) {
  const resvg = new Resvg(svgContent, { fitTo: { mode: 'width', value: size } })
  return resvg.render().asPng()
}

const outDir = path.join(__dirname, '..', 'assets', 'images')

async function main() {
  // icon.png — 1024x1024, iOS squircle mask applied by OS, Android fallback
  fs.writeFileSync(path.join(outDir, 'icon.png'), renderAt(1024))
  console.log('✓ icon.png (1024×1024)')

  // adaptive-icon.png — logo scaled to 72% and centered on transparent 1024x1024
  // Android adaptive icon safe zone is ~66%; 72% gives a small breathing margin
  const safeSize = Math.round(1024 * 0.72) // 737px
  const margin = Math.round((1024 - safeSize) / 2) // 143px on each side
  const foreground = renderAt(safeSize)
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: foreground, top: margin, left: margin }])
    .png()
    .toFile(path.join(outDir, 'adaptive-icon.png'))
  console.log('✓ adaptive-icon.png (1024×1024, logo at 72% centered on transparent)')

  // splash.png — 512x512 for splash screen
  fs.writeFileSync(path.join(outDir, 'splash.png'), renderAt(512))
  console.log('✓ splash.png (512×512)')

  console.log('Done — icons written to assets/images/')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
