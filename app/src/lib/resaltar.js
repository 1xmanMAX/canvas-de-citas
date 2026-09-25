// Encontrar y resaltar el texto de una cita dentro de un documento HTML/Markdown, sin tocar su
// DOM: se usa la API de resaltado de CSS (CSS.highlights + ::highlight(nombre)).

/** Range con la primera aparición de `cita` en `raiz` (ignora mayúsculas y espacios), o null. */
export function rangoDeCita(raiz, cita) {
  if (!raiz || !cita) return null
  const doc = raiz.ownerDocument || raiz
  const letras = [], mapa = []
  const w = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  let espacio = true
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.data
    for (let i = 0; i < t.length; i++) {
      if (/\s/.test(t[i])) {
        if (espacio) continue
        letras.push(' ')
        espacio = true
      } else {
        letras.push(t[i].toLowerCase())
        espacio = false
      }
      mapa.push([n, i])
    }
  }
  const texto = letras.join('')
  const q = cita.replace(/^[“"«\s]+|[”"»\s]+$/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  let i = texto.indexOf(q), largo = q.length
  // Si la cita se recortó o cambió al final, basta con su comienzo.
  if (i < 0 && q.length > 60) { largo = 60; i = texto.indexOf(q.slice(0, 60)) }
  if (i < 0 || !largo) return null
  const [a, ai] = mapa[i], [b, bi] = mapa[i + largo - 1]
  const r = doc.createRange()
  r.setStart(a, ai)
  r.setEnd(b, bi + 1)
  return r
}

/** Pone (o quita, si no hay rangos) el resaltado `nombre` en la ventana `win`. */
export function resaltar(win, nombre, rangos) {
  const H = win?.CSS?.highlights
  if (!H || !win.Highlight) return
  if (rangos.length) H.set(nombre, new win.Highlight(...rangos))
  else H.delete(nombre)
}

/** Estilos de los resaltados (se inyectan en los HTML del visor). */
export const ESTILO_RESALTADO = '::highlight(cita){background-color:rgba(242,194,48,.45)}::highlight(cita-activa){background-color:rgba(235,104,52,.65)}'
