// Pruebas de navegador de punta a punta (Chrome headless contra la app compilada).
// Uso: npm run build && npm run test:e2e        · Solo algunas: npm run test:e2e -- visor pdf
// Capturas en tests/e2e/capturas/. Chrome: se busca solo; si no, define CHROME_PATH.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { APP, FIXTURES, SALIDA, URL_APP, servidor, navegador, pagina, esperar, clicTexto, conEjemplo, lienzoGuardado, adjuntar, suite, carpetasSimuladas, escribirOpfs, leerOpfs } from './comun.mjs'

const PDF = path.join(FIXTURES, 'paper.pdf'), HTML = path.join(FIXTURES, 'paper.html'), IMG = path.join(APP, 'public', 'icon-512.png')
if (!fs.existsSync(PDF)) spawnSync(process.execPath, [path.join(FIXTURES, 'crear.mjs')], { stdio: 'inherit' })
fs.mkdirSync(SALIDA, { recursive: true })

const filtro = process.argv.slice(2)
const SUITES = {
  // Gestos en el celular (pantalla táctil simulada): lienzo, PDF y fotos.
  async celular(b) {
    const s = suite('Gestos en el celular'), pg = await pagina(b)
    await pg.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true })
    await conEjemplo(pg)
    const cdp = await pg.createCDPSession()
    const toque = (type, puntos) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: puntos.map((p, i) => ({ x: p.x, y: p.y, id: i })) })
    await s.paso('lienzo: si el primer dedo se desliza antes del pellizco, la fuente no se mueve', async () => {
      await pg.click('.zoom .porc'); await esperar(500)
      const nodo = await pg.$('g.nodo')
      const antes = await nodo.evaluate(g => g.getAttribute('transform'))
      const r = await nodo.boundingBox()
      const a = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      await toque('touchStart', [a]); await esperar(30)
      for (let i = 1; i <= 4; i++) { await toque('touchMove', [{ x: a.x + 6 * i, y: a.y + 4 * i }]); await esperar(20) } // el dedo se desliza 24 px
      const a2 = { x: a.x + 24, y: a.y + 16 }, b2 = { x: a2.x + 80, y: a2.y + 60 }
      await toque('touchStart', [a2, b2]); await esperar(30)
      for (let i = 1; i <= 6; i++) { await toque('touchMove', [{ x: a2.x - 8 * i, y: a2.y - 6 * i }, { x: b2.x + 8 * i, y: b2.y + 6 * i }]); await esperar(20) }
      await toque('touchEnd', []); await esperar(500)
      // (al empezar un arrastre el lienzo pasa a modo libre y redondea posiciones: se tolera 1 px)
      const pos = tr => (/translate\(([-\d.]+)[ ,]+([-\d.]+)/.exec(tr) || []).slice(1).map(Number)
      const [x0, y0] = pos(antes), [x1, y1] = pos(await nodo.evaluate(g => g.getAttribute('transform')))
      if (Math.abs(x1 - x0) > 1 || Math.abs(y1 - y0) > 1) throw new Error(`movió la fuente (${x0},${y0} → ${x1},${y1})`)
    })
    await s.paso('PDF: pellizcar con dos dedos acerca sin saltos de desplazamiento', async () => {
      await adjuntar(pg, 'fuente_003', PDF)
      await clicTexto(pg, 'Abrir')
      await pg.waitForFunction(() => [...document.querySelectorAll('.pag-pdf canvas')].some(c => c.width > 0), { timeout: 30000 }); await esperar(800)
      const caja = await (await pg.$('.pdf')).boundingBox()
      await pg.$eval('.pdf', c => { c.scrollTop = 300 }); await esperar(300)
      const antes = await pg.$eval('.pdf', c => ({ top: c.scrollTop, porc: parseInt(document.querySelector('.zoom-pdf .porc').textContent) }))
      const cy = caja.y + caja.height / 2, cx = caja.x + caja.width / 2
      const a = { x: cx - 40, y: cy }, b = { x: cx + 40, y: cy }
      await toque('touchStart', [a]); await esperar(20)
      await toque('touchStart', [a, b]); await esperar(20)
      for (let i = 1; i <= 10; i++) { await toque('touchMove', [{ x: a.x - 8 * i, y: a.y }, { x: b.x + 8 * i, y: b.y }]); await esperar(25) }
      await toque('touchEnd', []); await esperar(700)
      const despues = await pg.$eval('.pdf', c => ({ top: c.scrollTop, porc: parseInt(document.querySelector('.zoom-pdf .porc').textContent) }))
      const f = despues.porc / antes.porc
      if (!(f > 1.5)) throw new Error(`no acercó (${antes.porc}% → ${despues.porc}%)`)
      // El punto del documento que estaba entre los dedos sigue ahí (sin desplazamientos extra).
      const esperado = (antes.top + caja.height / 2) * f - caja.height / 2
      if (Math.abs(despues.top - esperado) > caja.height * 0.25) throw new Error(`se desplazó de más: scrollTop ${antes.top} → ${despues.top} (esperado ≈ ${Math.round(esperado)})`)
    })
    await s.paso('foto: arrastrar la barrita hacia arriba muestra los detalles y hacia abajo los recoge', async () => {
      await pg.keyboard.press('Escape').catch(() => {}); await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(800)
      await (await pg.$('input[type=file][accept="image/*"]')).uploadFile(IMG)
      await pg.waitForSelector('dialog.visor-foto[open] .ficha.hoja', { timeout: 8000 }); await esperar(400)
      const asa = await (await pg.$('dialog.visor-foto .asa')).boundingBox()
      const p = { x: asa.x + asa.width / 2, y: asa.y + asa.height / 2 }
      await toque('touchStart', [p]); for (let i = 1; i <= 6; i++) { await toque('touchMove', [{ x: p.x, y: p.y - 30 * i }]); await esperar(20) } await toque('touchEnd', []); await esperar(400)
      if (!(await pg.$eval('dialog.visor-foto .ficha', f => !f.classList.contains('baja') && !!f.querySelector('textarea')?.offsetParent))) throw new Error('no se abrieron los detalles al arrastrar hacia arriba')
      const asa2 = await (await pg.$('dialog.visor-foto .asa')).boundingBox()
      const q = { x: asa2.x + asa2.width / 2, y: asa2.y + asa2.height / 2 }
      await toque('touchStart', [q]); for (let i = 1; i <= 6; i++) { await toque('touchMove', [{ x: q.x, y: q.y + 30 * i }]); await esperar(20) } await toque('touchEnd', []); await esperar(400)
      if (!(await pg.$eval('dialog.visor-foto .ficha', f => f.classList.contains('baja')))) throw new Error('no se recogió al arrastrar hacia abajo')
    })
    await s.paso('foto: el grosor de la tinta sigue al zoom con que se dibuja; hay resaltador', async () => {
      const trazar = async () => {
        const r = await (await pg.$('dialog.visor-foto .area')).boundingBox()
        const a = { x: r.x + r.width / 2 - 30, y: r.y + r.height / 2 }
        await toque('touchStart', [a]); for (let i = 1; i <= 6; i++) { await toque('touchMove', [{ x: a.x + 10 * i, y: a.y }]); await esperar(20) } await toque('touchEnd', []); await esperar(200)
      }
      await pg.click('dialog.visor-foto button[aria-label="Tinta rojo"]'); await esperar(200)
      await trazar()
      for (let i = 0; i < 4; i++) await pg.click('dialog.visor-foto button[aria-label="Acercar"]')
      await esperar(300)
      await trazar()
      if (!(await pg.$('dialog.visor-foto button[aria-label="Resaltador"]'))) throw new Error('no hay resaltador')
      await pg.click('dialog.visor-foto button[aria-label="Resaltador"]'); await esperar(200)
      await trazar()
      await clicTexto(pg, 'Guardar'); await esperar(600)
      const t = (await lienzoGuardado(pg)).fotos.at(-1).trazos
      if (t.length !== 3) throw new Error('trazos: ' + t.length)
      if (!(t[0].g > t[1].g * 1.8)) throw new Error(`el grosor no siguió al zoom: ${t[0].g} vs ${t[1].g}`)
      if (!t[2].r) throw new Error('el último trazo no es de resaltador')
    })
    await s.paso('PDF: en modo "Seleccionar texto", arrastrar el dedo selecciona varias palabras sin desplazar', async () => {
      await pg.keyboard.press('Escape').catch(() => {}); await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(600)
      await adjuntar(pg, 'fuente_003', PDF)
      await clicTexto(pg, 'Abrir')
      await pg.waitForFunction(() => document.querySelectorAll('.capa-texto text').length > 20, { timeout: 30000 }); await esperar(500)
      await pg.click('button[aria-label="Seleccionar texto"]'); await esperar(200)
      const runs = await pg.$$eval('.capa-texto text', ts => Array.from(ts).slice(0, 40).map(t => { const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, t: t.textContent } }).filter(r => r.w > 30 && r.y > 80))
      const a = runs[0], z = runs.find(r => r.y > a.y + a.h * 1.5) || runs.at(-1)
      const top0 = await pg.$eval('.pdf', c => c.scrollTop)
      const p0 = { x: a.x + 2, y: a.y + a.h / 2 }, p1 = { x: z.x + z.w - 2, y: z.y + z.h / 2 }
      await toque('touchStart', [p0]); await esperar(30)
      for (let i = 1; i <= 8; i++) { await toque('touchMove', [{ x: p0.x + (p1.x - p0.x) * i / 8, y: p0.y + (p1.y - p0.y) * i / 8 }]); await esperar(25) }
      await toque('touchEnd', []); await esperar(400)
      const sel = await pg.evaluate(() => document.getSelection().toString().replace(/\s+/g, ' ').trim())
      if (sel.split(' ').length < 4) throw new Error('seleccionó muy poco: "' + sel + '"')
      if (Math.abs((await pg.$eval('.pdf', c => c.scrollTop)) - top0) > 5) throw new Error('se desplazó la página al seleccionar')
      await pg.waitForSelector('::-p-xpath(//button[contains(., "Nota con la cita")])', { timeout: 3000 })
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
  // App de Windows: la página con window.canvasWindows usa el puente del servidor real (sin permisos del navegador).
  async windows(b) {
    const s = suite('App de Windows (puente local)')
    const crate = path.resolve(APP, '../receptor/sincro')
    if (spawnSync('cargo', ['build', '--release', '--quiet'], { cwd: crate, stdio: 'inherit' }).status !== 0) { s.fallas.push('cargo build'); return s }
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-win-'))
    const tesis = path.join(raiz, 'tesis'), madre = path.join(raiz, 'madre'), nuevos = path.join(raiz, 'Canvas de Citas')
    fs.mkdirSync(tesis, { recursive: true }); fs.mkdirSync(madre, { recursive: true })
    const lienzo = { modo: 'libre', posiciones: {}, notas: [], fotos: [], listas: [], audios: [], conexiones: [], objetivos: {} }
    const json = (col, items) => JSON.stringify({ [col]: items }, null, 2) + '\n'
    fs.writeFileSync(path.join(tesis, 'proyectos.json'), json('proyectos', [{ id: 'proyecto_001', tipo: 'tesis', titulo: 'Tesis en Windows', objetivos_especificos: [], indicadores: [], canvas: lienzo }]))
    fs.writeFileSync(path.join(tesis, 'fuentes.json'), json('fuentes', []))
    fs.writeFileSync(path.join(tesis, 'citas.json'), json('citas', []))
    const registro = path.join(raiz, 'proyectos-abiertos.json')
    fs.writeFileSync(registro, JSON.stringify([{ clave: 'a', nombre: 'tesis', carpeta: tesis, proyectos: ['proyecto_001'], biblioteca: true, sincronizar: true }]))
    const bin = path.join(crate, 'target', 'release', process.platform === 'win32' ? 'canvas-sincro.exe' : 'canvas-sincro')
    const srv = spawn(bin, ['--registro', registro, '--estado', path.join(raiz, 'estado'), '--nuevos', nuevos, '--token-archivo', path.join(raiz, 'token.txt'), '--puerto', '0'], { env: { ...process.env, CANVAS_ELEGIR_CARPETA: madre } })
    const info = JSON.parse(await new Promise(res => srv.stdout.once('data', d => res(String(d).split('\n')[0]))))
    const pg = await pagina(b)
    await pg.evaluateOnNewDocument(w => { window.canvasWindows = w }, { puerto: info.puerto, token: info.token })
    const cuerpo = () => pg.evaluate(() => document.body.textContent)
    const esperarQue = async (fn, ms = 12000) => { for (let t = 0; t < ms; t += 250) { if (await fn()) return true; await esperar(250) } return false }
    const leer = (...p) => { try { return fs.readFileSync(path.join(...p), 'utf8') } catch { return null } }
    try {
      await pg.goto(URL_APP, { waitUntil: 'load' }); await esperar(2500)
      await s.paso('abre los proyectos de sus carpetas sin pedir permisos', async () => {
        await pg.goto(URL_APP + '#/', { waitUntil: 'load' })
        if (!(await esperarQue(async () => (await cuerpo()).includes('Tesis en Windows')))) throw new Error('no cargó el proyecto de la carpeta')
        if ((await cuerpo()).includes('Dar permiso')) throw new Error('pidió permiso')
      })
      await s.paso('lo que se edita se guarda en la carpeta del disco', async () => {
        await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(900)
        await pg.click('button[aria-label="Añadir nota"]')
        await pg.type('dialog[open] textarea', 'Nota escrita en la app de Windows')
        await clicTexto(pg, 'Guardar')
        if (!(await esperarQue(async () => leer(tesis, 'proyectos.json')?.includes('Nota escrita en la app de Windows')))) throw new Error('no llegó al disco')
        if (!(await esperarQue(async () => leer(tesis, 'CLAUDE.md') !== null))) throw new Error('sin CLAUDE.md')
      })
      await s.paso('nuevo proyecto: diálogo de Windows, su carpeta y el registro del servidor', async () => {
        await pg.goto(URL_APP + '#/', { waitUntil: 'load' }); await esperar(800)
        await pg.click('button[aria-label="Nuevo proyecto"]')
        await pg.type('dialog[open] input[type=text]', 'Puentes: diseño')
        await clicTexto(pg, 'Crear proyecto')
        if (!(await esperarQue(async () => leer(madre, 'Puentes diseño', 'proyectos.json')?.includes('Puentes: diseño')))) throw new Error('no se creó madre/Puentes diseño/proyectos.json')
        const reg = JSON.parse(leer(registro))
        if (!reg.some(e => e.carpeta.endsWith('Puentes diseño') && e.proyectos.length === 1)) throw new Error('el servidor no lo tiene registrado: ' + JSON.stringify(reg))
      })
      await s.paso('"Sincronizar con el celular" se puede desmarcar por proyecto', async () => {
        await pg.goto(URL_APP + '#/', { waitUntil: 'load' }); await esperar(800)
        const celda = await pg.evaluateHandle(() => [...document.querySelectorAll('.celda')].find(x => x.textContent.includes('Puentes: diseño')))
        await (await celda.asElement().$('input[aria-label="Sincronizar con el celular"]')).click()
        if (!(await esperarQue(async () => JSON.parse(leer(registro)).some(e => e.carpeta.endsWith('Puentes diseño') && e.sincronizar === false)))) throw new Error('no se guardó en el registro')
      })
      await s.paso('Configuración → Vincular celular muestra el código y el QR', async () => {
        await pg.click('button[aria-label="Configuración"]').catch(() => clicTexto(pg, 'Configuración'))
        await pg.waitForSelector('dialog[open] .qr svg', { timeout: 8000 })
        const codigo = await pg.$eval('dialog[open] .codigo code', e => e.textContent)
        if (!codigo.startsWith('canvas-sync://')) throw new Error('código: ' + codigo)
        await pg.screenshot({ path: path.join(SALIDA, 'windows-vincular.png') })
        await pg.keyboard.press('Escape'); await esperar(300)
      })
      await s.paso('un proyecto que el servidor registró (llegó del celular) aparece al abrir', async () => {
        const dir = path.join(nuevos, 'Del celular'); fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'proyectos.json'), json('proyectos', [{ id: 'proyecto_050', tipo: 'tesis', titulo: 'Proyecto del celular', objetivos_especificos: [], indicadores: [], canvas: lienzo }]))
        const reg = JSON.parse(leer(registro)); reg.push({ clave: 's1', nombre: 'Del celular', carpeta: dir, proyectos: ['proyecto_050'], biblioteca: false, sincronizar: true })
        fs.writeFileSync(registro, JSON.stringify(reg))
        await pg.reload({ waitUntil: 'load' })
        if (!(await esperarQue(async () => (await cuerpo()).includes('Proyecto del celular')))) throw new Error('no apareció')
      })
      await s.paso('con la app abierta, un proyecto que registra el servidor aparece y guardar no lo quita del registro (I-4)', async () => {
        const dir = path.join(nuevos, 'Otro del celular'); fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'proyectos.json'), json('proyectos', [{ id: 'proyecto_051', tipo: 'tesis', titulo: 'Segundo del celular', objetivos_especificos: [], indicadores: [], canvas: lienzo }]))
        const reg = JSON.parse(leer(registro)); reg.push({ clave: 's2', nombre: 'Otro del celular', carpeta: dir, proyectos: ['proyecto_051'], biblioteca: false, sincronizar: true })
        fs.writeFileSync(registro, JSON.stringify(reg))
        // Mientras tanto la app guarda su registro (desmarcar/marcar sincronizar en otro proyecto).
        const celda = await pg.evaluateHandle(() => [...document.querySelectorAll('.celda')].find(x => x.textContent.includes('Tesis en Windows')))
        await (await celda.asElement().$('input[aria-label="Sincronizar con el celular"]')).click(); await esperar(500)
        if (!JSON.parse(leer(registro)).some(e => e.clave === 's2')) throw new Error('guardar el registro de la app borró la entrada del servidor')
        if (!(await esperarQue(async () => (await cuerpo()).includes('Segundo del celular'), 15000))) throw new Error('no apareció sin recargar')
      })
    } finally { srv.kill() }
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
  // Carpetas: casos de pérdida de datos encontrados en la revisión (C1–C5, I3–I6).
  async carpetas2(b) {
    const s = suite('Carpetas: sin perder datos'), pg = await pagina(b)
    await carpetasSimuladas(pg)
    const cuerpo = () => pg.evaluate(() => document.body.textContent)
    const esperarQue = async (fn, ms = 12000) => { for (let t = 0; t < ms; t += 250) { if (await fn()) return true; await esperar(250) } return false }
    const lienzo = { modo: 'libre', posiciones: {}, notas: [], fotos: [], listas: [], audios: [], conexiones: [], objetivos: {} }
    const json = (col, items) => JSON.stringify({ [col]: items }, null, 2) + '\n'
    const jl = async ruta => JSON.parse((await leerOpfs(pg, ruta)) || 'null')
    const inicio = async () => { await pg.goto(URL_APP + '#/', { waitUntil: 'networkidle0' }); await esperar(800) }
    await pg.goto(URL_APP, { waitUntil: 'networkidle0' }); await esperar(2500)
    // A: la tesis (fuente 1 citada, fuente 2 sin citas). B: otro proyecto que cita la misma fuente 1.
    await escribirOpfs(pg, 'A/proyectos.json', json('proyectos', [{ id: 'proyecto_001', tipo: 'tesis', titulo: 'Tesis A', objetivos_especificos: [], indicadores: [], canvas: lienzo }]))
    await escribirOpfs(pg, 'A/fuentes.json', json('fuentes', [{ id: 'fuente_001', tipo_fuente: 'libro', autores: ['Uno, A.'], anio: 2001, titulo: 'F1' }, { id: 'fuente_002', tipo_fuente: 'libro', autores: ['Dos, B.'], anio: 2002, titulo: 'F2 sin citas' }]))
    await escribirOpfs(pg, 'A/citas.json', json('citas', [{ id: 'cita_001', proyecto_id: 'proyecto_001', fuente_id: 'fuente_001', estado_uso: 'usando', cita_textual_o_parafraseo: 'textual', pagina: 11, cita_en_texto: '', contexto: '' }]))
    await escribirOpfs(pg, 'B/proyectos.json', json('proyectos', [{ id: 'proyecto_002', tipo: 'tesis', titulo: 'Proyecto B', objetivos_especificos: [], indicadores: [], canvas: lienzo }]))
    await escribirOpfs(pg, 'B/fuentes.json', json('fuentes', [{ id: 'fuente_001', tipo_fuente: 'libro', autores: ['Uno, A.'], anio: 2001, titulo: 'F1' }]))
    await escribirOpfs(pg, 'B/citas.json', json('citas', [{ id: 'cita_101', proyecto_id: 'proyecto_002', fuente_id: 'fuente_001', estado_uso: 'usando', cita_textual_o_parafraseo: 'textual', pagina: 5, cita_en_texto: '', contexto: '' }]))

    await s.paso('abrir una carpeta con fuentes sin citas (sin biblioteca) no las borra del disco (C5)', async () => {
      await inicio(); await pg.elegir('A'); await clicTexto(pg, 'Abrir proyecto')
      if (!(await esperarQue(async () => (await cuerpo()).includes('Tesis A')))) throw new Error('no abrió A')
      await esperarQue(async () => (await leerOpfs(pg, 'A/CLAUDE.md')) !== null)
      if (!(await leerOpfs(pg, 'A/fuentes.json')).includes('F2 sin citas')) throw new Error('A/fuentes.json perdió la fuente sin citas')
      await inicio(); await pg.elegir('B'); await clicTexto(pg, 'Abrir proyecto')
      if (!(await esperarQue(async () => (await cuerpo()).includes('Proyecto B')))) throw new Error('no abrió B')
    })
    await s.paso('una cita que la skill crea con un id que ya existe en otra carpeta no pisa la otra (C2)', async () => {
      const c = await jl('B/citas.json')
      c.citas.push({ id: 'cita_001', proyecto_id: 'proyecto_002', fuente_id: 'fuente_001', estado_uso: 'usando', cita_textual_o_parafraseo: 'parafraseo', pagina: 77, cita_en_texto: '', contexto: 'nueva en B' })
      await escribirOpfs(pg, 'B/citas.json', JSON.stringify(c, null, 2) + '\n')
      if (!(await esperarQue(async () => (await jl('B/citas.json')).citas.some(x => x.pagina === 77 && x.id !== 'cita_001')))) throw new Error('la cita nueva de B no se renumeró en su carpeta')
      const a = await jl('A/citas.json')
      if (a.citas.length !== 1 || a.citas[0].pagina !== 11 || a.citas[0].proyecto_id !== 'proyecto_001') throw new Error('se pisó la cita de A: ' + JSON.stringify(a.citas))
    })
    await s.paso('una copia vieja de una fuente compartida no revierte una corrección (I4)', async () => {
      const a = await jl('A/fuentes.json')
      a.fuentes.find(f => f.id === 'fuente_001').titulo = 'F1 corregida'
      await escribirOpfs(pg, 'A/fuentes.json', JSON.stringify(a, null, 2) + '\n')
      // En seguida, la skill reescribe B/fuentes.json entero (con su copia vieja de F1) para agregar una fuente.
      await escribirOpfs(pg, 'B/fuentes.json', json('fuentes', [{ id: 'fuente_001', tipo_fuente: 'libro', autores: ['Uno, A.'], anio: 2001, titulo: 'F1' }, { id: 'fuente_050', tipo_fuente: 'libro', autores: ['Cinco, C.'], anio: 2005, titulo: 'F50 de B' }]))
      // (y la cita en B, como hace la skill al agregar una fuente a un proyecto; sin cita iría a la biblioteca)
      const cb = await jl('B/citas.json')
      cb.citas.push({ id: 'cita_150', proyecto_id: 'proyecto_002', fuente_id: 'fuente_050', estado_uso: 'no_revisado', cita_textual_o_parafraseo: 'parafraseo', pagina: null, cita_en_texto: '', contexto: '' })
      await escribirOpfs(pg, 'B/citas.json', JSON.stringify(cb, null, 2) + '\n')
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'B/fuentes.json')).includes('F50 de B') && (await leerOpfs(pg, 'B/fuentes.json')).includes('F1 corregida')))) throw new Error('B no quedó con F1 corregida y F50: ' + JSON.stringify((await jl('B/fuentes.json')).fuentes.map(f => f.id + '=' + f.titulo)) + ' A: ' + JSON.stringify((await jl('A/fuentes.json')).fuentes.map(f => f.id + '=' + f.titulo)))
      await esperar(1500)
      if (!(await leerOpfs(pg, 'A/fuentes.json')).includes('F1 corregida')) throw new Error('la copia vieja revirtió la corrección en A')
    })
    await s.paso('eliminados.json de una carpeta no borra lo que la otra carpeta usa (I3)', async () => {
      await escribirOpfs(pg, 'B/eliminados.json', JSON.stringify({ fuentes: ['fuente_001'] }))
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'B/eliminados.json')) === null))) throw new Error('no se consumió')
      await esperar(1500)
      const a = await jl('A/fuentes.json'), ac = await jl('A/citas.json')
      if (!a.fuentes.some(f => f.id === 'fuente_001') || !ac.citas.some(c => c.id === 'cita_001')) throw new Error('se borró de A lo que A usa')
      if ((await jl('B/citas.json')).citas.some(c => c.fuente_id === 'fuente_001')) throw new Error('en B la fuente sigue citada')
    })
    await s.paso('al abrir la app, lo que la skill cambió con la app cerrada en cualquier carpeta se conserva (C1)', async () => {
      await pg.goto(URL_APP + 'manifest.webmanifest'); await esperar(300) // la app queda cerrada
      const pa = await jl('A/proyectos.json'); pa.proyectos[0].titulo = 'Tesis A editada fuera'
      await escribirOpfs(pg, 'A/proyectos.json', JSON.stringify(pa, null, 2) + '\n')
      const pb = await jl('B/proyectos.json'); pb.proyectos[0].titulo = 'Proyecto B editado fuera'
      await escribirOpfs(pg, 'B/proyectos.json', JSON.stringify(pb, null, 2) + '\n')
      await inicio()
      if (!(await esperarQue(async () => (await cuerpo()).includes('Tesis A editada fuera') && (await cuerpo()).includes('Proyecto B editado fuera')))) throw new Error('se perdió un cambio hecho con la app cerrada')
      await esperar(1500)
      if (!(await leerOpfs(pg, 'B/proyectos.json')).includes('Proyecto B editado fuera')) throw new Error('B/proyectos.json se sobrescribió')
    })
    await s.paso('reabrir una carpeta cerrada no revierte lo editado mientras tanto (I5)', async () => {
      pg.once('dialog', d => d.accept())
      const tarjeta = await pg.evaluateHandle(() => [...document.querySelectorAll('.celda')].find(x => x.textContent.includes('Proyecto B')))
      await (await tarjeta.asElement().$('button[aria-label="Cerrar proyecto"]')).click()
      if (!(await esperarQue(async () => !(await cuerpo()).includes('Proyecto B')))) throw new Error('no se cerró B')
      // Mientras B está cerrado, se corrige F50 en A... no: F50 es solo de B. Se corrige F1 en A.
      const a = await jl('A/fuentes.json'); a.fuentes.find(f => f.id === 'fuente_001').titulo = 'F1 versión 3'
      await escribirOpfs(pg, 'A/fuentes.json', JSON.stringify(a, null, 2) + '\n')
      if (!(await esperarQue(async () => (await cuerpo()).includes('Tesis A')))) throw new Error('perdió A')
      await esperar(9000) // recogida
      await inicio(); await pg.elegir('B'); await clicTexto(pg, 'Abrir proyecto')
      if (!(await esperarQue(async () => (await cuerpo()).includes('Proyecto B')))) throw new Error('no reabrió B')
      await esperar(1500)
      if (!(await leerOpfs(pg, 'A/fuentes.json')).includes('F1 versión 3')) throw new Error('reabrir B revirtió F1 en A')
    })
    await s.paso('un proyecto sin carpeta no ofrece "Cerrar" (se borraría del todo) (C4)', async () => {
      await inicio()
      await pg.evaluate(() => sessionStorage.setItem('__elegir', '[]')) // cancelar el selector de carpeta
      await pg.click('button[aria-label="Nuevo proyecto"]')
      await pg.type('dialog[open] input[type=text]', 'Sin carpeta de prueba')
      await clicTexto(pg, 'Crear proyecto'); await esperar(800)
      await inicio()
      const celda = await pg.evaluateHandle(() => [...document.querySelectorAll('.celda')].find(x => x.textContent.includes('Sin carpeta de prueba')))
      if (!celda.asElement()) throw new Error('no se ve el proyecto')
      if (await celda.asElement().$('button[aria-label="Cerrar proyecto"]')) throw new Error('ofrece cerrar un proyecto sin carpeta')
    })
    await s.paso('abrir una carpeta con un JSON ilegible no lo sobrescribe (I6)', async () => {
      await escribirOpfs(pg, 'rota/proyectos.json', '{"proyectos": [ {"id": "proyecto_009", "titulo": "Roto"')
      await escribirOpfs(pg, 'rota/citas.json', json('citas', []))
      await inicio(); await pg.elegir('rota'); await clicTexto(pg, 'Abrir proyecto'); await esperar(2000)
      if ((await leerOpfs(pg, 'rota/proyectos.json')) !== '{"proyectos": [ {"id": "proyecto_009", "titulo": "Roto"') throw new Error('se sobrescribió el JSON ilegible')
    })
    await s.paso('elegir como biblioteca una carpeta que ya tiene datos no la vacía (C-3)', async () => {
      await escribirOpfs(pg, 'condatos/fuentes.json', json('fuentes', [{ id: 'fuente_900', tipo_fuente: 'libro', autores: ['X, Y.'], anio: 2000, titulo: 'No me borres' }]))
      await inicio()
      await pg.click('button[aria-label="Configuración"]').catch(() => clicTexto(pg, 'Configuración'))
      await pg.elegir('condatos')
      await clicTexto(pg, 'carpeta de biblioteca'); await esperar(1500)
      if (!(await leerOpfs(pg, 'condatos/fuentes.json')).includes('No me borres')) throw new Error('se vació la carpeta elegida')
      await pg.keyboard.press('Escape'); await esperar(300)
    })
    await s.paso('una carpeta con un JSON ilegible al abrir la app no se sobrescribe y avisa (C-2)', async () => {
      await escribirOpfs(pg, 'mal/proyectos.json', json('proyectos', [{ id: 'proyecto_070', tipo: 'tesis', titulo: 'Proyecto de mal', objetivos_especificos: [], indicadores: [], canvas: lienzo }]))
      await escribirOpfs(pg, 'mal/citas.json', '{"citas": [ {"id": "cita_070"')
      await escribirOpfs(pg, 'mal/fuentes.json', json('fuentes', [{ id: 'fuente_070', tipo_fuente: 'libro', autores: ['M, A.'], anio: 2007, titulo: 'Fuente de mal' }]))
      // Registrada como en otra instalación (la app aún no la leyó nunca).
      await pg.evaluate(() => new Promise(res => {
        const r = indexedDB.open('canvas-de-citas')
        r.onsuccess = () => { const t = r.result.transaction('meta', 'readwrite'); const m = t.objectStore('meta'); const q = m.get('carpetas'); q.onsuccess = () => { m.put([...(q.result || []), { clave: 'cmal', nombre: 'mal', proyectos: ['proyecto_070'], biblioteca: false, opfs: ['mal'] }], 'carpetas') }; t.oncomplete = res }
      }))
      await pg.reload({ waitUntil: 'networkidle0' }); await esperar(4000)
      if ((await leerOpfs(pg, 'mal/citas.json')) !== '{"citas": [ {"id": "cita_070"') throw new Error('se sobrescribió el JSON ilegible')
      if (!(await leerOpfs(pg, 'mal/fuentes.json')).includes('Fuente de mal')) throw new Error('se vació fuentes.json')
      if (!(await leerOpfs(pg, 'mal/proyectos.json')).includes('Proyecto de mal')) throw new Error('se vació proyectos.json')
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
  // Un proyecto, una carpeta (carpetas simuladas con OPFS).
  async carpetas(b) {
    const s = suite('Proyectos en carpetas'), pg = await pagina(b)
    await carpetasSimuladas(pg)
    const cuerpo = () => pg.evaluate(() => document.body.textContent)
    const esperarQue = async (fn, ms = 12000) => { for (let t = 0; t < ms; t += 250) { if (await fn()) return true; await esperar(250) } return false }
    const lienzo = { modo: 'libre', posiciones: {}, notas: [], fotos: [], listas: [], audios: [], conexiones: [], objetivos: {} }
    const json = (col, items) => JSON.stringify({ [col]: items }, null, 2) + '\n'
    // La primera visita activa el service worker, que recarga la página una vez: se espera a eso.
    const recargar = async () => { await pg.goto(URL_APP, { waitUntil: 'networkidle0' }).catch(() => {}); await esperar(1500); await pg.waitForSelector('body') }
    await pg.goto(URL_APP, { waitUntil: 'networkidle0' }); await esperar(2500)
    await s.paso('migra la carpeta del formato anterior sin perder nada', async () => {
      await escribirOpfs(pg, 'tesis/proyectos.json', json('proyectos', [{ id: 'proyecto_001', tipo: 'tesis', titulo: 'Tesis de prueba', objetivos_especificos: [], indicadores: [], canvas: lienzo }]))
      await escribirOpfs(pg, 'tesis/fuentes.json', json('fuentes', [
        { id: 'fuente_001', tipo_fuente: 'libro', autores: ['Pérez, A.'], anio: 2020, titulo: 'Citada', documento_original: 'fuentes/fuente_001/documento.pdf' },
        { id: 'fuente_002', tipo_fuente: 'libro', autores: ['Soto, B.'], anio: 2021, titulo: 'Sin citas', documento_original: null }]))
      await escribirOpfs(pg, 'tesis/citas.json', json('citas', [{ id: 'cita_001', proyecto_id: 'proyecto_001', fuente_id: 'fuente_001', estado_uso: 'usando', cita_textual_o_parafraseo: 'textual', pagina: 3, cita_en_texto: '(Pérez, 2020)', contexto: '' }]))
      await escribirOpfs(pg, 'tesis/fuentes/fuente_001/documento.pdf', '%PDF-falso')
      // Así quedaba registrada la carpeta en la versión anterior (una sola carpeta para todo). En OPFS se
      // registra por ruta: Chrome se cae al leer de IndexedDB un handle de OPFS (las carpetas reales sí son handles).
      await pg.evaluate(() => new Promise((res, rej) => {
        const r = indexedDB.open('canvas-de-citas')
        r.onsuccess = () => { const t = r.result.transaction('meta', 'readwrite'); t.objectStore('meta').put({ opfs: ['tesis'] }, 'carpeta'); t.oncomplete = res; t.onerror = rej }
      }))
      await recargar()
      if (!(await esperarQue(async () => (await cuerpo()).includes('Tesis de prueba')))) throw new Error('no cargó el proyecto de la carpeta')
      const registro = await pg.evaluate(() => new Promise(res => {
        const r = indexedDB.open('canvas-de-citas')
        r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').get('carpetas'); q.onsuccess = () => res((q.result || []).map(c => ({ nombre: c.nombre, proyectos: c.proyectos, biblioteca: c.biblioteca }))) }
      }))
      if (JSON.stringify(registro) !== JSON.stringify([{ nombre: 'tesis', proyectos: ['proyecto_001'], biblioteca: true }])) throw new Error('registro: ' + JSON.stringify(registro))
      await esperarQue(async () => (await leerOpfs(pg, 'tesis/CLAUDE.md')) !== null)
      const fuentes = await leerOpfs(pg, 'tesis/fuentes.json')
      if (!fuentes.includes('fuente_001') || !fuentes.includes('fuente_002')) throw new Error('se perdió una fuente: ' + fuentes.slice(0, 300))
      if ((await leerOpfs(pg, 'tesis/fuentes/fuente_001/documento.pdf')) !== '%PDF-falso') throw new Error('se perdió el documento')
    })
    await s.paso('un cambio externo (la skill) en la carpeta se recoge', async () => {
      const p = JSON.parse(await leerOpfs(pg, 'tesis/proyectos.json'))
      p.proyectos[0].titulo = 'Tesis renombrada por la skill'
      await escribirOpfs(pg, 'tesis/proyectos.json', JSON.stringify(p, null, 2) + '\n')
      if (!(await esperarQue(async () => (await cuerpo()).includes('Tesis renombrada por la skill')))) throw new Error('no recogió el cambio')
    })
    await s.paso('eliminados.json borra la cita y se consume', async () => {
      await escribirOpfs(pg, 'tesis/eliminados.json', JSON.stringify({ citas: ['cita_001'] }))
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'tesis/eliminados.json')) === null))) throw new Error('no consumió eliminados.json')
      if (!(await esperarQue(async () => !(await leerOpfs(pg, 'tesis/citas.json')).includes('cita_001')))) throw new Error('la cita sigue en citas.json')
    })
    await s.paso('nuevo proyecto crea su propia carpeta', async () => {
      await pg.goto(URL_APP + '#/', { waitUntil: 'networkidle0' }); await esperar(800)
      await pg.elegir('madre')
      await pg.click('button[aria-label="Nuevo proyecto"]')
      await pg.type('dialog[open] input[type=text]', 'Vías urbanas')
      await clicTexto(pg, 'Crear proyecto')
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'madre/Vías urbanas/proyectos.json'))?.includes('Vías urbanas')))) throw new Error('no se creó madre/Vías urbanas/proyectos.json')
      if ((await leerOpfs(pg, 'tesis/proyectos.json')).includes('Vías urbanas')) throw new Error('el proyecto nuevo también quedó en la carpeta de la tesis')
    })
    await s.paso('una fuente citada en dos proyectos queda en las dos carpetas y se actualiza en ambas', async () => {
      const vias = JSON.parse(await leerOpfs(pg, 'madre/Vías urbanas/proyectos.json')).proyectos[0].id
      // Como lo haría la skill: una cita nueva en la carpeta del proyecto nuevo que usa la fuente de la tesis.
      await escribirOpfs(pg, 'madre/Vías urbanas/citas.json', json('citas', [{ id: 'cita_050', proyecto_id: vias, fuente_id: 'fuente_001', estado_uso: 'usando', cita_textual_o_parafraseo: 'parafraseo', pagina: null, cita_en_texto: '', contexto: '' }]))
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'madre/Vías urbanas/fuentes.json'))?.includes('fuente_001')))) throw new Error('la fuente no llegó a la carpeta del proyecto nuevo')
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'madre/Vías urbanas/fuentes/fuente_001/documento.pdf')) === '%PDF-falso'))) throw new Error('su documento no llegó a la carpeta del proyecto nuevo')
      const citasTesis = JSON.parse(await leerOpfs(pg, 'tesis/citas.json'))
      citasTesis.citas.push({ id: 'cita_051', proyecto_id: 'proyecto_001', fuente_id: 'fuente_001', estado_uso: 'usando', cita_textual_o_parafraseo: 'textual', pagina: 5, cita_en_texto: '', contexto: '' })
      await escribirOpfs(pg, 'tesis/citas.json', JSON.stringify(citasTesis, null, 2) + '\n')
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'tesis/fuentes.json')).includes('fuente_001')))) throw new Error('la fuente no volvió a la tesis')
      const f = JSON.parse(await leerOpfs(pg, 'tesis/fuentes.json'))
      f.fuentes.find(x => x.id === 'fuente_001').titulo = 'Citada (corregida)'
      await escribirOpfs(pg, 'tesis/fuentes.json', JSON.stringify(f, null, 2) + '\n')
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'madre/Vías urbanas/fuentes.json')).includes('Citada (corregida)')))) throw new Error('la corrección no llegó a la otra carpeta')
    })
    await s.paso('abrir una carpeta de otra instalación renumera lo que choca', async () => {
      await escribirOpfs(pg, 'otra/proyectos.json', json('proyectos', [{ id: 'proyecto_001', tipo: 'tesis', titulo: 'Otra tesis', objetivos_especificos: [], indicadores: [],
        canvas: { ...lienzo, notas: [{ id: 'nota_ajena', texto: 'idea ajena', x: 0, y: 0 }], conexiones: [{ desde: 'nota_ajena', hasta: 'fuente_001' }], posiciones: { fuente_001: { x: 300, y: 0 } } } }]))
      await escribirOpfs(pg, 'otra/fuentes.json', json('fuentes', [{ id: 'fuente_001', tipo_fuente: 'libro', autores: ['Ajeno, Z.'], anio: 1999, titulo: 'Fuente ajena', documento_original: 'fuentes/fuente_001/documento.pdf' }]))
      await escribirOpfs(pg, 'otra/citas.json', json('citas', [{ id: 'cita_001', proyecto_id: 'proyecto_001', fuente_id: 'fuente_001', estado_uso: 'usando', cita_textual_o_parafraseo: 'textual', pagina: 7, cita_en_texto: '', contexto: '' }]))
      await escribirOpfs(pg, 'otra/fuentes/fuente_001/documento.pdf', '%PDF-ajeno')
      await pg.goto(URL_APP + '#/', { waitUntil: 'networkidle0' }); await esperar(800)
      await pg.elegir('otra')
      await clicTexto(pg, 'Abrir proyecto')
      if (!(await esperarQue(async () => (await cuerpo()).includes('Otra tesis')))) throw new Error('no apareció el proyecto abierto')
      await pg.goto(URL_APP + '#/', { waitUntil: 'networkidle0' }); await esperar(600)
      if (!(await cuerpo()).includes('Tesis renombrada por la skill')) throw new Error('desapareció la tesis')
      await esperarQue(async () => !(await leerOpfs(pg, 'otra/proyectos.json')).includes('"proyecto_001"'))
      const p = JSON.parse(await leerOpfs(pg, 'otra/proyectos.json')).proyectos[0]
      const f = JSON.parse(await leerOpfs(pg, 'otra/fuentes.json')).fuentes[0]
      const c = JSON.parse(await leerOpfs(pg, 'otra/citas.json')).citas[0]
      if (p.id === 'proyecto_001' || f.id === 'fuente_001') throw new Error(`no renumeró: ${p.id} ${f.id}`)
      if (c.proyecto_id !== p.id || c.fuente_id !== f.id) throw new Error('la cita no apunta a los ids nuevos')
      if (p.canvas.conexiones[0].hasta !== f.id || !(f.id in p.canvas.posiciones)) throw new Error('el lienzo no apunta a la fuente nueva')
      if ((await leerOpfs(pg, `otra/fuentes/${f.id}/documento.pdf`)) !== '%PDF-ajeno') throw new Error('el documento no se movió a la ruta nueva')
      if ((await leerOpfs(pg, 'tesis/fuentes.json')).includes('Fuente ajena')) throw new Error('la fuente ajena se metió en la tesis')
    })
    await s.paso('cerrar un proyecto lo quita de la app sin borrar su carpeta', async () => {
      pg.once('dialog', d => d.accept())
      const tarjeta = await pg.evaluateHandle(() => [...document.querySelectorAll('.celda')].find(x => x.textContent.includes('Otra tesis')))
      await (await tarjeta.asElement().$('button[aria-label="Cerrar proyecto"]')).click()
      if (!(await esperarQue(async () => !(await cuerpo()).includes('Otra tesis')))) throw new Error('sigue en la lista')
      if (!(await leerOpfs(pg, 'otra/proyectos.json')).includes('Otra tesis')) throw new Error('se borró de su carpeta')
    })
    await s.paso('sin permiso: el aviso "Dar permiso" reconecta las carpetas', async () => {
      await pg.evaluate(() => sessionStorage.setItem('__sinPermiso', '1'))
      await pg.reload({ waitUntil: 'networkidle0' }); await esperar(800) // como abrir la app otro día
      await pg.waitForSelector('::-p-xpath(//button[contains(., "Dar permiso")])', { timeout: 8000 }).catch(async () => { throw new Error('sin aviso; se ve: ' + (await cuerpo()).replace(/\s+/g, ' ').slice(-400) + ' | errores: ' + pg.errores.join(' / ')) })
      await clicTexto(pg, 'Dar permiso')
      if (!(await esperarQue(async () => !(await cuerpo()).includes('necesita')))) throw new Error('el aviso sigue')
      const antes = await leerOpfs(pg, 'madre/Vías urbanas/CLAUDE.md')
      await escribirOpfs(pg, 'madre/Vías urbanas/eliminados.json', JSON.stringify({ citas: ['cita_050'] }))
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'madre/Vías urbanas/eliminados.json')) === null))) throw new Error('no volvió a leer la carpeta')
      if (!(await esperarQue(async () => (await leerOpfs(pg, 'madre/Vías urbanas/CLAUDE.md')) !== antes))) throw new Error('no volvió a guardar')
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
  // Etiquetas #/@ y buscador general (Ctrl+F).
  async etiquetas(b) {
    const s = suite('Etiquetas y buscador'), pg = await pagina(b)
    await conEjemplo(pg)
    const nota = async texto => {
      await pg.click('button[aria-label="Añadir nota"]')
      await pg.type('dialog[open] textarea', texto)
      await clicTexto(pg, 'Guardar'); await esperar(400)
    }
    await s.paso('una nota con #tema y @persona muestra sus chips', async () => {
      await nota('Revisar #vial con @Villarreal')
      const chips = await pg.$$eval('g.tarjeta.notas .etq text', ts => Array.from(ts, t => t.textContent))
      if (!chips.includes('#vial') || !chips.includes('@Villarreal')) throw new Error('chips: ' + chips)
    })
    await s.paso('etiqueta puesta como chip (sin escribirla en el texto)', async () => {
      await pg.click('button[aria-label="Añadir nota"]')
      await pg.type('dialog[open] textarea', 'nota con chip')
      await pg.type('dialog[open] input[aria-label="Etiquetas y personas"]', '@Ana')
      await pg.keyboard.press('Enter')
      await clicTexto(pg, 'Guardar'); await esperar(400)
      const n = (await lienzoGuardado(pg)).notas.find(x => x.texto === 'nota con chip')
      if (JSON.stringify(n?.etiquetas) !== '["@Ana"]') throw new Error('etiquetas: ' + JSON.stringify(n?.etiquetas))
      const chips = await pg.$$eval('g.tarjeta.notas .etq text', ts => Array.from(ts, x => x.textContent))
      if (!chips.includes('@Ana')) throw new Error('sin chip @Ana en el lienzo')
    })
    await s.paso('autocompletar al escribir #', async () => {
      await pg.click('button[aria-label="Añadir nota"]')
      await pg.type('dialog[open] textarea', 'otra idea #vi')
      await pg.waitForSelector('.autocompletar li', { timeout: 3000 })
      await pg.keyboard.press('Enter')
      const v = await pg.$eval('dialog[open] textarea', t => t.value)
      if (!v.includes('#vial ')) throw new Error('quedó: ' + v)
      await clicTexto(pg, 'Guardar'); await esperar(300)
    })
    await s.paso('el buscador del lienzo filtra por #tema', async () => {
      await nota('sin etiqueta')
      await pg.type('#buscar-fuente', '#vial'); await esperar(300)
      const notas = await pg.$$eval('g.tarjeta.notas', gs => Array.from(gs, g => [g.textContent.includes('sin etiqueta'), g.textContent.includes('#vial'), g.classList.contains('atenuada')]))
      if (!notas.some(([sin, , at]) => sin && at)) throw new Error('no atenuó la nota sin etiqueta')
      if (notas.some(([, con, at]) => con && at)) throw new Error('atenuó una nota con #vial')
      await pg.$eval('#buscar-fuente', i => { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) }); await esperar(200)
    })
    await s.paso('el buscador del lienzo encuentra una @persona puesta solo como chip', async () => {
      await pg.type('#buscar-fuente', '@ana'); await esperar(300)
      const notas = await pg.$$eval('g.tarjeta.notas', gs => Array.from(gs, g => [g.textContent.includes('nota con chip'), g.classList.contains('atenuada')]))
      if (!notas.some(([es]) => es)) throw new Error('no se ve la nota con chip')
      if (notas.some(([es, at]) => es && at)) throw new Error('atenuó la nota con @Ana en su campo de etiquetas')
      await pg.$eval('#buscar-fuente', i => { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) }); await esperar(200)
    })
    await s.paso('quitar el último chip se guarda', async () => {
      const g = await pg.evaluateHandle(() => [...document.querySelectorAll('g.tarjeta.notas')].find(x => x.textContent.includes('nota con chip')))
      await g.asElement().click(); await pg.waitForSelector('dialog[open] button[aria-label="Quitar @Ana"]', { timeout: 5000 })
      await pg.click('dialog[open] button[aria-label="Quitar @Ana"]')
      await clicTexto(pg, 'Guardar'); await esperar(400)
      const n = (await lienzoGuardado(pg)).notas.find(x => x.texto === 'nota con chip')
      if (n.etiquetas?.length) throw new Error('el chip volvió: ' + JSON.stringify(n.etiquetas))
    })
    await s.paso('Ctrl+F escribiendo en un editor no abre el buscador ni cierra el editor', async () => {
      await pg.click('button[aria-label="Añadir nota"]')
      await pg.type('dialog[open] textarea', 'texto a medias')
      await pg.keyboard.down('Control'); await pg.keyboard.press('f'); await pg.keyboard.up('Control'); await esperar(300)
      if (await pg.$('.buscador')) throw new Error('abrió el buscador general')
      if (await pg.$eval('dialog[open] textarea', x => x.value) !== 'texto a medias') throw new Error('se perdió el texto')
      await pg.keyboard.press('Escape'); await esperar(300)
    })
    await s.paso('Ctrl+F abre el buscador general y encuentra por @persona', async () => {
      await pg.keyboard.down('Control'); await pg.keyboard.press('f'); await pg.keyboard.up('Control')
      await pg.waitForSelector('dialog[open] .buscador input', { timeout: 3000 })
      await pg.type('dialog[open] .buscador input', '@villarreal')
      await pg.waitForSelector('dialog[open] .resultado', { timeout: 3000 })
      await pg.screenshot({ path: path.join(SALIDA, 'buscador.png') })
    })
    await s.paso('elegir un resultado centra y resalta la tarjeta', async () => {
      await pg.click('dialog[open] .resultado'); await esperar(900)
      if (await pg.$('dialog[open]')) throw new Error('no cerró el buscador')
      if (!(await pg.$('g.tarjeta.notas rect.marca'))) throw new Error('no resaltó la tarjeta')
    })
    await s.paso('pestaña Etiquetas y personas cuenta cada una', async () => {
      await pg.click('button[aria-label="Buscar en todo"]')
      await clicTexto(pg, 'Etiquetas y personas')
      const txt = await pg.$eval('dialog[open] .buscador', d => d.textContent)
      if (!/#vial\s*2/.test(txt)) throw new Error('no cuenta #vial: ' + txt.slice(0, 200))
      await pg.keyboard.press('Escape')
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
  // Visor de fotos: grosor del trazo con el zoom, pellizco al dibujar con los dedos, falla al guardar el original.
  async trazos(b) {
    const s = suite('Visor de fotos: trazos y fallas'), pg = await pagina(b)
    await conEjemplo(pg)
    const abrirNueva = async p => {
      await (await p.$('input[type=file][accept="image/*"]')).uploadFile(IMG)
      await p.waitForSelector('dialog.visor-foto[open] .capa img', { timeout: 8000 }); await esperar(400)
    }
    // Píxeles rojos (tinta roja) dentro del área del visor.
    const rojos = async () => {
      const area = await pg.$('dialog.visor-foto .area')
      const png = await area.screenshot({ encoding: 'base64' })
      return pg.evaluate(async src => {
        const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode()
        const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height })
        const x = c.getContext('2d'); x.drawImage(img, 0, 0)
        const d = x.getImageData(0, 0, c.width, c.height).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 90) n++
        return n
      }, png)
    }
    await s.paso('el grosor del trazo crece con el zoom (como en la tarjeta)', async () => {
      await abrirNueva(pg)
      await pg.keyboard.press('d')
      const r = await (await pg.$('dialog.visor-foto .area')).boundingBox()
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2
      await pg.mouse.move(cx - 40, cy); await pg.mouse.down(); await pg.mouse.move(cx + 40, cy, { steps: 8 }); await pg.mouse.up()
      const a1 = await rojos()
      for (let i = 0; i < 4; i++) await pg.keyboard.press('+')
      await esperar(300)
      const a2 = await rojos()
      if (!(a2 > a1 * 4)) throw new Error(`el trazo no engrosó con el zoom (${a1} → ${a2} píxeles)`)
    })
    await s.paso('pellizcar con dos dedos en modo dibujar hace zoom y no deja trazos', async () => {
      await pg.keyboard.press('0'); await esperar(200)
      const trazos0 = await pg.$$eval('dialog.visor-foto .capa polyline', l => l.length)
      const porc = () => pg.$eval('dialog.visor-foto .barra-zoom .porc', e => parseInt(e.textContent))
      const k0 = await porc()
      const cdp = await pg.createCDPSession()
      const r = await (await pg.$('dialog.visor-foto .area')).boundingBox()
      const a = { x: r.x + r.width / 2 - 30, y: r.y + r.height / 2 }, c = { x: r.x + r.width / 2 + 30, y: r.y + r.height / 2 }
      const toque = (type, ps) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: ps.map((p, i) => ({ x: p.x, y: p.y, id: i })) })
      await toque('touchStart', [a]); await esperar(30)
      await toque('touchStart', [a, c]); await esperar(30)
      for (let i = 1; i <= 8; i++) { await toque('touchMove', [{ x: a.x - 12 * i, y: a.y }, { x: c.x + 12 * i, y: c.y }]); await esperar(20) }
      await toque('touchEnd', []); await esperar(300)
      await cdp.detach()
      const k1 = await porc(), trazos1 = await pg.$$eval('dialog.visor-foto .capa polyline', l => l.length)
      if (!(k1 > k0 * 1.3)) throw new Error(`no hizo zoom (${k0}% → ${k1}%)`)
      if (trazos1 !== trazos0) throw new Error(`dejó trazos sueltos (${trazos0} → ${trazos1})`)
      await pg.keyboard.press('Escape'); await esperar(300)
    })
    await s.paso('si no se puede guardar el original, la foto nueva igual se guarda', async () => {
      const p2 = await pagina(b)
      await p2.evaluateOnNewDocument(() => {
        const put = IDBObjectStore.prototype.put
        IDBObjectStore.prototype.put = function (v, k) {
          if (this.name === 'documentos' && String(k).startsWith('foto_')) throw new DOMException('lleno', 'QuotaExceededError')
          return put.call(this, v, k)
        }
      })
      await conEjemplo(p2)
      const antes = (await lienzoGuardado(p2)).fotos.length
      await abrirNueva(p2)
      await clicTexto(p2, 'Guardar'); await esperar(800)
      if (await p2.$('dialog.visor-foto[open]')) throw new Error('el visor quedó abierto')
      const despues = (await lienzoGuardado(p2)).fotos.length
      await p2.browserContext().close().catch(() => {})
      if (despues !== antes + 1) throw new Error(`no se guardó la foto (${antes} → ${despues})`)
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
  // Visor de fotos: abrir, hacer zoom con la rueda, dibujar un trazo y guardarlo; panel en celular.
  async fotos(b) {
    const s = suite('Visor de fotos'), pg = await pagina(b)
    await conEjemplo(pg)
    const escala = () => pg.$eval('.visor-foto .capa', e => new DOMMatrix(getComputedStyle(e).transform).a)
    await s.paso('insertar una foto la abre en el visor a pantalla completa', async () => {
      await (await pg.$('input[type=file][accept="image/*"]')).uploadFile(IMG)
      await pg.waitForSelector('dialog.visor-foto[open] .capa img', { timeout: 8000 })
      const r = await (await pg.$('dialog.visor-foto .area')).boundingBox()
      if (r.width < 900 || r.height < 800) throw new Error(`área chica: ${Math.round(r.width)}×${Math.round(r.height)}`)
    })
    await s.paso('la rueda del mouse hace zoom en el visor', async () => {
      await esperar(300)
      const k0 = await escala()
      const r = await (await pg.$('dialog.visor-foto .area')).boundingBox()
      for (let i = 0; i < 4; i++) {
        await pg.$eval('dialog.visor-foto .area', (el, p) => el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, wheelDeltaY: 120, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true })), { x: r.x + r.width / 2, y: r.y + r.height / 2 })
        await esperar(30)
      }
      const k1 = await escala()
      if (!(k1 > k0 * 1.5)) throw new Error(`no hizo zoom (${k0.toFixed(2)} → ${k1.toFixed(2)})`)
    })
    await s.paso('dibujar un trazo (tecla D) y guardarlo', async () => {
      await pg.keyboard.press('d')
      const r = await (await pg.$('dialog.visor-foto .area')).boundingBox()
      await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await pg.mouse.down()
      await pg.mouse.move(r.x + r.width / 2 + 80, r.y + r.height / 2 + 30, { steps: 8 }); await pg.mouse.up()
      await pg.type('dialog.visor-foto input.mano', 'revisar')
      await pg.screenshot({ path: path.join(SALIDA, 'visor-foto.png') })
      await clicTexto(pg, 'Guardar'); await esperar(600)
      const f = (await lienzoGuardado(pg)).fotos.at(-1)
      if (!f.trazos?.length || f.trazos[0].p.length < 3) throw new Error('no guardó el trazo')
      if (f.anotacion !== 'revisar') throw new Error('no guardó la anotación')
      if (await pg.$('dialog.visor-foto[open]')) throw new Error('no se cerró')
    })
    await s.paso('en pantalla de celular el panel es una hoja inferior', async () => {
      await pg.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true }); await esperar(500)
      await pg.click('.zoom .porc'); await esperar(500)
      await pg.evaluate(() => { const g = [...document.querySelectorAll('g.tarjeta.fotos')].at(-1); g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, button: 0, clientX: 1, clientY: 1 })); dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, button: 0, clientX: 1, clientY: 1 })) })
      await pg.waitForSelector('dialog.visor-foto[open] .ficha.hoja', { timeout: 5000 })
      await pg.screenshot({ path: path.join(SALIDA, 'visor-foto-movil.png') })
      await pg.keyboard.press('Escape'); await esperar(400)
      if (await pg.$('dialog.visor-foto[open]')) throw new Error('Escape no cerró el visor')
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
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
    await s.paso('pellizco del trackpad (gesto real) acerca el lienzo y nunca la página', async () => {
      const cdp = await pg.createCDPSession()
      const pellizco = (x, y, scaleFactor) => cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor, gestureSourceType: 'mouse' })
      const r = await (await pg.$('.lienzo')).boundingBox()
      const k0 = await zoom()
      await pellizco(r.x + r.width / 2, r.y + r.height / 2, 1.6); await esperar(400)
      const k1 = await zoom()
      if (!(k1 > k0)) throw new Error(`no acercó (${k0}% → ${k1}%)`)
      await pellizco(r.x + r.width / 2, r.y + r.height / 2, 0.6); await esperar(400)
      if (!(await zoom() < k1)) throw new Error('no alejó')
      // Fuera del lienzo (barra superior) no se agranda la página.
      await pellizco(r.x + r.width / 2, 8, 1.8); await esperar(400)
      const escala = await pg.evaluate(() => visualViewport.scale)
      if (escala !== 1) throw new Error(`se agrandó la página (×${escala})`)
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
    await pg.browserContext().close().catch(() => {})
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
      await pg.waitForSelector('dialog.visor-foto[open] .capa img', { timeout: 8000 })
      await pg.type('dialog.visor-foto input.mano', 'revisar')
      await pg.click('dialog.visor-foto button[aria-label="Tinta rojo"]')
      const r = await (await pg.$('dialog.visor-foto .capa')).boundingBox()
      await pg.mouse.move(r.x + r.width * .2, r.y + r.height * .3); await pg.mouse.down()
      await pg.mouse.move(r.x + r.width * .7, r.y + r.height * .4, { steps: 8 }); await pg.mouse.up()
      await clicTexto(pg, 'Guardar'); await esperar(600)
      const f = (await lienzoGuardado(pg)).fotos.at(-1)
      if (!(f.original || '').startsWith('fotos/' + f.id + '.')) throw new Error('la foto no guardó su original: ' + f.original)
    })
    await s.paso('agrandar una foto desde su esquina (se ve completa)', async () => {
      await esperar(600)
      await pg.click('button[aria-label="Encuadrar todo"]'); await esperar(500)
      const esq = await pg.$('g.tarjeta.fotos rect.esquina')
      if (!esq) throw new Error('sin esquina')
      const r = await esq.boundingBox()
      const encima = await pg.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e?.tagName + '.' + e?.getAttribute('class') + ' en ' + e?.closest('g.tarjeta')?.getAttribute('class') }, r.x + r.width / 2, r.y + r.height / 2)
      if (!encima.includes('esquina')) throw new Error('la esquina está tapada por ' + encima)
      await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await pg.mouse.down()
      await pg.mouse.move(r.x + r.width / 2 + 160, r.y + r.height / 2 + 100, { steps: 8 }); await pg.mouse.up(); await esperar(400)
      const f = (await lienzoGuardado(pg)).fotos.at(-1)
      if (!(f.ancho > 260)) throw new Error('no cambió el ancho: ' + f.ancho)
      if (await pg.$eval('g.tarjeta.fotos image', i => i.getAttribute('preserveAspectRatio')) !== 'xMidYMid meet') throw new Error('la imagen se recorta')
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
    await s.paso('Ctrl+F con el PDF abierto busca en el documento, no abre el buscador general', async () => {
      await pg.click('.pag-pdf canvas')
      await pg.keyboard.down('Control'); await pg.keyboard.press('f'); await pg.keyboard.up('Control'); await esperar(300)
      if (await pg.$('.buscador')) throw new Error('abrió el buscador general')
      if (await pg.evaluate(() => document.activeElement?.id) !== 'pdf-buscar') throw new Error('el foco no fue a la búsqueda del PDF')
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
      const n = (await lienzoGuardado(pg)).lecturas.fuente_003.notas.at(-1)
      if (!/pág\. 1$/.test(n.titulo) || !n.origen?.rects?.length) throw new Error(JSON.stringify(n.origen))
    })
    await s.paso('recortar un área → tarjeta de imagen con texto', async () => {
      await clicTexto(pg, 'Recortar')
      const c = await (await pg.$('.pag-pdf[data-n="0"]')).boundingBox()
      await pg.mouse.move(c.x + c.width * .08, c.y + c.height * .05); await pg.mouse.down()
      await pg.mouse.move(c.x + c.width * .9, c.y + c.height * .3, { steps: 6 }); await pg.mouse.up(); await esperar(1500)
      const f = (await lienzoGuardado(pg)).lecturas.fuente_003.fotos.at(-1)
      if (!f?.origen?.area || !/rework/i.test(f.texto)) throw new Error('recorte incompleto')
    })
    await s.paso('Esc cancela el recorte sin cerrar el visor', async () => {
      await clicTexto(pg, 'Recortar'); await pg.keyboard.press('Escape'); await esperar(300)
      if (!(await pg.$('.visor')) || await pg.$('.pdf.recortando')) throw new Error('estado incorrecto')
    })
    await pg.keyboard.press('Escape'); await esperar(400)
    await s.paso('Vínculo en la tarjeta vuelve a la cita y la marca', async () => {
      // Cerrado el visor, queda a la vista el lienzo de lectura de la fuente con sus citas.
      await pg.click('.lectura-panel button[aria-label="Encuadrar todo"]'); await esperar(500)
      await (await pg.$('.lectura-panel g.tarjeta.notas g.vinculo')).click()
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
      const v = await pg.$$('.lectura-panel g.tarjeta.notas g.vinculo'); await v.at(-1).click(); await esperar(2000)
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

  // Lienzo de lectura de cada fuente: las citas del PDF van a su propio tablero y la chincheta
  // las clava también en el lienzo general del proyecto.
  async lectura(b) {
    const s = suite('Lienzo de lectura por fuente'), pg = await pagina(b)
    await conEjemplo(pg)
    const lectura = async () => (await lienzoGuardado(pg)).lecturas?.fuente_003
    await s.paso('abrir el documento abre también el lienzo de lectura, al lado', async () => {
      await adjuntar(pg, 'fuente_003', PDF)
      await clicTexto(pg, 'Abrir')
      await pg.waitForSelector('.lectura-panel', { timeout: 10000 })
      if (!/\/l\/fuente_003$/.test(await pg.evaluate(() => location.hash))) throw new Error('ruta ' + await pg.evaluate(() => location.hash))
      const [l, v] = await Promise.all([pg.$eval('.lectura-panel', e => e.getBoundingClientRect()), pg.$eval('.visor', e => e.getBoundingClientRect())])
      if (l.right > v.left + 1) throw new Error(`el visor tapa la lectura (${l.right} > ${v.left})`)
    })
    await s.paso('la nota con la cita va a la lectura de la fuente, no al lienzo general', async () => {
      await pg.waitForFunction(() => document.querySelectorAll('.pag-pdf[data-n="0"] .capa-texto text').length > 5, { timeout: 30000 })
      const antes = (await lienzoGuardado(pg)).notas.length
      await pg.evaluate(() => { const t = [...document.querySelectorAll('.pag-pdf[data-n="0"] .capa-texto text')].find(x => x.textContent.length > 40); const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r) })
      await esperar(300); await clicTexto(pg, 'Nota con la cita'); await esperar(600)
      const cv = await lienzoGuardado(pg), l = cv.lecturas?.fuente_003
      if (l?.notas?.length !== 1 || cv.notas.length !== antes) throw new Error('no quedó en la lectura')
      if (!l.conexiones.some(k => k.desde === 'fuente_003' && k.hasta === l.notas[0].id)) throw new Error('sin hilo a la fuente')
      if (!(await pg.$('.lectura-panel g.tarjeta.notas'))) throw new Error('no se ve en el lienzo de lectura')
    })
    await pg.keyboard.press('Escape'); await esperar(400) // cierra el visor; la lectura sigue abierta
    await s.paso('la chincheta la clava en el lienzo general', async () => {
      if (!(await pg.$('.lectura-panel'))) throw new Error('Esc cerró también la lectura')
      await (await pg.$('.lectura-panel g.tarjeta g.clavar')).click(); await esperar(500)
      const n = (await lectura()).notas[0]
      if (!n.en_general || typeof n.en_general.x !== 'number') throw new Error('sin en_general')
      if ((await pg.$eval('.lectura-panel g.clavar', g => g.getAttribute('aria-checked'))) !== 'true') throw new Error('chincheta sin marcar')
    })
    await s.paso('en el general se ve con su procedencia y se mueve sin tocar su lugar en la lectura', async () => {
      await pg.keyboard.press('Escape'); await esperar(500)
      if (await pg.$('.lectura-panel')) throw new Error('no se cerró la lectura')
      await pg.click('button[aria-label="Encuadrar todo"]'); await esperar(500)
      const g = await pg.waitForSelector('g.tarjeta:has(g.procedencia)', { timeout: 5000 })
      const antes = (await lectura()).notas[0]
      const r = await g.boundingBox()
      await pg.mouse.move(r.x + r.width / 2, r.y + r.height * .7); await pg.mouse.down()
      await pg.mouse.move(r.x + r.width / 2 + 120, r.y + r.height * .7 + 60, { steps: 8 }); await pg.mouse.up(); await esperar(600)
      const despues = (await lectura()).notas[0]
      if (despues.en_general.x === antes.en_general.x) throw new Error('no se movió en el general')
      if (despues.x !== antes.x || despues.y !== antes.y) throw new Error('se movió también en la lectura')
      await pg.screenshot({ path: path.join(SALIDA, 'lectura-general.png') })
    })
    await s.paso('la procedencia abre el lienzo de lectura; quitar la chincheta la saca del general', async () => {
      await (await pg.$('g.tarjeta g.procedencia')).click()
      await pg.waitForSelector('.lectura-panel', { timeout: 5000 })
      await pg.screenshot({ path: path.join(SALIDA, 'lectura.png') })
      await (await pg.$('.lectura-panel g.tarjeta g.clavar')).click(); await esperar(500)
      if ((await lectura()).notas[0].en_general) throw new Error('sigue clavada')
      await pg.keyboard.press('Escape'); await esperar(500)
      if (await pg.$('g.tarjeta:has(g.procedencia)')) throw new Error('sigue en el general')
    })
    await s.paso('el buscador general encuentra la cita y lleva a su lectura', async () => {
      const texto = (await lectura()).notas[0].texto.replace(/[“”]/g, '').split(' ').slice(0, 3).join(' ')
      await pg.keyboard.down('Control'); await pg.keyboard.press('f'); await pg.keyboard.up('Control'); await esperar(300)
      await pg.type('.buscador input[type=search]', texto); await esperar(500)
      await (await pg.waitForSelector('::-p-xpath(//button[contains(@class, "resultado")][.//span[contains(., "Lectura de")]])', { timeout: 5000 })).click()
      await pg.waitForSelector('.lectura-panel', { timeout: 5000 })
    })
    await s.paso('una cita antigua del general pasa sola a su lectura, clavada; el contador de la fuente la abre', async () => {
      await pg.evaluate(() => new Promise(res => {
        const r = indexedDB.open('canvas-de-citas')
        r.onsuccess = () => {
          const st = r.result.transaction('proyectos', 'readwrite').objectStore('proyectos'), q = st.get('proyecto_001')
          q.onsuccess = () => {
            const p = q.result
            p.canvas.notas.push({ id: 'nota_antigua', titulo: 'Cita vieja', texto: '“texto citado”', x: 700, y: -300, origen: { fuente: 'fuente_005', tipo: 'html', cita: 'texto citado' } })
            p.canvas.conexiones.push({ id: 'con_vieja', desde: 'fuente_005', hasta: 'nota_antigua', etiqueta: 'cita' })
            st.put(p).onsuccess = res
          }
        }
      }))
      await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await pg.reload({ waitUntil: 'networkidle0' }); await esperar(1200)
      const cv = await lienzoGuardado(pg)
      if (cv.notas.some(n => n.id === 'nota_antigua')) throw new Error('sigue en el general')
      const n = cv.lecturas?.fuente_005?.notas?.find(x => x.id === 'nota_antigua')
      if (!n || n.en_general?.x !== 700 || n.en_general?.y !== -300) throw new Error('no pasó clavada a la lectura: ' + JSON.stringify(n))
      if (!cv.lecturas.fuente_005.conexiones.some(k => k.id === 'con_vieja') || cv.conexiones.some(k => k.id === 'con_vieja')) throw new Error('el hilo cita no pasó a la lectura')
      await pg.click('button[aria-label="Encuadrar todo"]'); await esperar(500)
      const contador = await pg.waitForSelector('g.nodo g.contador-lectura', { timeout: 5000 })
      await pg.screenshot({ path: path.join(SALIDA, 'lectura-contador.png') })
      const antes = pg.evaluate(() => location.hash)
      await contador.click(); await esperar(600)
      if (!/\/l\/fuente_0\d\d$/.test(await pg.evaluate(() => location.hash))) throw new Error('no abrió la lectura desde el contador (' + await antes + ')')
      if (await pg.$('dialog[open]')) throw new Error('abrió también la ficha de la fuente')
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
  // Documentos de las fuentes: clip en la tarjeta, arrastrar el archivo fuera/dentro y abrirlo en otra ventana.
  async documentos(b) {
    const s = suite('Documentos: clip, arrastrar y otra ventana'), pg = await pagina(b)
    await conEjemplo(pg)
    await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(900)
    const clipDe = autor => pg.$$eval('g.nodo', (gs, a) => { const g = gs.find(x => x.getAttribute('aria-label').startsWith(a)); return g ? !!g.querySelector('.clip') : null }, autor)
    await s.paso('la tarjeta del paper muestra el clip solo si tiene documento', async () => {
      const autor = await pg.evaluate(() => [...document.querySelectorAll('g.nodo')].map(g => g.getAttribute('aria-label'))[0])
      if (await clipDe('Priestley')) throw new Error('clip sin documento')
      await adjuntar(pg, 'fuente_003', PDF)
      await pg.keyboard.press('Escape'); await esperar(500)
      const nombre = await pg.evaluate(() => [...document.querySelectorAll('g.nodo')].filter(g => g.querySelector('.clip')).map(g => g.getAttribute('aria-label')))
      if (nombre.length !== 1) throw new Error('clips: ' + JSON.stringify(nombre) + ' (primera: ' + autor + ')')
      const g = await pg.$$eval('g.nodo', gs => { const r = gs.find(x => x.querySelector('.clip')).getBoundingClientRect(); return { x: r.x - 20, y: r.y - 20, width: r.width + 40, height: r.height + 40 } })
      await pg.screenshot({ path: path.join(SALIDA, 'documento-clip.png'), clip: g })
    })
    await s.paso('el documento de la ficha se arrastra como archivo (DownloadURL) a otra app', async () => {
      await pg.evaluate(() => (location.hash = '#/p/proyecto_001/f/fuente_003'))
      await pg.waitForSelector('dialog[open] .zona.con-doc[draggable="true"]', { timeout: 5000 })
      const r = await pg.$eval('dialog[open] .zona.con-doc', z => {
        const dt = new DataTransfer()
        z.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }))
        return { url: dt.getData('DownloadURL'), archivos: dt.files.length }
      })
      if (!/^application\/pdf:.+\.pdf:blob:/.test(r.url)) throw new Error('DownloadURL: ' + r.url)
      if (r.archivos !== 1) throw new Error('no lleva el archivo: ' + r.archivos)
    })
    await s.paso('soltar un archivo de otra app sobre la ficha lo adjunta', async () => {
      await pg.keyboard.press('Escape'); await esperar(300)
      await pg.evaluate(() => (location.hash = '#/p/proyecto_001/f/fuente_001'))
      await pg.waitForSelector('dialog[open] .zona', { timeout: 5000 })
      await pg.$eval('dialog[open] .zona', z => {
        const dt = new DataTransfer()
        dt.items.add(new File(['<html><body><p>Artículo de prueba</p></body></html>'], 'articulo.html', { type: 'text/html' }))
        z.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
      })
      await pg.waitForSelector('dialog[open] .zona.con-doc', { timeout: 5000 })
      const txt = await pg.$eval('dialog[open] .zona', z => z.textContent)
      if (!txt.includes('articulo.html')) throw new Error(txt)
      await pg.keyboard.press('Escape'); await esperar(500)
      if (!(await clipDe('Priestley')) && (await pg.$$eval('g.nodo .clip', x => x.length)) !== 2) throw new Error('no apareció el segundo clip')
    })
    await s.paso('"Abrir en otra ventana" muestra solo ese documento y su nota va al lienzo de lectura de la principal', async () => {
      await pg.evaluate(() => (location.hash = '#/p/proyecto_001/f/fuente_003'))
      await pg.waitForSelector('dialog[open] .zona.con-doc', { timeout: 5000 })
      await clicTexto(pg, 'Abrir'); await pg.waitForSelector('.visor', { timeout: 10000 }); await esperar(500)
      const antes = ((await lienzoGuardado(pg)).lecturas?.fuente_003?.notas || []).length
      await pg.click('button[aria-label="Abrir en otra ventana"]')
      const t = await b.waitForTarget(x => x.url().includes('#/doc/fuente_003/proyecto_001'), { timeout: 8000 })
      const doc = await t.page()
      await doc.waitForSelector('.visor.ventana', { timeout: 10000 })
      if (await doc.$('.cabecera')) throw new Error('la ventana muestra también la app')
      if (await doc.$('button[aria-label="Abrir en otra ventana"]')) throw new Error('repite el botón de otra ventana')
      await doc.waitForFunction(() => document.querySelectorAll('.pag-pdf[data-n="0"] .capa-texto text').length > 5, { timeout: 30000 })
      if (!/\.pdf · Canvas de Citas$/.test(await doc.title())) throw new Error('título: ' + await doc.title())
      await doc.evaluate(() => { const t = [...document.querySelectorAll('.pag-pdf[data-n="0"] .capa-texto text')].find(x => x.textContent.length > 40); const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r) })
      await esperar(300); await clicTexto(doc, 'Nota con la cita'); await esperar(1200)
      const notas = (await lienzoGuardado(pg)).lecturas.fuente_003.notas
      if (notas.length !== antes + 1 || !/pág\. 1$/.test(notas.at(-1).titulo)) throw new Error(`notas ${antes} → ${notas.length}`)
      const aviso = await doc.$eval('.aviso', a => a.textContent).catch(() => '')
      if (!aviso.includes('ventana principal')) throw new Error('aviso: ' + aviso)
      await doc.screenshot({ path: path.join(SALIDA, 'documento-ventana.png') })
      await doc.close()
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
  // Tablas: crearlas en el lienzo, pegarlas del portapapeles (Excel/Word/Markdown) y buscar en ellas.
  async tablas(b) {
    const s = suite('Tablas'), pg = await pagina(b)
    await conEjemplo(pg)
    await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(900)
    const pegarEnLienzo = (html, texto) => pg.evaluate((html, texto) => {
      const dt = new DataTransfer()
      if (html) dt.setData('text/html', html)
      dt.setData('text/plain', texto)
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, html, texto)
    const tablas = async () => (await lienzoGuardado(pg)).tablas || []
    await s.paso('crear una tabla desde la barra, escribir, agregar fila y guardar', async () => {
      await pg.click('button[aria-label="Añadir tabla"]')
      await pg.waitForSelector('dialog[open] .tabla-ed textarea', { timeout: 3000 })
      await pg.type('dialog[open] input[type=text]', 'Normas')
      const celdas = await pg.$$('dialog[open] .tabla-ed textarea')
      if (celdas.length !== 9) throw new Error('no empieza con 3×3: ' + celdas.length)
      await celdas[0].type('Norma'); await celdas[1].type('País')
      await celdas[3].type('E.030'); await celdas[4].type('Perú')
      await pg.$eval('dialog[open] button[aria-label="Agregar fila abajo"]', b => b.click()); await esperar(150)
      if ((await pg.$$('dialog[open] .tabla-ed tbody tr')).length !== 4) throw new Error('no agregó la fila')
      await clicTexto(pg, 'Guardar', '//dialog[@open]'); await esperar(600)
      const t = (await tablas()).at(-1)
      if (!t || t.titulo !== 'Normas') throw new Error('no se guardó: ' + JSON.stringify(t))
      // Al guardar se quitan las filas y columnas vacías del final.
      if (JSON.stringify(t.filas) !== JSON.stringify([['Norma', 'País'], ['E.030', 'Perú']]) || t.encabezado !== true) throw new Error('celdas: ' + JSON.stringify(t))
      const txt = await pg.$eval(`g.tarjeta.tablas`, g => g.textContent)
      if (!txt.includes('E.030') || !txt.includes('Normas')) throw new Error('no se dibuja: ' + txt)
    })
    await s.paso('editor: combinar arrastrando, pintar, insertar con los "+" de los bordes, Enter y Tab', async () => {
      await pg.click('button[aria-label="Añadir tabla"]')
      await pg.waitForSelector('dialog[open] .tabla-ed textarea', { timeout: 3000 })
      const celda = (f, c) => pg.$(`dialog[open] td[data-f="${f}"][data-c="${c}"]`)
      await (await celda(0, 0)).$eval('textarea', t => t.focus()); await pg.keyboard.type('Zona')
      // Enter baja a la celda de abajo.
      await pg.keyboard.press('Enter'); await pg.keyboard.type('Costa')
      // Arrastrar de (0,0) a (0,1) elige las dos; Combinar las une.
      const a = await (await celda(0, 0)).boundingBox(), b = await (await celda(0, 1)).boundingBox()
      await pg.mouse.move(a.x + 10, a.y + 10); await pg.mouse.down()
      await pg.mouse.move(b.x + 10, b.y + 10, { steps: 4 }); await pg.mouse.up()
      await clicTexto(pg, 'Combinar', '//dialog[@open]'); await esperar(150)
      const span = await pg.$eval('dialog[open] td[data-f="0"][data-c="0"]', td => td.colSpan)
      if (span !== 2) throw new Error('no combinó: colspan ' + span)
      // Pintar la celda de "Costa".
      await (await celda(1, 0)).$eval('textarea', t => t.focus())
      await pg.click('dialog[open] button[aria-label="Pintar de verde"]'); await esperar(100)
      // "+" del borde de arriba: columna antes de la primera.
      await pg.$eval('dialog[open] button[aria-label="Insertar columna antes de la 1"]', b => b.click()); await esperar(150)
      // Tab en la última celda agrega una fila.
      const ultima = await pg.$$eval('dialog[open] .tabla-ed tbody tr', trs => trs.length)
      await pg.$eval(`dialog[open] .tabla-ed tbody tr:last-child td:last-child textarea`, t => t.focus())
      await pg.keyboard.press('Tab'); await esperar(150)
      if (await pg.$$eval('dialog[open] .tabla-ed tbody tr', trs => trs.length) !== ultima + 1) throw new Error('Tab no agregó fila')
      await pg.screenshot({ path: path.join(SALIDA, 'tablas-editor-nuevo.png') })
      await clicTexto(pg, 'Guardar', '//dialog[@open]'); await esperar(600)
      const t = (await tablas()).at(-1)
      if (JSON.stringify(t.fusiones) !== JSON.stringify([{ fila: 0, col: 1, filas: 1, cols: 2 }])) throw new Error('fusiones: ' + JSON.stringify(t))
      if (t.colores?.['1,1'] !== 'verde') throw new Error('colores: ' + JSON.stringify(t.colores))
      if (t.filas[0][1] !== 'Zona' || t.filas[1][1] !== 'Costa' || t.filas[0][0] !== '') throw new Error('celdas: ' + JSON.stringify(t.filas))
    })
    await s.paso('los "+" solo están en el editor, y ahí la tabla no se aprieta: las columnas guardan su ancho', async () => {
      if (await pg.$('g.tarjeta.tablas .t-mas, g.tarjeta.tablas [aria-label="Agregar columna"]')) throw new Error('hay "+" en el lienzo')
      await pg.click('button[aria-label="Añadir tabla"]')
      await pg.waitForSelector('dialog[open] .tabla-ed textarea', { timeout: 3000 })
      const largo = 'Deriva máxima de entrepiso permitida para estructuras de concreto armado según la norma'
      for (let i = 0; i < 6; i++) await pg.$eval('dialog[open] button[aria-label="Agregar columna a la derecha"]', x => x.click())
      await pg.$eval('dialog[open] td[data-f="1"][data-c="0"] textarea', t => t.focus()); await pg.keyboard.type(largo)
      await esperar(200)
      const m = await pg.$eval('dialog[open] .tabla-ed', d => ({ visible: d.clientWidth, total: d.scrollWidth, col0: d.querySelector('td[data-f="1"][data-c="0"]').getBoundingClientRect().width, col1: d.querySelector('td[data-f="1"][data-c="1"]').getBoundingClientRect().width }))
      if (!(m.total > m.visible)) throw new Error('la tabla se apretó al espacio visible: ' + JSON.stringify(m))
      if (!(m.col0 > m.col1 * 1.5) || m.col1 < 115) throw new Error('anchos de columna: ' + JSON.stringify(m))
      await pg.screenshot({ path: path.join(SALIDA, 'tablas-editor-ancho.png') })
      await pg.keyboard.press('Escape'); await esperar(300)
    })
    await s.paso('pegar en el lienzo una tabla de Excel (HTML) crea una tarjeta de tabla', async () => {
      const antes = (await tablas()).length
      await pegarEnLienzo('<table><tr><th>Autor</th><th>Año</th></tr><tr><td>Priestley</td><td>2007</td></tr><tr><td>Chopra</td><td>2012</td></tr></table>', 'Autor\tAño\nPriestley\t2007\nChopra\t2012')
      await esperar(700)
      const l = await tablas()
      if (l.length !== antes + 1) throw new Error('no creó la tabla')
      if (l.at(-1).filas.length !== 3 || !l.at(-1).encabezado) throw new Error(JSON.stringify(l.at(-1)))
    })
    await s.paso('pegar una tabla en Markdown también; texto normal sigue siendo nota', async () => {
      const antes = (await tablas()).length, notas = (await lienzoGuardado(pg)).notas.length
      await pegarEnLienzo('', '| Deriva | Límite |\n|---|---|\n| Concreto | 0.007 |'); await esperar(600)
      await pegarEnLienzo('', 'Una idea suelta'); await esperar(600)
      const c = await lienzoGuardado(pg)
      if (c.tablas.length !== antes + 1 || c.tablas.at(-1).filas[1][1] !== '0.007') throw new Error('markdown: ' + JSON.stringify(c.tablas.at(-1)))
      if (c.notas.length !== notas + 1) throw new Error('el texto no se volvió nota')
    })
    await s.paso('pegar varias celdas dentro de una celda las reparte y agranda la tabla', async () => {
      await pg.click('.zoom .porc'); await esperar(500) // encuadra todo
      { const g = await (await pg.$$('g.tarjeta.tablas')).at(0).boundingBox(); await pg.screenshot({ path: path.join(SALIDA, 'tablas-lienzo.png') }) }
      const r = await (await pg.$$('g.tarjeta.tablas')).at(-1).boundingBox()
      await pg.mouse.click(r.x + r.width / 2, r.y + 6)
      const abierto = await pg.waitForSelector('dialog[open] .tabla-ed textarea', { timeout: 3000 }).catch(() => null)
      if (!abierto) throw new Error('no abrió el editor al tocar la tabla')
      await pg.evaluate(() => {
        const celdas = document.querySelectorAll('dialog[open] .tabla-ed textarea')
        const dt = new DataTransfer(); dt.setData('text/plain', 'a\tb\tc\nd\te\tf')
        celdas[3].dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      })
      await esperar(300)
      await pg.screenshot({ path: path.join(SALIDA, 'tablas-editor.png') })
      const filas = await pg.$$eval('dialog[open] .tabla-ed tbody tr', trs => trs.map(tr => [...tr.querySelectorAll('textarea')].map(t => t.value)))
      if (JSON.stringify(filas) !== JSON.stringify([['Deriva', 'Límite', '', ''], ['Concreto', 'a', 'b', 'c'], ['', 'd', 'e', 'f']]))
        throw new Error('celdas: ' + JSON.stringify(filas))
      await pg.keyboard.press('Escape'); await esperar(300)
    })
    await s.paso('el buscador general encuentra el texto de una celda', async () => {
      await pg.click('button[aria-label="Buscar en todo"]')
      await pg.waitForSelector('dialog[open] .buscador input', { timeout: 3000 })
      await pg.type('dialog[open] .buscador input', 'Priestley 2007')
      await pg.waitForSelector('dialog[open] .resultado', { timeout: 3000 })
      const txt = await pg.$eval('dialog[open] .buscador', d => d.textContent)
      if (!txt.includes('Tablas')) throw new Error('no aparece en Tablas: ' + txt.slice(0, 300))
      await pg.click('dialog[open] button[aria-label="Cerrar"]').catch(() => pg.keyboard.press('Escape')); await esperar(300)
      if (await pg.$('dialog[open]')) await pg.keyboard.press('Escape')
      await pg.screenshot({ path: path.join(SALIDA, 'tablas.png') })
    })
    await s.paso('también en el lienzo de lectura y en el de un objetivo', async () => {
      await pg.evaluate(() => (location.hash = '#/p/proyecto_001/o/oe1')); await esperar(900)
      await pg.screenshot({ path: path.join(SALIDA, 'tablas-objetivo.png') })
      await pegarEnLienzo('', 'x\ty\n1\t2'); await esperar(600)
      const c = await lienzoGuardado(pg)
      if (!c.objetivos?.oe1?.tablas?.length) throw new Error('no se pegó en el objetivo')
      if (!(await pg.$('button[aria-label="Añadir tabla"]'))) throw new Error('falta el botón en el objetivo')
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
  // Celular (Android simulado): en ninguna vista la barra superior tapa o corta sus botones.
  async cabecera(b) {
    const s = suite('Barra superior en el celular'), pg = await pagina(b)
    await pg.evaluateOnNewDocument(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', nativePromise: async () => ({}) } })
    await conEjemplo(pg)
    const vistas = ['#/', '#/citas', '#/p/proyecto_001']
    for (const ancho of [320, 360, 387, 412]) {
      await pg.setViewport({ width: ancho, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
      for (const v of vistas) {
        await s.paso(`${ancho} px, ${v}: todos los botones de arriba se ven completos`, async () => {
          await pg.evaluate(h => (location.hash = h), v); await esperar(700)
          const malos = await pg.$$eval('header.cabecera :is(button, a, input)', (els, W) => Array.from(els).flatMap(e => {
            const r = e.getBoundingClientRect(), st = getComputedStyle(e)
            if (!r.width || st.display === 'none' || st.visibility === 'hidden') return []
            const tapado = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            const ok = r.left >= -0.5 && r.right <= W + 0.5 && (e.tagName === 'INPUT' ? r.width >= 40 : r.width >= 24) && (tapado === e || e.contains(tapado))
            return ok ? [] : [`${e.getAttribute("aria-label") || e.textContent.trim() || e.tagName} (${Math.round(r.left)}–${Math.round(r.right)}${tapado && tapado !== e && !e.contains(tapado) ? ", tapado por " + tapado.tagName + "." + tapado.className : ""})`]
          }), ancho)
          if (malos.length) throw new Error('cortados o tapados: ' + malos.join(', '))
          if (ancho === 360) await pg.screenshot({ path: path.join(SALIDA, `cabecera-360-${vistas.indexOf(v)}.png`), clip: { x: 0, y: 0, width: 360, height: 120 } })
        })
      }
    }
    if (pg.errores.length) s.fallas.push(...pg.errores)
    await pg.browserContext().close().catch(() => {})
    return s
  },
  // Tras publicar, una versión vieja abierta que no encuentra una parte (p. ej. el visor PDF) pasa sola a la nueva.
  async version(b) {
    const s = suite('Versión nueva tras publicar'), pg = await pagina(b)
    await pg.goto(URL_APP, { waitUntil: 'networkidle0' }); await esperar(800)
    const fallo = () => pg.evaluate(() => { const e = new Event('vite:preloadError', { cancelable: true }); dispatchEvent(e); return e.defaultPrevented })
    await s.paso('si falta una parte cargada bajo demanda, recarga la app', async () => {
      const nav = pg.waitForNavigation({ timeout: 8000 })
      if (!(await fallo())) throw new Error('no atendió el error')
      await nav
    })
    await s.paso('no recarga en bucle si vuelve a fallar enseguida', async () => {
      await esperar(800)
      if (await fallo()) throw new Error('volvió a recargar')
    })
    await pg.browserContext().close().catch(() => {})
    return s
  },
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
      await s.paso('lienzo de lectura con una tarjeta clavada: igual en la PC, el celular y la laptop', async () => {
        await cel.keyboard.press('Escape').catch(() => {}); await esperar(300)
        // La lectura se crea en la PC (como la app de Windows); llega a los dos aparatos.
        const d = JSON.parse(enPc())
        d.proyectos[0].canvas.lecturas = { fuente_001: { notas: [{ id: 'nota_lectura', texto: 'Cita del paper', x: 280, y: -100, en_general: { x: 600, y: 200 } }], listas: [], audios: [], fotos: [], conexiones: [], agrupadores: [] } }
        fs.writeFileSync(path.join(carpeta, 'proyectos.json'), JSON.stringify(d, null, 2) + '\n'); await esperar(1500)
        await sincronizarEn(cel); await sincronizarEn(lap)
        const clavada = async pg => {
          await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(600)
          await pg.click('button[aria-label="Encuadrar todo"]'); await esperar(500)
          return pg.waitForSelector('g.tarjeta:has(g.procedencia)', { timeout: 5000 })
        }
        await clavada(lap)
        // El celular la mueve en el general: el cambio viaja a la PC y a la laptop.
        const r = await (await clavada(cel)).boundingBox()
        await cel.mouse.move(r.x + r.width / 2, r.y + r.height * .6); await cel.mouse.down()
        await cel.mouse.move(r.x + r.width / 2 + 100, r.y + r.height * .6 + 40, { steps: 6 }); await cel.mouse.up(); await esperar(500)
        await sincronizarEn(cel); await sincronizarEn(lap)
        const enPcAhora = JSON.parse(enPc()).proyectos[0].canvas.lecturas.fuente_001.notas[0]
        if (enPcAhora.en_general.x === 600) throw new Error('el movimiento no llegó a la PC')
        if (enPcAhora.x !== 280) throw new Error('cambió su lugar en la lectura')
        const enLap = await lap.evaluate(() => new Promise(res => { const r = indexedDB.open('canvas-de-citas'); r.onsuccess = () => { const q = r.result.transaction('proyectos').objectStore('proyectos').get('proyecto_001'); q.onsuccess = () => res(q.result.canvas.lecturas?.fuente_001?.notas?.[0]) } }))
        if (JSON.stringify(enLap?.en_general) !== JSON.stringify(enPcAhora.en_general)) throw new Error(`laptop ${JSON.stringify(enLap?.en_general)} ≠ PC ${JSON.stringify(enPcAhora.en_general)}`)
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
            await new Promise(r => setTimeout(r, window.__demoraVoz || 0)) // el reconocedor real tarda
            return { texto: '  hola   desde Android ', idioma: 'es-US' }
          }
          throw new Error(`plugin no simulado: ${plugin}.${metodo}`)
        }
      }
      window.SpeechRecognition = window.webkitSpeechRecognition = function () { (window.__reconocedorWeb ||= []).push('creado'); this.start = () => window.__reconocedorWeb.push('start'); this.stop = () => {}; this.abort = () => {} }
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
        if (await pg.evaluate(() => window.__reconocedorWeb?.length)) throw new Error('usó el reconocimiento de voz del WebView (no funciona en Android y ocupa el micrófono)')
        await clicTexto(pg, 'Guardar'); await esperar(300)
      })
      await s.paso('nota de voz: si se guarda antes de que termine la transcripción, igual queda guardada', async () => {
        await pg.evaluate(() => { window.__demoraVoz = 2500 })
        await pg.click('button[aria-label="Grabar nota de voz"]')
        await pg.click('dialog[open] button[aria-label="Empezar a grabar"]')
        await pg.waitForSelector('dialog[open] button[aria-label="Detener grabación"]', { timeout: 10000 }); await esperar(1200)
        await pg.click('dialog[open] button[aria-label="Detener grabación"]'); await esperar(600)
        await clicTexto(pg, 'Guardar'); await esperar(3500)
        const audios = await pg.evaluate(() => new Promise(res => { const r = indexedDB.open('canvas-de-citas'); r.onsuccess = () => { const q = r.result.transaction('proyectos').objectStore('proyectos').get('proyecto_001'); q.onsuccess = () => res(q.result.canvas.audios.map(a => a.transcripcion)) } }))
        if (audios.filter(x => x === 'hola desde Android').length < 2) throw new Error('la transcripción que llegó después de guardar se perdió: ' + JSON.stringify(audios))
        await pg.evaluate(() => { window.__demoraVoz = 0 })
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
        await pg.click('button[aria-label="Filtros"]'); await esperar(400) // en celular, exportar va en el panel de filtros
        await clicTexto(pg, 'Exportar .bib', '//aside[contains(@class, "filtros")]'); await esperar(400)
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
        // (sin esperar 'red inactiva': la sincronización automática deja descargas abiertas un rato)
        await pg.reload({ waitUntil: 'load' })
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
