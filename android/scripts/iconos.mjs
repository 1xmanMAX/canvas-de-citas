// Íconos del lanzador y pantalla de inicio de Android con el mismo diseño que la PWA
// (app/scripts/icons.js). Solo se ejecuta al cambiar el ícono: node scripts/iconos.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'

const { Resvg } = createRequire(new URL('../../app/package.json', import.meta.url))('@resvg/resvg-js')
const RES = new URL('../android/app/src/main/res/', import.meta.url)
const AZUL = '#2E4B5E', PAPEL = '#F7F5EF'

// La "C" del logo, centrada en un lienzo de s×s y con radio r.
const c = (s, r) => `<path d="M${s / 2 + r * 0.7} ${s / 2 - r * 0.7}A${r} ${r} 0 1 0 ${s / 2 + r * 0.7} ${s / 2 + r * 0.7}" fill="none" stroke="${PAPEL}" stroke-width="${s * 0.1}" stroke-linecap="round"/>`
const svg = (s, fondo, trazo) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${fondo}${trazo}</svg>`
const png = (texto, archivo) => writeFileSync(new URL(archivo, RES), new Resvg(texto).render().asPng())

const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [d, k] of Object.entries(DENSIDADES)) {
  mkdirSync(new URL(`mipmap-${d}/`, RES), { recursive: true })
  const s = 48 * k, f = 108 * k
  png(svg(s, `<rect width="${s}" height="${s}" rx="${s * 0.22}" fill="${AZUL}"/>`, c(s, s * 0.2)), `mipmap-${d}/ic_launcher.png`)
  png(svg(s, `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="${AZUL}"/>`, c(s, s * 0.2)), `mipmap-${d}/ic_launcher_round.png`)
  // Ícono adaptativo: solo el trazo (el fondo es un color); zona segura = 66/108 del lienzo.
  const t = svg(f, "", c(f, f * 0.132)).replace(`stroke-width="${f * 0.1}"`, `stroke-width="${f * 0.066}"`)
  png(t, `mipmap-${d}/ic_launcher_foreground.png`)
}
writeFileSync(new URL('values/ic_launcher_background.xml', RES), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${AZUL}</color>\n</resources>\n`)

// Pantalla de inicio: color papel con el ícono al centro (en vez del logo de Capacitor).
for (const dir of readdirSync(RES)) if (/^drawable(-(land|port)-\w+)?$/.test(dir)) rmSync(new URL(`${dir}/splash.png`, RES), { force: true })
mkdirSync(new URL('drawable/', RES), { recursive: true })
writeFileSync(new URL('drawable/splash.xml', RES), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/fondo_inicio" />
    <item android:width="96dp" android:height="96dp" android:gravity="center" android:drawable="@mipmap/ic_launcher" />
</layer-list>
`)
writeFileSync(new URL('values/fondo_inicio.xml', RES), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="fondo_inicio">${PAPEL}</color>\n</resources>\n`)
console.log('Íconos de Android generados')
