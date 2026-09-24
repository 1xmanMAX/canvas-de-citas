// Motor de PDF en un hilo aparte: PDFium (el de Chrome) compilado a WebAssembly.
// Dibuja páginas a ImageBitmap, extrae el texto con su posición y busca. El hilo principal
// nunca espera a PDFium: pide trabajos y recibe resultados (la pantalla sigue fluida).
import { init } from '@embedpdf/pdfium'
import wasmUrl from '@embedpdf/pdfium/pdfium.wasm?url'

let P = null // módulo PDFium envuelto
let doc = 0, datosPtr = 0, tamanos = []
const paginas = new Map() // n → { page, text } (LRU pequeño de páginas abiertas)
const cola = new Map() // clave → trabajo de dibujo pendiente
let ocupado = false

const mem = () => P.pdfium.HEAPU8
const malloc = n => P.pdfium.wasmExports.malloc(n)
const free = p => P.pdfium.wasmExports.free(p)
const leerDouble = p => P.pdfium.getValue(p, 'double')
const leerFloat = p => P.pdfium.getValue(p, 'float')

async function iniciar() {
  if (P) return
  const wasmBinary = await (await fetch(wasmUrl)).arrayBuffer()
  P = await init({ wasmBinary })
  P.PDFiumExt_Init()
}

function cerrarDoc() {
  for (const { page, text } of paginas.values()) { if (text) P.FPDFText_ClosePage(text); P.FPDF_ClosePage(page) }
  paginas.clear()
  cola.clear()
  if (dispPtr) { free(dispPtr); dispPtr = 0 }
  if (doc) P.FPDF_CloseDocument(doc)
  if (datosPtr) free(datosPtr)
  doc = datosPtr = 0
}

function pagina(n, conTexto = false) {
  let e = paginas.get(n)
  if (e) { paginas.delete(n); paginas.set(n, e) } // LRU
  else {
    e = { page: P.FPDF_LoadPage(doc, n), text: 0 }
    paginas.set(n, e)
    while (paginas.size > 6) {
      const [k, v] = paginas.entries().next().value
      if (v.text) P.FPDFText_ClosePage(v.text)
      P.FPDF_ClosePage(v.page)
      paginas.delete(k)
    }
  }
  if (conTexto && !e.text) e.text = P.FPDFText_LoadPage(e.page)
  return e
}

async function abrir(buffer) {
  await iniciar()
  cerrarDoc()
  const bytes = new Uint8Array(buffer)
  datosPtr = malloc(bytes.length) // PDFium lee de esta memoria mientras el documento esté abierto
  mem().set(bytes, datosPtr)
  doc = P.FPDF_LoadMemDocument(datosPtr, bytes.length, '')
  if (!doc) {
    const err = P.FPDF_GetLastError()
    free(datosPtr); datosPtr = 0
    throw new Error(err === 4 ? 'El PDF está protegido con contraseña' : `No se pudo leer el PDF (error ${err})`)
  }
  const n = P.FPDF_GetPageCount(doc), t = malloc(8)
  tamanos = []
  for (let i = 0; i < n; i++) {
    P.FPDF_GetPageSizeByIndexF(doc, i, t)
    tamanos.push({ w: leerFloat(t), h: leerFloat(t + 4) })
  }
  free(t)
  return tamanos
}

/** Dibuja la página n a `escala` (px por punto) y devuelve un ImageBitmap. */
async function dibujar(n, escala) {
  const { w: pw, h: ph } = tamanos[n]
  // Tope de 16 MP por página para no agotar la memoria con zoom extremo.
  const s = Math.min(escala, Math.sqrt(16e6 / (pw * ph)))
  const w = Math.max(1, Math.round(pw * s)), h = Math.max(1, Math.round(ph * s))
  const { page } = pagina(n)
  const bmp = P.FPDFBitmap_Create(w, h, 1)
  P.FPDFBitmap_FillRect(bmp, 0, 0, w, h, 0xffffffff)
  P.FPDF_RenderPageBitmap(bmp, page, 0, 0, w, h, 0, 0x01 | 0x10) // anotaciones + orden RGBA
  const buf = P.FPDFBitmap_GetBuffer(bmp), stride = P.FPDFBitmap_GetStride(bmp)
  const px = new Uint8ClampedArray(w * h * 4)
  const heap = mem()
  if (stride === w * 4) px.set(heap.subarray(buf, buf + w * h * 4))
  else for (let y = 0; y < h; y++) px.set(heap.subarray(buf + y * stride, buf + y * stride + w * 4), y * w * 4)
  P.FPDFBitmap_Destroy(bmp)
  return createImageBitmap(new ImageData(px, w, h))
}

// Coordenadas de página (PDF: origen abajo a la izquierda, relativas a la MediaBox) → puntos de la
// página tal como se dibuja (origen arriba a la izquierda, con recorte y rotación aplicados).
const K = 16 // subdivisiones por punto (el resultado de PDFium es entero)
let dispPtr = 0
function aVista(page, n, x, y) {
  dispPtr ||= malloc(8)
  const { w, h } = tamanos[n]
  P.FPDF_PageToDevice(page, 0, 0, Math.round(w * K), Math.round(h * K), 0, x, y, dispPtr, dispPtr + 4)
  return [P.pdfium.getValue(dispPtr, 'i32') / K, P.pdfium.getValue(dispPtr + 4, 'i32') / K]
}
function rectVista(page, n, l, t, r, b) {
  const [x1, y1] = aVista(page, n, l, t), [x2, y2] = aVista(page, n, r, b)
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
}

