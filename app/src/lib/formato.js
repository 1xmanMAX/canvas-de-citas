// Formato dentro del texto de las tarjetas, con marcas como en Markdown (el texto sigue siendo texto:
// lo leen igual el buscador, la sincronización y Claude):
//   **negrita**   *cursiva*   __subrayado__   ==resaltado==
// Una marca sin su pareja se deja tal cual (p. ej. "5 * 3"). Puro: se prueba sin navegador.

export const MARCAS = { b: '**', i: '*', u: '__', h: '==' }
const ESTILO = { '**': 'b', '*': 'i', '__': 'u', '==': 'h' }
const SEPARAR = /(\*\*|__|==|\*)/

/** Tramos de un párrafo: [{ t, b, i, u, h }] (b negrita, i cursiva, u subrayado, h resaltado). */
export function tramos(parrafo) {
  const partes = String(parrafo ?? '').split(SEPARAR)
  const abiertos = { b: false, i: false, u: false, h: false }
  const out = []
  let actual = ''
  const soltar = () => { if (actual) out.push({ t: actual, ...abiertos }); actual = '' }
  for (let k = 0; k < partes.length; k++) {
    const p = partes[k]
    const e = k % 2 === 1 ? ESTILO[p] : null // las marcas quedan en los índices impares
    if (e) {
      if (abiertos[e]) { soltar(); abiertos[e] = false; continue }
      // Abre solo si más adelante en el párrafo está la que la cierra.
      if (partes.some((q, j) => j > k && j % 2 === 1 && q === p)) { soltar(); abiertos[e] = true; continue }
    }
    actual += p
  }
  soltar()
  return out
}

/** ¿El texto tiene alguna marca de formato con su pareja? */
export const tieneFormato = texto => String(texto ?? '').split('\n').some(p => tramos(p).some(s => s.b || s.i || s.u || s.h))

/** El texto sin las marcas. */
export const sinFormato = texto => String(texto ?? '').split('\n').map(p => tramos(p).map(s => s.t).join('')).join('\n')

/** Variante de una fuente CSS ("400 12px Familia") en negrita y/o cursiva. */
export function variante(font, b, i) {
  if (!b && !i) return font
  const m = /^(italic\s+)?(\d+)\s+(.*)$/.exec(font)
  if (!m) return (i ? 'italic ' : '') + (b ? 'bold ' : '') + font
  return `${i || m[1] ? 'italic ' : ''}${b ? Math.max(700, +m[2]) : m[2]} ${m[3]}`
}

/**
 * Como envolver() (texto.js) pero con formato: renglones { texto, tramos: [{ t, b, i, u, h, x, w }] }
 * (x y w para dibujar el resaltado). `medir(texto, font)` es la medición en píxeles.
 */
export function envolverConFormato(texto, font, max, maxLineas, medir) {
  const lineas = []
  for (const parrafo of String(texto ?? '').split('\n')) {
    // Palabras: grupos de pedazos sin espacios (una palabra puede tener partes con distinto estilo).
    const palabras = []
    let palabra = []
    for (const s of tramos(parrafo)) {
      for (const pedazo of s.t.split(/(\s+)/)) {
        if (!pedazo) continue
        if (/^\s+$/.test(pedazo)) { if (palabra.length) palabras.push(palabra); palabra = [] }
        else palabra.push({ ...s, t: pedazo })
      }
    }
    if (palabra.length) palabras.push(palabra)
    const espacio = medir(' ', font)
    let renglon = [], ancho = 0
    const cerrar = () => { lineas.push(renglon); renglon = []; ancho = 0 }
    for (const p of palabras) {
      const w = p.reduce((s, x) => s + medir(x.t, variante(font, x.b, x.i)), 0)
      if (renglon.length && ancho + espacio + w > max) cerrar()
      if (renglon.length) {
        // El espacio lleva el estilo que comparten las dos palabras (así un subrayado o resaltado sigue de corrido).
        const a = renglon.at(-1), z = p[0]
        renglon.push({ t: ' ', b: a.b && z.b, i: a.i && z.i, u: a.u && z.u, h: a.h && z.h })
        ancho += espacio
      }
      renglon.push(...p)
      ancho += w
    }
    cerrar()
  }
  let cortado = false
  if (lineas.length > maxLineas) { lineas.length = maxLineas; cortado = true }
  return lineas.map((r, n) => {
    if (cortado && n === lineas.length - 1) r = [...r, { t: ' …', b: false, i: false, u: false, h: false }]
    // Junta los pedazos seguidos con el mismo estilo y ubica cada tramo.
    const juntos = []
    for (const x of r) {
      const u = juntos.at(-1)
      if (u && u.b === x.b && u.i === x.i && u.u === x.u && u.h === x.h) u.t += x.t
      else juntos.push({ t: x.t, b: !!x.b, i: !!x.i, u: !!x.u, h: !!x.h })
    }
    let x = 0
    for (const s of juntos) { s.x = x; s.w = medir(s.t, variante(font, s.b, s.i)); x += s.w }
    return { texto: juntos.map(s => s.t).join(''), tramos: juntos }
  })
}

/**
 * Pone o quita una marca alrededor de lo seleccionado en un campo de texto (textarea o input).
 * Sin selección, deja el cursor entre las dos marcas. Devuelve { valor, inicio, fin }.
 */
export function alternarMarca(valor, inicio, fin, estilo) {
  const m = MARCAS[estilo]
  const sel = valor.slice(inicio, fin)
  // Ya está marcada (las marcas justo afuera o dentro de la selección): se quitan.
  if (valor.slice(inicio - m.length, inicio) === m && valor.slice(fin, fin + m.length) === m
    && !(estilo === 'i' && (valor.slice(inicio - 2, inicio) === '**') !== (valor.slice(fin, fin + 2) === '**'))) {
    return { valor: valor.slice(0, inicio - m.length) + sel + valor.slice(fin + m.length), inicio: inicio - m.length, fin: fin - m.length }
  }
  if (sel.length > 2 * m.length && sel.startsWith(m) && sel.endsWith(m)) {
    const dentro = sel.slice(m.length, -m.length)
    return { valor: valor.slice(0, inicio) + dentro + valor.slice(fin), inicio, fin: inicio + dentro.length }
  }
  // Los espacios de los bordes quedan fuera de la marca ("**palabra** " y no "**palabra **").
  const a = sel.length - sel.trimStart().length, z = sel.length - sel.trimEnd().length
  const i0 = inicio + a, f0 = fin - z
  const nuevo = valor.slice(0, i0) + m + valor.slice(i0, f0) + m + valor.slice(f0)
  return { valor: nuevo, inicio: i0 + m.length, fin: f0 + m.length }
}
