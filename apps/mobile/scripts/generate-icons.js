// One-time script: node scripts/generate-icons.js
const { Resvg } = require('@resvg/resvg-js')
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

fs.writeFileSync(path.join(outDir, 'icon.png'), renderAt(1024))
console.log('✓ icon.png (1024×1024)')

fs.writeFileSync(path.join(outDir, 'adaptive-icon.png'), renderAt(1024))
console.log('✓ adaptive-icon.png (1024×1024)')

fs.writeFileSync(path.join(outDir, 'splash.png'), renderAt(512))
console.log('✓ splash.png (512×512)')

console.log('Done — icons written to assets/images/')
