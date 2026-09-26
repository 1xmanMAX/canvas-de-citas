// Pruebas de navegador de punta a punta (Chrome headless contra la app compilada).
// Uso: npm run build && npm run test:e2e        · Solo algunas: npm run test:e2e -- visor pdf
// Capturas en tests/e2e/capturas/. Chrome: se busca solo; si no, define CHROME_PATH.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { APP, FIXTURES, SALIDA, URL_APP, servidor, navegador, pagina, esperar, clicTexto, conEjemplo, lienzoGuardado, adjuntar, suite } from './comun.mjs'

const PDF = path.join(FIXTURES, 'paper.pdf'), HTML = path.join(FIXTURES, 'paper.html'), IMG = path.join(APP, 'public', 'icon-512.png')
if (!fs.existsSync(PDF)) spawnSync(process.execPath, [path.join(FIXTURES, 'crear.mjs')], { stdio: 'inherit' })
fs.mkdirSync(SALIDA, { recursive: true })

const filtro = process.argv.slice(2)
const SUITES = {
  // Gestos del lienzo en PC: rueda del mouse = zoom; botón central = mover.
  async gestos(b) {
    const s = suite('Gestos del lienzo'), pg = await pagina(b)
    await conEjemplo(pg)
    await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(900)
    const zoom = () => pg.$eval('.zoom .porc', e => parseInt(e.textContent))
    const capa = () => pg.$eval('.capa', e => e.style.transform)
    const rueda = (opc) => pg.$eval('.lienzo', (el, o) => el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaMode: 0, ...o })), opc)
    await s.paso('rueda del mouse (muescas de 120) acerca hacia el cursor', async () => {
      const k0 = await zoom()
      const r = await (await pg.$('.lienzo')).boundingBox()
      for (let i = 0; i < 3; i++) { await rueda({ deltaY: -100, wheelDeltaY: 120, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }); await esperar(30) }
      await esperar(300)
      const k1 = await zoom()
      if (!(k1 > k0)) throw new Error(`no acercó (${k0}% → ${k1}%)`)
    })
    await s.paso('deslizar con el trackpad desplaza sin hacer zoom', async () => {
      await esperar(500)
      const k0 = await zoom(), t0 = await capa()
      for (let i = 0; i < 6; i++) { await rueda({ deltaX: 3.5, deltaY: 7.25 }); await esperar(20) }
      await esperar(500)
      if (await zoom() !== k0) throw new Error('hizo zoom')
      if (await capa() === t0) throw new Error('no desplazó')
    })
    await s.paso('botón central sobre una fuente mueve el lienzo sin mover la fuente', async () => {
      await pg.click('.zoom .porc'); await esperar(400)
      const nodo = await pg.$('g.nodo')
      const antes = await nodo.evaluate(g => g.getAttribute('transform'))
      const t0 = await capa()
      const r = await nodo.boundingBox()
      await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
      await pg.mouse.down({ button: 'middle' })
      await pg.mouse.move(r.x + r.width / 2 + 120, r.y + r.height / 2 + 60, { steps: 6 })
      await pg.mouse.up({ button: 'middle' })
      await esperar(400)
      if (await nodo.evaluate(g => g.getAttribute('transform')) !== antes) throw new Error('movió la fuente')
      if (await capa() === t0) throw new Error('no movió el lienzo')
      if (await pg.$('dialog[open]')) throw new Error('abrió la fuente')
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.close()
    return s
  },
  // Tarjetas del lienzo: notas, listas, voz, fotos, conexiones, corcho, búsqueda, sub-lienzo.
  async lienzo(b) {
    const s = suite('Lienzo y tarjetas'), pg = await pagina(b)
    await conEjemplo(pg)
    await s.paso('pellizco con un dedo sobre una fuente: hace zoom y no la mueve ni la abre', async () => {
      const cdp = await pg.createCDPSession()
      const nodo = await pg.$('g.nodo')
      const antes = await nodo.evaluate(g => g.getAttribute('transform'))
      const r = await nodo.boundingBox()
      const zoom = () => pg.$eval('.zoom .porc', b => parseInt(b.textContent))
      const k0 = await zoom()
      const a = { x: r.x + r.width / 2, y: r.y + r.height / 2 }, b = { x: a.x + 60, y: a.y + 40 }
      const toque = (type, puntos) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: puntos.map((p, i) => ({ x: p.x, y: p.y, id: i })) })
      await toque('touchStart', [a]); await esperar(30)
      await toque('touchStart', [a, b]); await esperar(30)
      for (let i = 1; i <= 8; i++) { await toque('touchMove', [{ x: a.x - 10 * i, y: a.y - 6 * i }, { x: b.x + 10 * i, y: b.y + 6 * i }]); await esperar(20) }
      await toque('touchEnd', []); await esperar(400)
      const k1 = await zoom()
      if (!(k1 > k0 * 1.3)) throw new Error(`no hizo zoom (${k0}% → ${k1}%)`)
      if (await nodo.evaluate(g => g.getAttribute('transform')) !== antes) throw new Error('movió la fuente')
      if (await pg.$('dialog[open]')) throw new Error('abrió la fuente')
      await cdp.detach()
      await pg.click('.zoom .porc'); await esperar(400) // vuelve a encuadrar para los pasos siguientes
    })
    await s.paso('nota manuscrita en ficha rayada', async () => {
      await pg.click('button[aria-label="Añadir nota"]')
      await pg.type('dialog[open] input[placeholder^="Extended"]', 'Extended Mind, p. 114')
      await pg.type('dialog[open] textarea', 'Pensamos con las cosas, no solo sobre ellas.')
      await clicTexto(pg, 'Ficha rayada'); await clicTexto(pg, 'Manuscrita'); await clicTexto(pg, 'Guardar')
    })
    await s.paso('lista de tareas y marcar una en el lienzo', async () => {
      await pg.click('button[aria-label="Añadir lista de tareas"]')
      await pg.type('dialog[open] input[placeholder^="Pendientes"]', 'Pendientes')
      for (const t of ['Uno', 'Dos']) { await pg.type('dialog[open] input[placeholder^="Nueva tarea"]', t); await pg.keyboard.press('Enter') }
      await clicTexto(pg, 'Guardar'); await esperar(300)
      await (await pg.$('g.casilla')).click()
      if (await pg.$eval('g.casilla', g => g.getAttribute('aria-checked')) !== 'true') throw new Error('no se marcó')
    })
    await s.paso('nota de voz (micrófono simulado)', async () => {
      await pg.click('button[aria-label="Grabar nota de voz"]')
      await pg.click('dialog[open] button[aria-label="Empezar a grabar"]')
      await pg.waitForSelector('dialog[open] button[aria-label="Detener grabación"]', { timeout: 10000 }); await esperar(1500)
      await pg.click('dialog[open] button[aria-label="Detener grabación"]')
      await pg.waitForSelector('dialog[open] audio', { timeout: 10000 })
      await clicTexto(pg, 'Guardar')
    })
    await s.paso('foto con anotación y dibujo', async () => {
      await (await pg.$('input[type=file][accept="image/*"]')).uploadFile(IMG)
      await pg.waitForSelector('dialog[open] .foto-grande', { timeout: 8000 })
      await pg.type('dialog[open] input.mano', 'revisar')
      await clicTexto(pg, 'Anotar sobre la foto')
      const r = await (await pg.waitForSelector('dialog[open] .hoja svg', { visible: true })).boundingBox()
      await pg.mouse.move(r.x + r.width * .2, r.y + r.height * .3); await pg.mouse.down()
      await pg.mouse.move(r.x + r.width * .7, r.y + r.height * .4, { steps: 8 }); await pg.mouse.up()
      await clicTexto(pg, 'Guardar')
    })
    await pg.click('button[aria-label="Encuadrar todo"]'); await esperar(400)
    await s.paso('conectar nota con lista y tablero de corcho', async () => {
      await pg.click('button[aria-label="Conectar elementos"]')
      const a = await (await pg.$('g.tarjeta.notas')).boundingBox(), c = await (await pg.$('g.tarjeta.listas')).boundingBox()
      await pg.mouse.click(a.x + a.width / 2, a.y + 12); await esperar(150)
      await pg.mouse.click(c.x + c.width / 2, c.y + 14); await esperar(300)
      await pg.type('dialog[open] input', 'misma idea'); await clicTexto(pg, 'Guardar')
      await pg.click('button[aria-label="Tablero de corcho"]'); await esperar(300)
      if (!(await pg.$('.lienzo.corcho path.hilo'))) throw new Error('sin hilo rojo')
      await pg.screenshot({ path: path.join(SALIDA, 'lienzo.png') })
    })
    await s.paso('sub-lienzo del objetivo', async () => {
      await clicTexto(pg, 'OE1', '', 'span')
      await pg.waitForSelector('.obj-panel', { timeout: 5000 })
      await pg.click('.obj-panel button[aria-label="Añadir lista de tareas"]')
      await pg.type('dialog[open] input[placeholder^="Nueva tarea"]', 'Tarea del OE1'); await pg.keyboard.press('Enter')
      await clicTexto(pg, 'Guardar'); await esperar(400)
      if (((await lienzoGuardado(pg)).objetivos.oe1?.listas || []).length !== 1) throw new Error('no se guardó en oe1')
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    return s
  },

  // Visor: PDF propio (PDFium), búsqueda, recorte, vínculos, HTML y Markdown.
  async pdf(b) {
    const s = suite('Visor de PDF, recortes y vínculos'), pg = await pagina(b)
    await conEjemplo(pg)
    await adjuntar(pg, 'fuente_003', PDF)
    await clicTexto(pg, 'Abrir')
    await s.paso('abre el PDF y dibuja páginas nítidas', async () => {
      await pg.waitForFunction(() => [...document.querySelectorAll('.pag-pdf canvas')].some(c => c.width > 0 && c.width >= c.getBoundingClientRect().width * .95), { timeout: 30000 })
    })
    await s.paso('búsqueda con resaltado', async () => {
      await pg.type('#pdf-buscar', 'rework'); await pg.keyboard.press('Enter')
      await pg.waitForFunction(() => /\d+\/\d+/.test(document.querySelector('.cuenta')?.textContent || ''), { timeout: 15000 })
      await pg.click('#pdf-buscar', { clickCount: 3 }); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Enter')
    })
    await s.paso('nota desde selección guarda página y ubicación', async () => {
      await pg.waitForFunction(() => document.querySelectorAll('.pag-pdf[data-n="0"] .capa-texto text').length > 5, { timeout: 15000 })
      await pg.evaluate(() => { const t = [...document.querySelectorAll('.pag-pdf[data-n="0"] .capa-texto text')].find(x => x.textContent.length > 40); const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r) })
      await esperar(300); await clicTexto(pg, 'Nota con la cita'); await esperar(500)
      const n = (await lienzoGuardado(pg)).notas.at(-1)
      if (!/pág\. 1$/.test(n.titulo) || !n.origen?.rects?.length) throw new Error(JSON.stringify(n.origen))
    })
    await s.paso('recortar un área → tarjeta de imagen con texto', async () => {
      await clicTexto(pg, 'Recortar')
      const c = await (await pg.$('.pag-pdf[data-n="0"]')).boundingBox()
      await pg.mouse.move(c.x + c.width * .08, c.y + c.height * .05); await pg.mouse.down()
      await pg.mouse.move(c.x + c.width * .9, c.y + c.height * .3, { steps: 6 }); await pg.mouse.up(); await esperar(1500)
      const f = (await lienzoGuardado(pg)).fotos.at(-1)
      if (!f?.origen?.area || !/rework/i.test(f.texto)) throw new Error('recorte incompleto')
    })
    await s.paso('Esc cancela el recorte sin cerrar el visor', async () => {
      await clicTexto(pg, 'Recortar'); await pg.keyboard.press('Escape'); await esperar(300)
      if (!(await pg.$('.visor')) || await pg.$('.pdf.recortando')) throw new Error('estado incorrecto')
    })
    await pg.keyboard.press('Escape'); await esperar(400)
    await s.paso('Vínculo en la tarjeta vuelve a la cita y la marca', async () => {
      await pg.click('button[aria-label="Encuadrar todo"]'); await esperar(500)
      await (await pg.$('g.tarjeta.notas g.vinculo')).click()
      await pg.waitForSelector('.capa-marcas .destello', { timeout: 20000 })
      if (!(await pg.$('.capa-marcas .area'))) throw new Error('sin cuadro punteado del recorte')
      await esperar(1200); await pg.screenshot({ path: path.join(SALIDA, 'vinculo-pdf.png') })
    })
    await pg.keyboard.press('Escape'); await esperar(400)
    await s.paso('HTML: nota con la cita y vínculo con resaltado', async () => {
      await adjuntar(pg, 'fuente_005', HTML)
      await clicTexto(pg, 'Abrir')
      const fr = await (await pg.waitForSelector('.visor iframe')).contentFrame()
      await fr.waitForSelector('p')
      await fr.evaluate(() => { const p = [...document.querySelectorAll('p')].filter(x => x.textContent.length > 150)[1]; const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r) })
      await esperar(300); await clicTexto(pg, 'Nota con la cita'); await esperar(400)
      await pg.keyboard.press('Escape'); await esperar(400)
      const v = await pg.$$('g.tarjeta.notas g.vinculo'); await v.at(-1).click(); await esperar(2000)
      const h = await pg.evaluate(() => { const w = document.querySelector('.visor iframe')?.contentWindow; return { cita: w?.CSS.highlights.has('cita'), activa: w?.CSS.highlights.has('cita-activa') } })
      if (!h.cita || !h.activa) throw new Error(JSON.stringify(h))
    })
    await pg.keyboard.press('Escape'); await esperar(300)
    await s.paso('Markdown con Ctrl+O', async () => {
      const md = path.join(SALIDA, 'prueba.md')
      fs.writeFileSync(md, '# Resumen\n\nTexto con **negrita**.\n\n- punto uno\n')
      const [ch] = await Promise.all([pg.waitForFileChooser(), pg.keyboard.down('Control').then(() => pg.keyboard.press('o')).then(() => pg.keyboard.up('Control'))])
      await ch.accept([md]); await esperar(700)
      if (!/<h1>Resumen<\/h1>/.test(await pg.$eval('.lectura', e => e.innerHTML))) throw new Error('markdown')
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    return s
  },

  // Biblioteca: panel de detalle con documento, referencias del paper y agregar/conectar.
  async biblioteca(b) {
    const s = suite('Biblioteca'), pg = await pagina(b)
    await conEjemplo(pg)
    await adjuntar(pg, 'fuente_003', PDF)
    await pg.keyboard.press('Escape'); await esperar(300)
    await pg.evaluate(() => (location.hash = '#/citas')); await esperar(1200)
    await s.paso('detalle: documento + referencias del paper', async () => {
      for (const n of await pg.$$('g.nodo')) if (/^Priestley et al/.test(await n.evaluate(e => e.getAttribute('aria-label')))) { await n.click(); break }
      await pg.waitForFunction(() => document.querySelectorAll('.refs li').length >= 5, { timeout: 30000 })
      await clicTexto(pg, 'Lista amplia'); await esperar(300)
      await pg.screenshot({ path: path.join(SALIDA, 'biblioteca.png') })
    })
    await s.paso('agregar una referencia la conecta al paper', async () => {
      await clicTexto(pg, '+ Agregar', '//ol[contains(@class,"refs")]/li[2]')
      await pg.waitForSelector('dialog[open] input', { timeout: 15000 })
      await clicTexto(pg, 'Guardar y conectar'); await esperar(700)
      const ok = await pg.evaluate(() => [...document.querySelectorAll('.detalle .rotulo')].some(r => r.textContent.startsWith('Cita a')))
      if (!ok) throw new Error('no aparece "Cita a"')
    })
    await s.paso('abrir el documento en el visor desde el panel', async () => {
      await pg.click('.detalle .doc')
      await pg.waitForFunction(() => [...document.querySelectorAll('.pag-pdf canvas')].some(c => c.width > 0), { timeout: 20000 })
    })
    if (pg.errores.length) s.fallas.push(...pg.errores.filter(e => !/crossref/i.test(e)))
    return s
  },

  // Agrupadores: recuadro punteado con nombre que se ajusta a su contenido y lo lleva consigo.
  async agrupador(b) {
    const s = suite('Agrupadores del lienzo'), pg = await pagina(b)
    await conEjemplo(pg)
    const dentro = (g, c) => { const x = c.x + c.w / 2, y = c.y + c.h / 2; return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h }
    const datos = async () => {
      const cv = await lienzoGuardado(pg), g = cv.agrupadores[0]
      const pos = { ...Object.fromEntries(cv.notas.map(n => [n.id, { x: n.x, y: n.y }])), ...cv.posiciones }
      return { cv, g, pos }
    }
    /** Arrastra con el ratón desde el centro de `el` (ElementHandle) dx, dy píxeles. */
    const arrastrar = async (el, dx, dy) => {
      const r = await el.boundingBox(), x = r.x + Math.min(r.width / 2, 30), y = r.y + Math.min(r.height / 2, 14)
      await pg.mouse.move(x, y); await pg.mouse.down()
      for (let i = 1; i <= 10; i++) await pg.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10)
      await pg.mouse.up(); await esperar(400)
    }
    const nota = texto => pg.evaluateHandle(t => [...document.querySelectorAll('g[aria-label="Nota"]')].find(g => g.textContent.includes(t)), texto)
    const zoom = async () => (await pg.$eval('.zoom .porc', b => parseInt(b.textContent))) / 100
    let ids = []
    await s.paso('crear un agrupador con dos fuentes y una nota: quedan dentro', async () => {
      await pg.click('button[aria-label="Añadir nota"]')
      await pg.type('dialog[open] textarea', 'Idea para el marco'); await clicTexto(pg, 'Guardar'); await esperar(300)
      await pg.click('button[aria-label="Agrupar elementos"]')
      await pg.type('dialog[open] input[placeholder^="Marco"]', 'Marco teórico')
      const casillas = await pg.$$('dialog[open] .lista input[type=checkbox]')
      if (casillas.length < 3) throw new Error('faltan elementos en la lista')
      await casillas[0].click(); await casillas[1].click(); await casillas.at(-1).click()
      await clicTexto(pg, 'Crear agrupador'); await esperar(500)
      const { cv, g, pos } = await datos()
      if (g?.titulo !== 'Marco teórico' || cv.modo !== 'libre') throw new Error('datos: ' + JSON.stringify(g))
      if (g.miembros?.length !== 3) throw new Error('miembros: ' + JSON.stringify(g.miembros))
      for (const id of g.miembros) if (!dentro(g, { ...pos[id], w: 150, h: 50 })) throw new Error(`${id} quedó fuera del recuadro`)
      ids = [...g.miembros].sort()
      const t = await pg.$eval('g.agrupador.frente .titulo text', e => e.textContent)
      if (!t.includes('Marco teórico') || !t.includes('3')) throw new Error('título: ' + t)
      await pg.screenshot({ path: path.join(SALIDA, 'agrupador-nuevo.png') })
    })
    await s.paso('arrastrar el nombre mueve el recuadro con todo su contenido', async () => {
      const a = await datos()
      await arrastrar(await pg.$('g.agrupador.frente .titulo'), 150, 80)
      const d = await datos(), dx = d.g.x - a.g.x, dy = d.g.y - a.g.y
      if (!dx || !dy) throw new Error('no se movió')
      for (const id of ids) if (d.pos[id].x - a.pos[id].x !== dx || d.pos[id].y - a.pos[id].y !== dy) throw new Error(`${id} no se movió con el recuadro`)
      for (const id of Object.keys(a.pos).filter(id => !ids.includes(id))) if (d.pos[id].x !== a.pos[id].x) throw new Error(`${id} se movió sin estar dentro`)
      if ([...d.g.miembros].sort().join() !== ids.join()) throw new Error('cambió quién está dentro')
    })
    await s.paso('mover algo de dentro reajusta el recuadro', async () => {
      const a = await datos()
      await arrastrar(await nota('Idea para el marco'), 90, 70)
      const d = await datos()
      if (!d.g.miembros.some(id => id.startsWith('nota'))) throw new Error('la nota salió del grupo')
      if (!(d.g.w > a.g.w || d.g.h > a.g.h)) throw new Error(`el recuadro no creció: ${a.g.w}×${a.g.h} → ${d.g.w}×${d.g.h}`)
      const vis = await pg.$eval('g.agrupador.fondo .marco', r => ({ w: +r.getAttribute('width'), h: +r.getAttribute('height') }))
      if (vis.w !== d.g.w || vis.h !== d.g.h) throw new Error('lo dibujado no coincide con lo guardado')
    })
    await s.paso('arrastrarlo lejos lo saca y soltarlo encima lo vuelve a meter', async () => {
      const a = await datos(), k = await zoom()
      await arrastrar(await nota('Idea para el marco'), -(a.g.w + 250) * k, 0)
      let d = await datos()
      if (d.g.miembros.some(id => id.startsWith('nota'))) throw new Error('no salió del grupo')
      if (d.g.miembros.length !== 2) throw new Error('miembros: ' + d.g.miembros)
      const titulo = await (await pg.$('g.agrupador.frente .titulo')).boundingBox()
      const n = await (await nota('Idea para el marco')).boundingBox()
      await arrastrar(await nota('Idea para el marco'), titulo.x + 40 - n.x, titulo.y + 60 - n.y)
      d = await datos()
      if (d.g.miembros.length !== 3) throw new Error('no volvió a entrar: ' + d.g.miembros)
    })
    await s.paso('quitar un elemento desde el editor lo saca del recuadro', async () => {
      await pg.click('g.agrupador.frente .titulo'); await pg.waitForSelector('dialog[open] .lista', { timeout: 5000 })
      await (await pg.$('dialog[open] .lista input[type=checkbox]:checked')).click()
      await clicTexto(pg, 'Guardar'); await esperar(400)
      const { g, pos } = await datos()
      if (g.miembros.length !== 2) throw new Error('miembros: ' + g.miembros)
      const fuera = ids.find(id => !g.miembros.includes(id) && pos[id])
      if (fuera && dentro(g, { ...pos[fuera], w: 150, h: 50 })) throw new Error('quedó dibujado dentro')
      await pg.screenshot({ path: path.join(SALIDA, 'agrupador.png') })
    })
    await s.paso('también en el lienzo de un objetivo', async () => {
      await clicTexto(pg, 'OE1', '', 'span')
      await pg.waitForSelector('.obj-panel', { timeout: 5000 })
      for (const t of ['Primera del OE1', 'Segunda del OE1']) {
        await pg.click('.obj-panel button[aria-label="Añadir nota"]')
        await pg.type('dialog[open] textarea', t); await clicTexto(pg, 'Guardar'); await esperar(300)
      }
      await pg.click('.obj-panel button[aria-label="Agrupar elementos"]')
      await pg.type('dialog[open] input[placeholder^="Marco"]', 'Ideas OE1')
      for (const c of await pg.$$('dialog[open] .lista input[type=checkbox]')) await c.click()
      await clicTexto(pg, 'Crear agrupador'); await esperar(500)
      const oe1 = (await lienzoGuardado(pg)).objetivos.oe1, g = oe1.agrupadores?.[0]
      if (g?.titulo !== 'Ideas OE1' || g.miembros?.length !== 2) throw new Error('no se guardó en oe1: ' + JSON.stringify(g))
      if (oe1.notas.some(n => !dentro(g, { x: n.x, y: n.y, w: 168, h: 60 }))) throw new Error('hay notas fuera del recuadro')
      if (!(await pg.$('.obj-panel g.agrupador.frente'))) throw new Error('no se dibujó')
      await pg.click('.obj-panel button[aria-label="Cerrar lienzo del objetivo"]'); await esperar(400)
    })
    if (pg.errores.length) s.fallas.push(...pg.errores.filter(e => !/crossref/i.test(e)))
    return s
  },

  // Grupo de sincronización: un "celular" (Android simulado) y una "laptop" editan a la vez y
  // todos (con la PC) terminan con la misma versión, enviando solo lo que cambió.
  async grupo(b) {
    const s = suite('Grupo de sincronización')
    const crate = path.resolve(APP, '../receptor/sincro')
    if (spawnSync('cargo', ['build', '--release', '--quiet'], { cwd: crate, stdio: 'inherit' }).status !== 0) { s.fallas.push('cargo build'); return s }
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-grupo-'))
    fs.writeFileSync(path.join(carpeta, 'proyectos.json'), JSON.stringify({ proyectos: [{ id: 'proyecto_001', tipo: 'tesis', titulo: 'Tesis común', objetivos_especificos: [], indicadores: [], canvas: { modo: 'radial', posiciones: {}, notas: [], fotos: [], listas: [], audios: [], conexiones: [], objetivos: {} } }] }, null, 2) + '\n')
    const bin = path.join(crate, 'target', 'release', process.platform === 'win32' ? 'canvas-sincro.exe' : 'canvas-sincro')
    const srv = spawn(bin, ['--carpeta', carpeta, '--puerto', '0'])
    const info = JSON.parse(await new Promise(res => srv.stdout.once('data', d => res(String(d).split('\n')[0]))))
    const codigo = `canvas-sync://127.0.0.1:${info.puerto}/#${info.clave}`
    const cel = await pagina(b), lap = await pagina(b)
    await cel.evaluateOnNewDocument(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', nativePromise: async () => ({}) } })
    const enPc = () => fs.readFileSync(path.join(carpeta, 'proyectos.json'), 'utf8')
    const sincronizarEn = async pg => {
      await pg.click('button[aria-label="Sincronizar con la PC"]'); await esperar(300)
      await pg.waitForFunction(() => !document.querySelector('.sincro-btn.girando'), { timeout: 15000 }); await esperar(300)
    }
    const nota = async (pg, texto) => {
      await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(800)
      await pg.click('button[aria-label="Añadir nota"]')
      await pg.type('dialog[open] textarea', texto)
      await clicTexto(pg, 'Guardar'); await esperar(300)
    }
    try {
      await s.paso('celular y laptop se unen al grupo con el mismo código', async () => {
        for (const [pg, nombre] of [[cel, 'Celular de Max'], [lap, 'Laptop de Max']]) {
          await pg.goto(URL_APP, { waitUntil: 'networkidle0' }); await esperar(600)
          await clicTexto(pg, 'Configuración')
          await pg.type('dialog[open] input[placeholder^="canvas-sync"]', codigo)
          const campo = await pg.$('dialog[open] .sincro input[maxlength="60"]')
          await campo.click(); await campo.evaluate(i => i.select()); await pg.keyboard.type(nombre); await pg.keyboard.press('Tab')
          await clicTexto(pg, 'Sincronizar', '//dialog[@open]//div[contains(@class,"fila")]')
          await pg.waitForFunction(() => /Última:/.test(document.querySelector('.sincro .estado')?.textContent || ''), { timeout: 15000 })
          await pg.keyboard.press('Escape'); await esperar(300)
          if (!(await pg.evaluate(() => document.body.textContent.includes('Tesis común')))) throw new Error('no llegó el proyecto')
        }
      })
      await s.paso('cada uno agrega una nota sin sincronizar y todo se junta', async () => {
        await nota(cel, 'Idea desde el celular')
        await nota(lap, 'Idea desde la laptop')
        await sincronizarEn(cel); await sincronizarEn(lap); await sincronizarEn(cel)
        for (const t of ['Idea desde el celular', 'Idea desde la laptop']) if (!enPc().includes(t)) throw new Error(`falta en la PC: ${t}`)
        for (const [pg, n] of [[cel, 'celular'], [lap, 'laptop']]) {
          const textos = await pg.evaluate(() => document.body.textContent)
          if (!textos.includes('Idea desde el celular') || !textos.includes('Idea desde la laptop')) throw new Error(`al ${n} le falta una nota`)
        }
      })
      await s.paso('solo viajó lo que cambió y el grupo muestra a los dos', async () => {
        await clicTexto(cel, 'Configuración').catch(() => cel.click('button[aria-label="Configuración"]'))
        await cel.waitForSelector('dialog[open] .grupo', { timeout: 5000 })
        const txt = await cel.$eval('dialog[open] .sincro', e => e.textContent)
        if (!txt.includes('Laptop de Max') || /[a-z]Laptop de Max/.test(txt)) throw new Error('el grupo no muestra bien la laptop: ' + txt)
        if (!/↓ \d+ · ↑ \d+ cambios/.test(txt)) throw new Error('no muestra el resumen de cambios: ' + txt)
        const ultima = await cel.evaluate(() => new Promise(res => { const r = indexedDB.open('canvas-de-citas'); r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').get('sincroUltima'); q.onsuccess = () => res(q.result) } }))
        if (!(ultima?.bytes < 4000)) throw new Error(`viajaron ${ultima?.bytes} bytes (se esperaba solo lo cambiado)`)
      })
    } finally { srv.kill() }
    for (const pg of [cel, lap]) if (pg.errores.length) s.fallas.push(...pg.errores)
    return s
  },

  // App Android: Chrome con window.Capacitor simulado (como lo inyecta el WebView), contra
  // canvas-sincro real. El plugin nativo Vinculo (escáner de QR) también es simulado.
  async android(b) {
    const s = suite('App Android (simulada)')
    const crate = path.resolve(APP, '../receptor/sincro')
    if (spawnSync('cargo', ['build', '--release', '--quiet'], { cwd: crate, stdio: 'inherit' }).status !== 0) { s.fallas.push('cargo build'); return s }
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-android-'))
    const proyecto = titulo => JSON.stringify({ proyectos: [{ id: 'proyecto_001', tipo: 'tesis', titulo, objetivos_especificos: [], indicadores: [], canvas: { modo: 'radial', posiciones: {}, notas: [], fotos: [], listas: [], audios: [], conexiones: [], objetivos: {} } }] }, null, 2) + '\n'
    fs.writeFileSync(path.join(carpeta, 'proyectos.json'), proyecto('Tesis en la PC'))
    const bin = path.join(crate, 'target', 'release', process.platform === 'win32' ? 'canvas-sincro.exe' : 'canvas-sincro')
    const srv = spawn(bin, ['--carpeta', carpeta, '--puerto', '0'])
    const info = JSON.parse(await new Promise(res => srv.stdout.once('data', d => res(String(d).split('\n')[0]))))
    const codigo = `canvas-sync://127.0.0.1:${info.puerto}/#${info.clave}`
    const pg = await pagina(b)
    await pg.evaluateOnNewDocument(qr => {
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        nativePromise: async (plugin, metodo, opciones) => {
          if (plugin === 'Vinculo' && metodo === 'escanear') return { codigo: qr }
          if (plugin === 'Archivos' && metodo === 'compartir') { (window.__compartidos ||= []).push(opciones.archivos || [opciones]); return {} }
          if (plugin === 'Archivos' && metodo === 'recibidos') { const a = window.__recibir || []; window.__recibir = []; return { archivos: a } }
          if (plugin === 'Voz' && metodo === 'transcribir') {
            window.__voz = { bytes: atob(opciones.pcm).length, frecuencia: opciones.frecuencia, idioma: opciones.idioma }
            return { texto: '  hola   desde Android ', idioma: 'es-US' }
          }
          throw new Error(`plugin no simulado: ${plugin}.${metodo}`)
        }
      }
    }, codigo)
    const enPc = () => fs.readFileSync(path.join(carpeta, 'proyectos.json'), 'utf8')
    try {
      await pg.goto(URL_APP, { waitUntil: 'networkidle0' }); await esperar(600)
      await s.paso('modo Android: sin carpeta ni PixPin, con botón Sincronizar', async () => {
        if (await pg.$('button[aria-label="Celular y PixPin"]')) throw new Error('se ve el botón de PixPin')
        if (!(await pg.$('button[aria-label="Sincronizar con la PC"]'))) throw new Error('falta el botón Sincronizar')
        if (await pg.evaluate(() => navigator.serviceWorker?.getRegistrations().then(r => r.length))) throw new Error('registró el service worker')
        await pg.click('button[aria-label="Sincronizar con la PC"]') // sin código: abre Configuración
        await pg.waitForSelector('dialog[open] .sincro', { timeout: 5000 })
        if (await pg.evaluate(() => document.querySelector('dialog[open]').textContent.includes('Carpeta de almacenamiento'))) throw new Error('se ve la carpeta de almacenamiento')
      })
      await s.paso('nada queda bajo la barra de estado ni la de gestos', async () => {
        // Como hace Capacitor en Android 15+ (la app ocupa toda la pantalla).
        await pg.keyboard.press('Escape'); await esperar(300)
        await pg.evaluate(() => { const r = document.documentElement.style; r.setProperty('--safe-area-inset-top', '32px'); r.setProperty('--safe-area-inset-bottom', '24px') })
        await esperar(200)
        const cab = await pg.$eval('header', h => h.getBoundingClientRect().top)
        if (cab < 32) throw new Error(`la cabecera empieza en ${cab}px, bajo la barra de estado`)
        const fondo = await pg.evaluate(() => innerHeight - document.getElementById('app').lastElementChild.getBoundingClientRect().bottom)
        if (fondo < 24) throw new Error(`el contenido llega a ${fondo}px del borde inferior`)
        await pg.click('button[aria-label="Sincronizar con la PC"]')
        await pg.waitForSelector('dialog[open] .sincro', { timeout: 5000 })
        const cerrar = await pg.$eval('dialog[open] button[aria-label="Cerrar"]', b => b.getBoundingClientRect().top)
        if (cerrar < 32) throw new Error(`el botón Cerrar queda bajo la barra (${cerrar}px)`)
      })
      await s.paso('escanear el QR vincula y trae el proyecto de la PC', async () => {
        await clicTexto(pg, 'Escanear QR')
        await pg.waitForFunction(() => /Última:/.test(document.querySelector('.sincro .estado')?.textContent || ''), { timeout: 15000 })
        await pg.keyboard.press('Escape'); await esperar(400)
        if (!(await pg.evaluate(() => document.body.textContent.includes('Tesis en la PC')))) throw new Error('no llegó el proyecto')
      })
      await s.paso('una nota del celular llega a la PC con el botón de la cabecera', async () => {
        await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(800)
        await pg.click('button[aria-label="Añadir nota"]')
        await pg.type('dialog[open] textarea', 'Nota desde Android')
        await clicTexto(pg, 'Guardar'); await esperar(300)
        await pg.click('button[aria-label="Sincronizar con la PC"]')
        await pg.waitForFunction(() => !document.querySelector('.sincro-btn.girando'), { timeout: 15000 }); await esperar(300)
        if (!enPc().includes('Nota desde Android')) throw new Error('no llegó a la PC')
      })
      await s.paso('nota de voz: se transcribe en el celular al terminar de grabar', async () => {
        await pg.click('button[aria-label="Grabar nota de voz"]')
        await pg.click('dialog[open] button[aria-label="Empezar a grabar"]')
        await pg.waitForSelector('dialog[open] button[aria-label="Detener grabación"]', { timeout: 10000 }); await esperar(1500)
        await pg.click('dialog[open] button[aria-label="Detener grabación"]')
        await pg.waitForFunction(() => document.querySelector('dialog[open] textarea')?.value === 'hola desde Android', { timeout: 10000 })
        const v = await pg.evaluate(() => window.__voz)
        // ~1,5 s de audio a 16 kHz, 16 bits: unos 48 000 bytes.
        if (v.frecuencia !== 16000 || v.bytes < 32000 || v.bytes > 128000) throw new Error('audio mal convertido: ' + JSON.stringify(v))
        await clicTexto(pg, 'Guardar'); await esperar(300)
      })
      await s.paso('exportar los JSON y el .bib abre "Compartir" (el WebView no descarga)', async () => {
        await pg.evaluate(() => (location.hash = '#/')); await esperar(500)
        await pg.click('button[aria-label="Configuración"]').catch(() => clicTexto(pg, 'Configuración'))
        await clicTexto(pg, 'Descargar los 3 JSON'); await esperar(500)
        const c = await pg.evaluate(() => window.__compartidos?.at(-1))
        if (c?.map(a => a.nombre).join() !== 'proyectos.json,fuentes.json,citas.json') throw new Error('compartió: ' + JSON.stringify(c?.map(a => a.nombre)))
        const proyectos = JSON.parse(Buffer.from(c[0].datos, 'base64').toString('utf8'))
        if (!proyectos.proyectos?.length || c[0].tipo !== 'application/json') throw new Error('contenido o tipo incorrecto')
        await pg.keyboard.press('Escape'); await esperar(300)
      })
      await s.paso('en pantalla de celular también se puede exportar el .bib', async () => {
        await pg.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true })
        await pg.evaluate(() => (location.hash = '#/citas')); await esperar(800)
        await pg.click('button.solo-movil[aria-label="Exportar .bib"]'); await esperar(400)
        const c = await pg.evaluate(() => window.__compartidos?.at(-1))
        if (c?.[0]?.nombre !== 'bibliografia.bib') throw new Error('no compartió el .bib')
        await pg.setViewport({ width: 1500, height: 950 })
      })
      await s.paso('lo compartido desde otras apps llega al lienzo (texto e imagen)', async () => {
        await pg.evaluate(() => (location.hash = '#/')); await esperar(500)
        const antes = (await lienzoGuardado(pg)).fotos.length
        await pg.evaluate(() => {
          window.__recibir = [
            { texto: 'Cita compartida desde el navegador' },
            { nombre: 'figura.png', tipo: 'image/png', datos: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }
          ]
          document.dispatchEvent(new Event('visibilitychange'))
        })
        await esperar(2500)
        const cv = await lienzoGuardado(pg)
        if (!cv.notas.some(n => n.texto === 'Cita compartida desde el navegador')) throw new Error('no llegó la nota; hash ' + (await pg.evaluate(() => location.hash)) + ' avisos ' + (await pg.evaluate(() => document.querySelector('.aviso')?.textContent)))
        if (cv.fotos.length <= antes) throw new Error('no llegó la foto')
        if (!/#\/p\//.test(await pg.evaluate(() => location.hash))) throw new Error('no abrió el lienzo del proyecto')
      })
      await s.paso('al abrir la app sincroniza sola (cambio hecho en la PC)', async () => {
        fs.writeFileSync(path.join(carpeta, 'proyectos.json'), enPc().replace('Tesis en la PC', 'Tesis renombrada en la PC'))
        await pg.reload({ waitUntil: 'networkidle0' })
        await pg.waitForFunction(() => document.body.textContent.includes('Tesis renombrada en la PC'), { timeout: 15000 })
        if (!enPc().includes('Nota desde Android')) throw new Error('se perdió la nota')
      })
    } finally { srv.kill() }
    if (pg.errores.length) s.fallas.push(...pg.errores)
    return s
  },

  // Sincronización: la app (como "celular") contra canvas-sincro sobre una carpeta temporal.
  async sincro(b) {
    const s = suite('Sincronización con la PC')
    const crate = path.resolve(APP, '../receptor/sincro')
    if (spawnSync('cargo', ['build', '--release', '--quiet'], { cwd: crate, stdio: 'inherit' }).status !== 0) { s.fallas.push('cargo build'); return s }
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-e2e-'))
    fs.writeFileSync(path.join(carpeta, 'proyectos.json'), JSON.stringify({ proyectos: [{ id: 'proyecto_001', tipo: 'tesis', titulo: 'Tesis en la PC', objetivos_especificos: [], indicadores: [], canvas: { modo: 'radial', posiciones: {}, notas: [], fotos: [], listas: [], audios: [], conexiones: [], objetivos: {} } }] }, null, 2) + '\n')
    const bin = path.join(crate, 'target', 'release', process.platform === 'win32' ? 'canvas-sincro.exe' : 'canvas-sincro')
    const srv = spawn(bin, ['--carpeta', carpeta, '--puerto', '0'])
    const info = JSON.parse(await new Promise(res => srv.stdout.once('data', d => res(String(d).split('\n')[0]))))
    const codigo = `canvas-sync://127.0.0.1:${info.puerto}/#${info.clave}`
    const pg = await pagina(b)
    try {
      await pg.goto(URL_APP, { waitUntil: 'networkidle0' }); await esperar(600)
      await s.paso('trae el proyecto de la PC', async () => {
        await clicTexto(pg, 'Configuración') // en Proyectos (escritorio) el botón lleva texto
        await pg.type('dialog[open] input[placeholder^="canvas-sync"]', codigo)
        await clicTexto(pg, 'Sincronizar')
        await pg.waitForFunction(() => /Última:/.test(document.querySelector('.sincro .estado')?.textContent || ''), { timeout: 15000 })
        await pg.keyboard.press('Escape'); await esperar(400)
        if (!(await pg.evaluate(() => document.body.textContent.includes('Tesis en la PC')))) throw new Error('no llegó el proyecto')
      })
      await s.paso('una nota creada aquí llega a la carpeta de la PC', async () => {
        await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(800)
        await pg.click('button[aria-label="Añadir nota"]')
        await pg.type('dialog[open] textarea', 'Nota desde el celular')
        await clicTexto(pg, 'Guardar'); await esperar(300)
        await pg.click('button[aria-label="Configuración"]')
        await clicTexto(pg, 'Sincronizar'); await esperar(2500)
        const disco = fs.readFileSync(path.join(carpeta, 'proyectos.json'), 'utf8')
        if (!disco.includes('Nota desde el celular')) throw new Error('no llegó a la PC')
      })
    } finally { srv.kill() }
    if (pg.errores.length) s.fallas.push(...pg.errores)
    return s
  }
}

const cerrar = await servidor()
const b = await navegador()
const resultados = []
try {
  for (const [n, f] of Object.entries(SUITES)) if (!filtro.length || filtro.includes(n)) resultados.push(await f(b))
} finally {
  await b.close()
  cerrar()
}
const fallas = resultados.flatMap(r => r.fallas.map(f => `${r.nombre}: ${f}`))
console.log(`\n${resultados.reduce((s, r) => s + r.ok, 0)} pasos correctos, ${fallas.length} fallas${fallas.length ? ':\n  ' + fallas.join('\n  ') : ''}`)
process.exit(fallas.length ? 1 : 0)