/** Segmentos de texto de la página n: [{ x, y, w, h, t }] en puntos, origen arriba a la izquierda. */
function texto(n) {
  const { page, text } = pagina(n, true)
  const nChars = P.FPDFText_CountChars(text)
  if (nChars <= 0) return []
  const nRects = P.FPDFText_CountRects(text, 0, nChars)
  const r = malloc(32), segs = []
  for (let i = 0; i < nRects; i++) {
    if (!P.FPDFText_GetRect(text, i, r, r + 8, r + 16, r + 24)) continue
    const l = leerDouble(r), t = leerDouble(r + 8), d = leerDouble(r + 16), b = leerDouble(r + 24)
    const largo = P.FPDFText_GetBoundedText(text, l, t, d, b, 0, 0)
    if (largo <= 0) continue
    const p = malloc((largo + 1) * 2)
    P.FPDFText_GetBoundedText(text, l, t, d, b, p, largo)
    const s = P.pdfium.UTF16ToString(p)
    free(p)
    if (s.trim()) segs.push({ ...rectVista(page, n, l, t, d, b), t: s })
  }
  free(r)
  return segs
}

/** Busca `q` en todo el documento; devuelve [{ n, rects: [{x,y,w,h}] }] (puntos, arriba-izquierda). */
function buscar(q) {
  const res = []
  const bytes = (q.length + 1) * 2, qp = malloc(bytes)
  P.pdfium.stringToUTF16(q, qp, bytes)
  const r = malloc(32)
  for (let n = 0; n < tamanos.length; n++) {
    const { page, text } = pagina(n, true)
    const h = P.FPDFText_FindStart(text, qp, 0, 0)
    const rects = []
    while (P.FPDFText_FindNext(h)) {
      const idx = P.FPDFText_GetSchResultIndex(h), cnt = P.FPDFText_GetSchCount(h)
      const nr = P.FPDFText_CountRects(text, idx, cnt)
      const grupo = []
      for (let i = 0; i < nr; i++) if (P.FPDFText_GetRect(text, i, r, r + 8, r + 16, r + 24)) {
        const l = leerDouble(r), t = leerDouble(r + 8), d = leerDouble(r + 16), b = leerDouble(r + 24)
        grupo.push(rectVista(page, n, l, t, d, b))
      }
      rects.push(grupo)
    }
    P.FPDFText_FindClose(h)
    if (rects.length) res.push({ n, coincidencias: rects })
  }
  free(qp); free(r)
  return res
}

// --- Cola de dibujo: se atiende primero lo más cercano a la vista; lo que salió de la vista se descarta ---
function programar() {
  if (ocupado || !cola.size) return
  ocupado = true
  setTimeout(procesar, 0) // deja entrar mensajes nuevos (prioridades, descartes) entre trabajos
}

async function procesar() {
  let mejor = null
  for (const t of cola.values()) if (!mejor || t.prioridad < mejor.prioridad) mejor = t
  if (!mejor) { ocupado = false; return } // la cola se vació (descartes) mientras esperaba
  cola.delete(mejor.clave)
  try {
    const bitmap = await dibujar(mejor.n, mejor.escala)
    postMessage({ tipo: 'pagina', n: mejor.n, nivel: mejor.nivel, escala: mejor.escala, doc: mejor.doc, bitmap }, [bitmap])
  } catch (e) { postMessage({ tipo: 'error', mensaje: String(e?.message || e) }) }
  ocupado = false
  programar()
}

let docActual = 0
onmessage = async ({ data: m }) => {
  try {
    if (m.tipo === 'abrir') {
      docActual = m.doc
      const t = await abrir(m.buffer)
      postMessage({ tipo: 'abierto', doc: m.doc, paginas: t })
    } else if (m.tipo === 'pedir') {
      // Reemplaza pedidos anteriores de la misma página y nivel.
      if (m.doc !== docActual || !doc) return
      for (const p of m.paginas) cola.set(`${p.n}:${p.nivel}`, { ...p, clave: `${p.n}:${p.nivel}`, doc: m.doc })
      programar()
    } else if (m.tipo === 'descartar') {
      for (const k of [...cola.keys()]) if (!m.conservar.includes(+k.split(':')[0])) cola.delete(k)
    } else if (m.tipo === 'texto') {
      if (m.doc === docActual && doc) postMessage({ tipo: 'texto', n: m.n, doc: m.doc, segs: texto(m.n) })
    } else if (m.tipo === 'buscar') {
      if (m.doc === docActual && doc) postMessage({ tipo: 'busqueda', q: m.q, doc: m.doc, res: m.q.trim() ? buscar(m.q.trim()) : [] })
    } else if (m.tipo === 'cerrar') {
      cerrarDoc()
    }
  } catch (e) {
    postMessage({ tipo: 'error', mensaje: String(e?.message || e), doc: m.doc })
  }
}
