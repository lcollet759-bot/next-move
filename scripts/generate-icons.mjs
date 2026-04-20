/**
 * Génère les icônes PWA Next Move dans public/
 * Design : fond carré terracotta #C4623A + chevrons >> blancs centrés
 * Usage : node scripts/generate-icons.mjs
 */
import sharp from 'sharp'
import { writeFileSync } from 'fs'

// ── SVG source ────────────────────────────────────────────────────────────────
// Viewbox 512x512, fond plein terracotta, deux chevrons >> blancs
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#C4623A"/>
  <polyline
    points="142,180 242,256 142,332"
    fill="none" stroke="white" stroke-width="56"
    stroke-linecap="round" stroke-linejoin="round"/>
  <polyline
    points="254,180 354,256 254,332"
    fill="none" stroke="white" stroke-width="56"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const svgBuf = Buffer.from(SVG)

async function gen(size, filename) {
  await sharp(svgBuf)
    .resize(size, size)
    .png()
    .toFile(`public/${filename}`)
  console.log(`✓ public/${filename} (${size}×${size})`)
}

// PNG pour Android
await gen(192, 'icon-192x192.png')
await gen(512, 'icon-512x512.png')

// Apple touch icon (iOS)
await gen(180, 'apple-touch-icon.png')

// favicon.ico — navigateur (PNG renommé, accepté par tous les browsers modernes)
await gen(32, 'favicon.ico')

console.log('\nToutes les icônes générées dans public/')
