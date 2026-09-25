// Mide la fluidez del lienzo con un tablero grande (300 fuentes, 320 tarjetas, 150 conexiones):
// cuadros por segundo al desplazar, hacer zoom y arrastrar. Uso: npm run build && node tests/e2e/rendimiento.mjs
// Referencia (2026-09, Intel UHD): desplazar y zoom ~55-60 fps, arrastrar ~30-55 fps.
import { servidor, navegador, URL_APP, SALIDA } from './comun.mjs'
const cerrarServidor = await servidor()
const [etiqueta = 'medicion'] = process.argv.slice(2), capturas = process.env.CAPTURAS ? SALIDA : null

// --- Datos sintéticos: 300 fuentes, 250 notas, 40 listas, 30 fotos, 150 conexiones, modo libre + corcho ---
const N_F = 300, N_N = 250, N_L = 40, N_FOTO = 30, N_C = 150
const pad = n => String(n).padStart(3, '0')
const rnd = (a, b) => Math.round(a + Math.random() * (b - a))
const fuentes = Array.from({ length: N_F }, (_, i) => ({ id: `fuente_${pad(i + 1)}`, tipo_fuente: 'articulo_cientifico', autores: [`Autor${i}, A.`, `Otro${i}, B.`], anio: 1990 + (i % 35), titulo: `Título de prueba ${i}`, revista_o_editorial: 'Revista', doi_o_url: '', idioma: 'es', entrada_bibliografia: '', estado_verificacion: 'verificado', fuente_verificacion: '', notas_correccion: '', documento_original: null, tema: `Tema ${i % 8}`, etiquetas: i % 3 ? ['abierto'] : [] }))
const citas = fuentes.map((f, i) => ({ id: `cita_${pad(i + 1)}`, proyecto_id: 'proyecto_001', fuente_id: f.id, estado_uso: ['usando', 'revisado_no_usado', 'no_revisado'][i % 3], cita_textual_o_parafraseo: 'parafraseo', pagina: null, cita_en_texto: '', contexto: '' }))
const posiciones = Object.fromEntries(fuentes.map(f => [f.id, { x: rnd(-4000, 4000), y: rnd(-3000, 3000) }]))
const img = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><rect width="40" height="30" fill="#8aa"/><circle cx="20" cy="15" r="8" fill="#fff"/></svg>').toString('base64')
const notas = Array.from({ length: N_N }, (_, i) => ({ id: `nota_${i}`, titulo: i % 4 ? '' : `Ficha ${i}`, texto: `Idea número ${i}: texto de una nota del tablero con algo de contenido para medir el render.`, estilo: ['adhesiva', 'rayada', 'tarjeta'][i % 3], letra: ['sans', 'serif', 'mono', 'mano'][i % 4], color: 'amarillo', creado: '2026-09-20T00:00:00Z', x: rnd(-4500, 4500), y: rnd(-3500, 3500) }))
const listas = Array.from({ length: N_L }, (_, i) => ({ id: `lista_${i}`, titulo: `Pendientes ${i}`, items: [{ t: 'Leer paper', hecho: true }, { t: 'Resumir', hecho: false }, { t: 'Citar', hecho: false }], creado: '2026-09-20T00:00:00Z', x: rnd(-4500, 4500), y: rnd(-3500, 3500) }))
const fotos = Array.from({ length: N_FOTO }, (_, i) => ({ id: `foto_${i}`, titulo: `Foto ${i}`, texto: 'Descripción', anotacion: i % 2 ? '¿revisar?' : '', imagen: img, proporcion: 4 / 3, trazos: [], x: rnd(-4500, 4500), y: rnd(-3500, 3500) }))
const ids = [...fuentes.map(f => f.id), ...notas.map(n => n.id), ...listas.map(l => l.id), ...fotos.map(f => f.id)]
const conexiones = Array.from({ length: N_C }, (_, i) => ({ id: `con_${i}`, desde: ids[rnd(0, ids.length - 1)], hasta: ids[rnd(0, ids.length - 1)], etiqueta: i % 5 ? '' : 'relación' }))
const proyecto = { id: 'proyecto_001', tipo: 'tesis', titulo: 'Proyecto de prueba de rendimiento', area: '', objetivo_general: 'Objetivo', objetivos_especificos: ['OE uno', 'OE dos'], indicadores: [], canvas: { modo: 'libre', corcho: true, posiciones, notas, listas, audios: [], fotos, conexiones, objetivos: {} } }

