// Notas de voz: grabación con MediaRecorder (Opus a baja tasa: ~1,5 MB por 10 min),
// forma de onda para la tarjeta y transcripción en vivo con el reconocimiento de voz del
// navegador (Chrome/Edge; necesita internet). Sin librerías.
export const BARRAS = 48
export const MAX_SEG = 600

const Reconocedor = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const puedeTranscribir = !!Reconocedor
export const puedeGrabar = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

function tipoAudio() {
  for (const t of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']) if (MediaRecorder.isTypeSupported?.(t)) return t
  return ''
}

/** Reduce una lista de niveles (0..1) a `n` barras, normalizadas al máximo. */
export function reducir(niveles, n = BARRAS) {
  if (!niveles.length) return Array(n).fill(0)
  const out = []
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * niveles.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * niveles.length) / n))
    let m = 0
    for (let j = a; j < b && j < niveles.length; j++) m = Math.max(m, niveles[j])
    out.push(m)
  }
  const tope = Math.max(...out) || 1
  return out.map(v => Math.round((v / tope) * 100) / 100)
}

/**
 * Empieza a grabar. `alTexto(final, parcial)` recibe la transcripción en vivo; `alNivel(0..1)` el volumen.
 * Devuelve { detener(): Promise<{ blob, duracion, onda, transcripcion }>, cancelar() }.
 */
export async function grabar({ alTexto, alNivel, idioma = 'es-PE' } = {}) {
  const flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const tipo = tipoAudio()
  const rec = new MediaRecorder(flujo, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 24000 })
  const trozos = []
  rec.ondataavailable = e => e.data.size && trozos.push(e.data)

  // Nivel de volumen para la onda.
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const analizador = ctx.createAnalyser()
  analizador.fftSize = 512
  ctx.createMediaStreamSource(flujo).connect(analizador)
  const buf = new Uint8Array(analizador.fftSize)
  const niveles = []
  const muestrear = setInterval(() => {
    analizador.getByteTimeDomainData(buf)
    let s = 0
    for (const v of buf) s += ((v - 128) / 128) ** 2
    const nivel = Math.min(1, Math.sqrt(s / buf.length) * 3)
    niveles.push(nivel)
    alNivel?.(nivel)
  }, 100)

  // Transcripción en vivo: Chrome corta tras un silencio, así que se reinicia mientras se graba.
  let final = '', activo = true, rc = null
  if (Reconocedor) {
    const iniciar = () => {
      rc = new Reconocedor()
      rc.lang = idioma
      rc.continuous = true
      rc.interimResults = true
      rc.onresult = e => {
        let parcial = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) final = (final + ' ' + t).replace(/\s+/g, ' ').trim()
          else parcial += t
        }
        alTexto?.(final, parcial.trim())
      }
      rc.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'network') activo = false }
      rc.onend = () => { if (activo) try { iniciar() } catch {} }
      try { rc.start() } catch {}
    }
    iniciar()
  }

  const t0 = performance.now()
  rec.start(1000)
  const limite = setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_SEG * 1000)

  function cerrar() {
    activo = false
    clearInterval(muestrear)
    clearTimeout(limite)
    try { rc?.stop() } catch {}
    flujo.getTracks().forEach(t => t.stop())
    ctx.close().catch(() => {})
  }

  return {
    detener: () => new Promise(res => {
      const listo = () => {
        cerrar()
        // Se espera un momento a que llegue el último resultado del reconocedor.
        setTimeout(() => res({
          blob: new Blob(trozos, { type: rec.mimeType || tipo || 'audio/webm' }),
          duracion: Math.round((performance.now() - t0) / 100) / 10,
          onda: reducir(niveles),
          transcripcion: final
        }), 400)
      }
      if (rec.state === 'inactive') listo()
      else { rec.onstop = listo; rec.stop() }
    }),
    cancelar: () => { rec.onstop = null; if (rec.state !== 'inactive') rec.stop(); cerrar() }
  }
}

/** Duración y forma de onda de un archivo de audio (p. ej. recibido del celular). */
export async function analizar(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  try {
    const datos = await ctx.decodeAudioData(await blob.arrayBuffer())
    const canal = datos.getChannelData(0)
    const paso = Math.max(1, Math.floor(canal.length / (BARRAS * 8)))
    const niveles = []
    for (let i = 0; i < canal.length; i += paso) {
      let s = 0
      const fin = Math.min(canal.length, i + paso)
      for (let j = i; j < fin; j++) s += canal[j] * canal[j]
      niveles.push(Math.sqrt(s / (fin - i)))
    }
    return { duracion: Math.round(datos.duration * 10) / 10, onda: reducir(niveles) }
  } finally { ctx.close().catch(() => {}) }
}

export const aDataURL = blob => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(r.result)
  r.onerror = () => rej(r.error)
  r.readAsDataURL(blob)
})

// --- Reproducción: un solo reproductor para toda la app ---
let reproductor = null
export const sonando = $state({ id: null })
export function reproducir(id, src) {
  const mismo = sonando.id === id
  if (reproductor) { reproductor.pause(); reproductor = null; sonando.id = null }
  if (mismo) return
  const r = (reproductor = new Audio(src))
  sonando.id = id
  const fin = () => { if (reproductor === r) { reproductor = null; sonando.id = null } }
  r.onended = fin
  r.onerror = fin
  r.play().catch(fin)
}
