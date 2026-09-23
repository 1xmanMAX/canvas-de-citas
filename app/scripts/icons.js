// Genera los PNG del ícono a partir de SVG (solo se ejecuta al cambiar el ícono).
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'

const c = (s, r) => `<path d="M${s * 0.64} ${s * 0.36}A${r} ${r} 0 1 0 ${s * 0.64} ${s * 0.64}" fill="none" stroke="#F7F5EF" stroke-width="${s * 0.1}" stroke-linecap="round"/>`
const redondo = s => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" rx="${s * 0.22}" fill="#2E4B5E"/>${c(s, s * 0.2)}</svg>`
const lleno = (s, k) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" fill="#2E4B5E"/><g transform="translate(${s * (1 - k) / 2} ${s * (1 - k) / 2}) scale(${k})">${c(s, s * 0.2)}</g></svg>`
const png = (svg, f) => writeFileSync('public/' + f, new Resvg(svg).render().asPng())

writeFileSync('public/icon.svg', redondo(64))
png(redondo(192), 'icon-192.png')
png(redondo(512), 'icon-512.png')
png(lleno(512, 0.7), 'icon-maskable-512.png')
png(lleno(180, 0.85), 'apple-touch-icon.png')

// icon.ico (Windows: acceso directo de escritorio). Contenedor ICO con entradas PNG.
const tamanos = [16, 32, 48, 256]
const pngs = tamanos.map(s => new Resvg(redondo(s)).render().asPng())
const cabecera = Buffer.alloc(6 + 16 * pngs.length)
cabecera.writeUInt16LE(0, 0)
cabecera.writeUInt16LE(1, 2)
cabecera.writeUInt16LE(pngs.length, 4)
let desplazamiento = cabecera.length
pngs.forEach((p, i) => {
  const o = 6 + 16 * i, s = tamanos[i]
  cabecera.writeUInt8(s >= 256 ? 0 : s, o)
  cabecera.writeUInt8(s >= 256 ? 0 : s, o + 1)
  cabecera.writeUInt16LE(1, o + 4)
  cabecera.writeUInt16LE(32, o + 6)
  cabecera.writeUInt32LE(p.length, o + 8)
  cabecera.writeUInt32LE(desplazamiento, o + 12)
  desplazamiento += p.length
})
writeFileSync('public/icon.ico', Buffer.concat([cabecera, ...pngs]))
console.log('Íconos generados')