const b = await navegador()
const pg = await b.newPage()
pg.on('pageerror', e => console.log('PAGEERROR', e.message))
await pg.goto(URL_APP + '', { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 1200))
await pg.evaluate(d => new Promise((res, rej) => {
  const r = indexedDB.open('canvas-de-citas')
  r.onsuccess = () => {
    const tx = r.result.transaction(['proyectos', 'fuentes', 'citas'], 'readwrite')
    for (const [c, items] of Object.entries(d)) { const st = tx.objectStore(c); st.clear(); for (const x of items) st.put(x) }
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  }
}), { proyectos: [proyecto], fuentes, citas })
const t0 = Date.now()
await pg.goto(URL_APP + '#/p/proyecto_001'); await pg.reload({ waitUntil: 'networkidle0' })
await pg.waitForSelector('g.tarjeta'); const carga = Date.now() - t0
await new Promise(r => setTimeout(r, 1000))
await pg.click('button[aria-label="Encuadrar todo"]'); await new Promise(r => setTimeout(r, 600))
const nodos = await pg.evaluate(() => document.querySelectorAll('svg *').length)

// Duración de cuadros mientras se generan eventos (un evento de rueda por cuadro).
async function medir(tipo) {
  return pg.evaluate(async tipo => {
    const el = document.querySelector('.lienzo')
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const tiempos = []
    let prev = performance.now()
    for (let i = 0; i < 90; i++) {
      await new Promise(res => requestAnimationFrame(res))
      const now = performance.now(); tiempos.push(now - prev); prev = now
      const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy }
      const destino = el.querySelector('svg') || el
      if (tipo === 'pan') destino.dispatchEvent(new WheelEvent('wheel', { ...opts, deltaX: 14, deltaY: 9 }))
      else destino.dispatchEvent(new WheelEvent('wheel', { ...opts, deltaY: i % 30 < 15 ? -6 : 6, ctrlKey: true }))
    }
    tiempos.shift()
    tiempos.sort((a, b) => a - b)
    const prom = tiempos.reduce((s, t) => s + t, 0) / tiempos.length
    return { prom: +prom.toFixed(1), p95: +tiempos[Math.floor(tiempos.length * 0.95)].toFixed(1), fps: Math.round(1000 / prom) }
  }, tipo)
}

async function arrastre() {
  await pg.click("button[aria-label=\"Encuadrar todo\"]"); await new Promise(r => setTimeout(r, 600))
  const t = await pg.$('g.tarjeta.notas'); const bx = await t.boundingBox()
  const x0 = bx.x + bx.width / 2, y0 = bx.y + bx.height / 2
  await pg.mouse.move(x0, y0); await pg.mouse.down()
  const tiempos = []
  for (let i = 1; i <= 60; i++) {
    const s = performance.now()
    await pg.mouse.move(x0 + i * 4, y0 + i * 2)
    await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
    tiempos.push(performance.now() - s)
  }
  await pg.mouse.up()
  tiempos.sort((a, b) => a - b)
  const prom = tiempos.reduce((s, t) => s + t, 0) / tiempos.length
  return { prom: +prom.toFixed(1), p95: +tiempos[Math.floor(tiempos.length * 0.95)].toFixed(1) }
}


