// Imágenes para las tarjetas de foto: data URL + proporción (ancho/alto), reducidas como en la app
// (máx. 1024 px, JPEG ~0.78) usando System.Drawing de Windows, sin dependencias.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }
const EXT = Object.fromEntries(Object.entries(MIME).map(([e, m]) => [m, e === 'jpeg' ? 'jpg' : e]))

/** { w, h } leyendo la cabecera del archivo. */
export function dimensiones(buf, ext) {
  if (ext === 'svg') {
    const t = buf.toString('utf8', 0, Math.min(buf.length, 4000))
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t)
    if (vb) return { w: +vb[1], h: +vb[2] }
    const w = /\swidth\s*=\s*["']([\d.]+)/i.exec(t), h = /\sheight\s*=\s*["']([\d.]+)/i.exec(t)
    return w && h ? { w: +w[1], h: +h[1] } : { w: 4, h: 3 }
  }
  if (buf.toString('ascii', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  if (buf.toString('ascii', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const tipo = buf.toString('ascii', 12, 16)
    if (tipo === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) }
    if (tipo === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) } }
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const m = buf[i + 1], largo = buf.readUInt16BE(i + 2)
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
      i += 2 + largo
    }
  }
  return { w: 4, h: 3 }
}

/** Reduce con PowerShell/System.Drawing a JPEG de 1024 px de lado máximo. */
function reducir(archivo) {
  const salida = path.join(os.tmpdir(), `canvas-${Date.now()}.jpg`)
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($env:CANVAS_IN)
$s = [Math]::Min(1.0, 1024 / [Math]::Max($img.Width, $img.Height))
$w = [int]($img.Width * $s); $h = [int]($img.Height * $s)
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'HighQualityBicubic'
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($img, 0, 0, $w, $h)
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]78)
$bmp.Save($env:CANVAS_OUT, $enc, $p)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()`
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: { ...process.env, CANVAS_IN: path.resolve(archivo), CANVAS_OUT: salida }, stdio: ['ignore', 'ignore', 'pipe'] })
  const buf = fs.readFileSync(salida)
  fs.rmSync(salida, { force: true })
  return buf
}

/** Lee una imagen y devuelve { imagen: dataURL, proporcion }. */
export function cargarImagen(archivo) {
  if (!fs.existsSync(archivo)) throw new Error(`No existe ${archivo}`)
  const ext = path.extname(archivo).slice(1).toLowerCase()
  if (!MIME[ext]) throw new Error(`Formato no admitido: .${ext} (usa ${Object.keys(MIME).join(', ')})`)
  let buf = fs.readFileSync(archivo), mime = MIME[ext]
  const { w, h } = dimensiones(buf, ext)
  // Las fotos grandes se reducen igual que en la app para que proyectos.json no se infle.
  if (ext !== 'svg' && ext !== 'gif' && (buf.length > 350_000 || Math.max(w, h) > 1024 || ext === 'bmp' || ext === 'webp')) {
    try { buf = reducir(archivo); mime = 'image/jpeg' } catch (e) { if (buf.length > 3_000_000) throw new Error('No se pudo reducir la imagen: ' + e.message) }
  }
  return { imagen: `data:${mime};base64,${buf.toString('base64')}`, proporcion: Math.round((w / h) * 1000) / 1000 }
}

/** Guarda un data URL (imagen o audio) en un archivo y devuelve su ruta. */
export function extraerDataURL(dataUrl, destinoSinExt) {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(dataUrl || '')
  if (!m) throw new Error('El elemento no tiene un archivo incrustado')
  const tipo = m[1].split(';')[0]
  const ext = EXT[tipo] || { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }[tipo] || 'bin'
  const f = `${destinoSinExt}.${ext}`
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, Buffer.from(m[2], 'base64'))
  return f
}
