// Transcripción de notas de voz en Android: el WebView no trae el reconocimiento de voz de
// Chrome, así que al terminar de grabar se pasa el audio (PCM 16 kHz mono) al reconocedor de
// Android, en el propio celular (plugin nativo Voz, Android 13+).
import { nativo } from './plataforma.js'
import { b64 } from './cifrado.js'

export const FRECUENCIA = 16000

/** Muestras flotantes (-1..1) → PCM de 16 bits little-endian. */
export function flotanteAPcm16(muestras) {
  const out = new DataView(new ArrayBuffer(muestras.length * 2))
  for (let i = 0; i < muestras.length; i++) {
    const v = Math.max(-1, Math.min(1, muestras[i]))
    out.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true)
  }
  return new Uint8Array(out.buffer)
}

/** Un audio (Blob o data: URL) → PCM 16 kHz mono. */
export async function pcmDeAudio(audio) {
  const blob = typeof audio === 'string' ? await (await fetch(audio)).blob() : audio
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  let datos
  try { datos = await ctx.decodeAudioData(await blob.arrayBuffer()) } finally { ctx.close().catch(() => {}) }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(datos.duration * FRECUENCIA)), FRECUENCIA)
  const fuente = off.createBufferSource()
  fuente.buffer = datos
  fuente.connect(off.destination)
  fuente.start()
  return flotanteAPcm16((await off.startRendering()).getChannelData(0))
}

/** Transcribe una nota de voz en Android. Devuelve el texto (puede ser '' si no se entendió). */
export async function transcribirAudio(audio, idioma = 'es-PE') {
  const pcm = await pcmDeAudio(audio)
  const r = await nativo('Voz', 'transcribir', { pcm: b64.a(pcm), frecuencia: FRECUENCIA, idioma })
  return (r?.texto || '').replace(/\s+/g, ' ').trim()
}