await pg.evaluate(() => { window.__loaf = []; new PerformanceObserver(l => window.__loaf.push(...l.getEntries().map(e => ({ d: e.duration, js: e.scripts.reduce((s, x) => s + x.duration, 0), estilo: e.duration - (e.styleAndLayoutStart - e.startTime), render: e.startTime + e.duration - e.renderStart })))).observe({ type: "long-animation-frame", buffered: false }) })
const resumen = async n => { const r = await pg.evaluate(() => { const l = window.__loaf; window.__loaf = []; const s = k => Math.round(l.reduce((a, e) => a + e[k], 0) / (l.length || 1)); return { cuadros_largos: l.length, dur: s("d"), js: s("js"), estilo_layout_pintado: s("estilo") } }); console.log(n, JSON.stringify(r)) }
const arrastrarEn = clics => pg.evaluate(async clics => {
  document.querySelector("button[aria-label=\"Encuadrar todo\"]").click()
  await new Promise(r => setTimeout(r, 700))
  for (let i = 0; i < clics; i++) { document.querySelector("button[aria-label=\"Acercar\"]").click(); await new Promise(r => setTimeout(r, 80)) }
  await new Promise(r => setTimeout(r, 700))
  const g = document.querySelector("g.tarjeta.notas"), r = g.getBoundingClientRect()
  const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2
  g.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, clientX: x0, clientY: y0, button: 0 }))
  const t = []; let prev = performance.now(), js = 0
  for (let i = 1; i <= 90; i++) {
    await new Promise(res => requestAnimationFrame(res))
    const now = performance.now(); t.push(now - prev); prev = now
    const a = performance.now()
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: x0 + i * 3, clientY: y0 + i * 2 }))
    js += performance.now() - a
  }
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, clientX: x0 + 270, clientY: y0 + 180 }))
  const lf = window.__loaf.splice(0)
  window.__resumenLoaf = { largos: lf.length, dur: Math.round(lf.reduce((s, e) => s + e.d, 0) / (lf.length || 1)), js: Math.round(lf.reduce((s, e) => s + e.js, 0) / (lf.length || 1)), render: Math.round(lf.reduce((s, e) => s + e.render, 0) / (lf.length || 1)) }
  t.shift(); t.sort((a, b) => a - b)
  return { zoom: document.querySelector(".porc").textContent, fps: Math.round(1000 / (t.reduce((s, x) => s + x, 0) / t.length)), p95: +t[Math.floor(t.length * .95)].toFixed(1) }
}, clics)
if (process.env.CAPTURA) {
  await pg.click("button[aria-label=\"Encuadrar todo\"]"); await new Promise(r => setTimeout(r, 600))
  for (let i = 0; i < 10; i++) { await pg.click("button[aria-label=\"Acercar\"]"); await new Promise(r => setTimeout(r, 80)) }
  await new Promise(r => setTimeout(r, 900))
  await pg.screenshot({ path: process.env.CAPTURA + "/corcho-cerca.png" })
  for (let i = 0; i < 4; i++) { await pg.click("button[aria-label=\"Alejar\"]"); await new Promise(r => setTimeout(r, 80)) }
  await new Promise(r => setTimeout(r, 900))
  await pg.screenshot({ path: process.env.CAPTURA + "/corcho-medio.png" })
  { await b.close(); cerrarServidor(); process.exit(0) }
}
if (process.env.PERFIL) {
  const cdp = await pg.createCDPSession(); await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start")
  await arrastrarEn(0)
  const { profile } = await cdp.send("Profiler.stop")
  const self = new Map(), total = profile.samples.length, porId = new Map(profile.nodes.map(n => [n.id, n]))
  const cuenta = new Map(); for (const id of profile.samples) cuenta.set(id, (cuenta.get(id) || 0) + 1)
  for (const [id, c] of cuenta) { const n = porId.get(id), f = n.callFrame, k = (f.functionName || "(anónima)") + " " + (f.url.split("/").pop() || "") + ":" + f.lineNumber; self.set(k, (self.get(k) || 0) + c) }
  console.log("PERFIL (tiempo propio):"); for (const [k, c] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log("  " + (100 * c / total).toFixed(1) + "%  " + k)
  { await b.close(); cerrarServidor(); process.exit(0) }
}
for (const c of [0, 9, 9]) { await pg.evaluate(() => (window.__loaf = [])); console.log("arrastre en página", JSON.stringify(await arrastrarEn(c)), JSON.stringify(await pg.evaluate(() => window.__resumenLoaf))) }
const pan = await medir("pan"); await resumen("pan")
const zoom = await medir("zoom"); await resumen("zoom")
const drag = await arrastre(); await resumen("arrastre")
await pg.click("button[aria-label=\"Encuadrar todo\"]"); await new Promise(r => setTimeout(r, 600))
for (const clics of [3, 3, 3]) {
  for (let i = 0; i < clics; i++) { await pg.click("button[aria-label=\"Acercar\"]"); await new Promise(r => setTimeout(r, 100)) }
  await new Promise(r => setTimeout(r, 700))
  const pct = await pg.$eval(".porc", e => e.textContent)
  const p = await medir("pan"), z = await medir("zoom")
  await resumen("   " + pct)
  if (process.env.PODAR && pct !== "20%") {
    const q = await pg.evaluate(() => { let n = 0; const v = document.querySelector(".lienzo").getBoundingClientRect(); for (const g of document.querySelectorAll("g.tarjeta, g.nodo")) { const r = g.getBoundingClientRect(); if (r.right < v.left - 200 || r.left > v.right + 200 || r.bottom < v.top - 200 || r.top > v.bottom + 200) { g.remove(); n++ } } return n })
    await new Promise(r => setTimeout(r, 500))
    const z2 = await medir("zoom"); console.log("   sin", q, "fuera de vista → zoom", z2.fps, "fps")
  }
  console.log("nivel", pct, JSON.stringify({ pan: p.fps + " fps", zoom: z.fps + " fps", zoom_p95: z.p95 }))
}
console.log(JSON.stringify({ etiqueta, carga_ms: carga, nodos_svg: nodos, pan, zoom, arrastre_ms_por_paso: drag }))
if (capturas) { await pg.click('button[aria-label="Encuadrar todo"]'); await new Promise(r => setTimeout(r, 800)); await pg.screenshot({ path: `${capturas}/rend-${etiqueta}.png` }) }
await b.close()
cerrarServidor()
