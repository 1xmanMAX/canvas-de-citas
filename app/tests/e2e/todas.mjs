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
