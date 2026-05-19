// One-time script: node scripts/generate-mascot.js
const { Resvg } = require('@resvg/resvg-js')
const fs = require('fs')
const path = require('path')

const svgContent = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'images', 'kuya-baw-mascot.svg'),
  'utf-8'
)

const resvg = new Resvg(svgContent, { fitTo: { mode: 'width', value: 400 } })
const png = resvg.render().asPng()

const outPath = path.join(__dirname, '..', 'assets', 'images', 'kuya-baw-mascot.png')
fs.writeFileSync(outPath, png)
console.log('✓ kuya-baw-mascot.png (400px wide)')
