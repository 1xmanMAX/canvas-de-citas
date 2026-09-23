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
console.log('Íconos generados')
