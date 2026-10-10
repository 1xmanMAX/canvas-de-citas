// Capturas del README (docs/capturas/*.png y el GIF del flujo de lectura) con los datos de ejemplo de
// la app: nunca datos reales. Uso (con build y Chrome, como las pruebas e2e):
//   node scripts/capturas-readme.mjs          (el GIF necesita ffmpeg; si no está, se omite)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { APP, FIXTURES, URL_APP, servidor, navegador, pagina, esperar, clicTexto, conEjemplo, adjuntar } from '../tests/e2e/comun.mjs'

const DESTINO = path.resolve(APP, '../docs/capturas')
fs.mkdirSync(DESTINO, { recursive: true })
const foto = (pg, nombre, clip) => pg.screenshot({ path: path.join(DESTINO, nombre + '.png'), ...(clip ? { clip } : {}) })
const sinAviso = pg => pg.waitForFunction(() => !document.querySelector('.aviso'), { timeout: 8000 }).catch(() => {})
async function reescribir(pg, sel, texto) {
  await pg.click(sel); await pg.$eval(sel, i => i.select()); await pg.keyboard.type(texto); await pg.keyboard.press('Tab')
}
/** Elige una letra en el selector del editor abierto. */
async function letra(pg, nombre) {
  await pg.click('dialog[open] .actual'); await esperar(200)
  await pg.$$eval('dialog[open] .letras button', (bs, n) => bs.find(x => x.textContent.trim().startsWith(n)).click(), nombre); await esperar(200)
}
/** Selecciona en el PDF un renglón largo de la página 1 (como si se arrastrara el mouse). */
const seleccionarEnPdf = (pg, n = 0) => pg.evaluate(n => {
  const t = [...document.querySelectorAll('.pag-pdf[data-n="0"] .capa-texto text')].filter(x => x.textContent.length > 40)[n]
  const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r)
}, n)

// Cuadros del GIF: se guardan aparte y ffmpeg los une.
const cuadros = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-gif-'))
let nCuadro = 0
const cuadro = async (pg, segundos = 1.6) => { await pg.screenshot({ path: path.join(cuadros, `c${String(nCuadro).padStart(2, '0')}.png`) }); fs.writeFileSync(path.join(cuadros, `c${String(nCuadro++).padStart(2, '0')}.txt`), String(segundos)) }

const cerrar = await servidor()
const b = await navegador({ defaultViewport: { width: 1360, height: 820, deviceScaleFactor: 1.5 } })
try {
  const pg = await pagina(b)
  await conEjemplo(pg)

  // 1. Proyectos.
  await pg.evaluate(() => (location.hash = '#/')); await esperar(800)
  await foto(pg, 'proyectos')
  await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(1000)

  // 2. Editor de nota: formato dentro del texto, letra, color y etiquetas.
  await pg.click('button[aria-label="Añadir nota"]')
  await pg.type('dialog[open] input[placeholder^="Extended"]', 'Idea clave')
  await pg.type('dialog[open] textarea', 'Comparar la **deriva de entrepiso** de ASCE 7 con la ==norma E.030==. Preguntar a @Asesor #sismo')
  await clicTexto(pg, 'Ficha rayada')
  await letra(pg, 'Manuscrita')
  await pg.click('dialog[open] .actual'); await esperar(300) // selector abierto para la captura
  const caja = await (await pg.$('dialog[open]')).boundingBox()
  await foto(pg, 'nota-formato', { x: caja.x - 8, y: caja.y - 8, width: caja.width + 16, height: Math.min(caja.height + 16, 820 - caja.y + 8) })
  await pg.click('dialog[open] .actual'); await esperar(200)
  await clicTexto(pg, 'Guardar'); await esperar(300)

  // Lista, tabla y agrupador.
  await pg.click('button[aria-label="Añadir lista de tareas"]')
  await pg.type('dialog[open] input[placeholder^="Pendientes"]', 'Pendientes')
  for (const t of ['Revisar capítulo 2', 'Pedir norma al asesor', 'Leer Priestley']) { await pg.type('dialog[open] input[placeholder^="Nueva tarea"]', t); await pg.keyboard.press('Enter') }
  await clicTexto(pg, 'Guardar'); await esperar(300)
  await pg.click('button[aria-label="Añadir tabla"]')
  await pg.waitForSelector('dialog[open] .tabla-ed textarea', { timeout: 3000 })
  await pg.type('dialog[open] input[type=text]', 'Normas sísmicas')
  const celdas = await pg.$$('dialog[open] .tabla-ed textarea')
  const valores = ['Norma', 'País', 'Año', 'E.030', 'Perú', '2018', 'ASCE 7', 'EE. UU.', '2022']
  for (let i = 0; i < 9; i++) await celdas[i].type(valores[i])
  await (await pg.$('dialog[open] td[data-f="1"][data-c="0"] textarea')).focus()
  await pg.click('dialog[open] button[aria-label="Pintar de verde"]').catch(() => {}); await esperar(150)
  await foto(pg, 'tabla', await (async () => { const c = await (await pg.$('dialog[open]')).boundingBox(); return { x: c.x - 8, y: c.y - 8, width: c.width + 16, height: c.height + 16 } })())
  await clicTexto(pg, 'Guardar', '//dialog[@open]'); await esperar(400)
  await pg.click('button[aria-label="Agrupar elementos"]')
  await pg.type('dialog[open] input[placeholder^="Marco"]', 'Marco teórico')
  const casillas = await pg.$$('dialog[open] .lista input[type=checkbox]')
  for (const i of [0, 1, 2]) await casillas[i].click()
  await clicTexto(pg, 'Crear agrupador'); await esperar(600)
  await pg.click('.zoom .porc'); await esperar(700); await sinAviso(pg)
  await foto(pg, 'lienzo')

  // 3. Ficha de una fuente con sus citas.
  await pg.evaluate(() => (location.hash = '#/p/proyecto_001/f/fuente_001')); await esperar(900)
  await foto(pg, 'fuente')
  await pg.keyboard.press('Escape'); await esperar(400)

  // 4. Flujo de lectura (capturas + GIF): ficha → documento con su lienzo de lectura → nota con la
  //    cita → chincheta → aparece en el lienzo general.
  await cuadro(pg, 1.8)
  await adjuntar(pg, 'fuente_003', path.join(FIXTURES, 'paper.pdf')); await sinAviso(pg)
  await cuadro(pg, 1.8)
  await clicTexto(pg, 'Abrir')
  await pg.waitForSelector('.lectura-panel', { timeout: 10000 })
  await pg.waitForFunction(() => [...document.querySelectorAll('.pag-pdf canvas')].some(c => c.width > 0), { timeout: 30000 }); await esperar(1200)
  await cuadro(pg, 1.8)
  await pg.waitForFunction(() => document.querySelectorAll('.pag-pdf[data-n="0"] .capa-texto text').length > 5, { timeout: 30000 })
  await seleccionarEnPdf(pg, 1); await esperar(400)
  await cuadro(pg, 1.8)
  await clicTexto(pg, 'Nota con la cita'); await esperar(900)
  await seleccionarEnPdf(pg, 4); await esperar(300)
  await clicTexto(pg, 'Nota con la cita'); await esperar(900); await sinAviso(pg)
  await pg.evaluate(() => getSelection().removeAllRanges())
  await pg.click('.lectura-panel .zoom .porc'); await esperar(700)
  await cuadro(pg, 2.2)
  await foto(pg, 'lectura')
  await (await pg.$('.lectura-panel g.tarjeta g.clavar')).click(); await esperar(600); await sinAviso(pg)
  await cuadro(pg, 1.6)
  // Búsqueda en el PDF.
  await pg.type('#pdf-buscar', 'rework'); await pg.keyboard.press('Enter')
  await pg.waitForFunction(() => /\d+\/\d+/.test(document.querySelector('.cuenta')?.textContent || ''), { timeout: 15000 }); await esperar(800)
  await foto(pg, 'visor')
  await pg.keyboard.press('Escape'); await esperar(300) // cierra el visor; queda la lectura
  await clicTexto(pg, 'Lienzo general'); await esperar(900)
  await pg.click('.zoom .porc'); await esperar(800); await sinAviso(pg)
  await cuadro(pg, 2.6)
  await foto(pg, 'general-clavada')

  // 5. Buscador general (Ctrl+F): palabras, #temas y @personas en todo el proyecto.
  await pg.keyboard.down('Control'); await pg.keyboard.press('f'); await pg.keyboard.up('Control'); await esperar(300)
  await pg.keyboard.type('deriva'); await esperar(700)
  await foto(pg, 'buscador')
  await pg.keyboard.press('Escape'); await esperar(300)

  // 6. Biblioteca (todas las fuentes y citas, con filtros).
  await pg.evaluate(() => (location.hash = '#/citas')); await esperar(1200)
  await foto(pg, 'biblioteca')

  // 7. Sincronizar con la PC (contra el servidor de sincronización real, carpeta temporal) y el celular.
  const crate = path.resolve(APP, '../receptor/sincro')
  if (spawnSync('cargo', ['build', '--release', '--quiet'], { cwd: crate, stdio: 'inherit' }).status === 0) {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-capturas-'))
    const srv = spawn(path.join(crate, 'target', 'release', 'canvas-sincro'), ['--carpeta', carpeta, '--puerto', '0'])
    const info = JSON.parse(await new Promise(res => srv.stdout.once('data', d => res(String(d).split('\n')[0]))))
    try {
      const cel = await pagina(b)
      await cel.evaluateOnNewDocument(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', nativePromise: async () => ({}) } })
      await cel.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true })
      await cel.goto(URL_APP, { waitUntil: 'networkidle0' }); await esperar(500)
      await cel.click('button[aria-label="Sincronizar con la PC"]'); await esperar(400)
      await cel.type('dialog[open] input[placeholder^="canvas-sync"]', `canvas-sync://127.0.0.1:${info.puerto}/#${info.clave}`)
      await reescribir(cel, 'dialog[open] .sincro input[maxlength="60"]', 'Celular de Max')
      await clicTexto(cel, 'Sincronizar', '//dialog[@open]//div[contains(@class,"fila")]')
      await cel.waitForFunction(() => /Última:/.test(document.querySelector('.sincro .estado')?.textContent || ''), { timeout: 15000 })
      await cel.keyboard.press('Escape'); await esperar(300)

      await pg.evaluate(() => (location.hash = '#/')); await esperar(800)
      await pg.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Configuración' && x.offsetParent).click())
      await pg.waitForSelector('dialog[open] input[placeholder^="canvas-sync"]', { timeout: 8000 }).catch(async () => console.log('DIALOGO:', await pg.evaluate(() => [...document.querySelectorAll('dialog')].map(d => d.open + ' ' + d.innerText.slice(0, 120)).join(' || '))))
      await pg.type('dialog[open] input[placeholder^="canvas-sync"]', `canvas-sync://127.0.0.1:${info.puerto}/#${info.clave}`)
      await reescribir(pg, 'dialog[open] .sincro input[maxlength="60"]', 'Laptop')
      await clicTexto(pg, 'Sincronizar', '//dialog[@open]//div[contains(@class,"fila")]')
      await pg.waitForFunction(() => document.querySelector('dialog[open] .grupo'), { timeout: 15000 }); await esperar(400); await sinAviso(pg)
      await pg.evaluate(() => { const i = document.querySelector('dialog[open] input[placeholder^="canvas-sync"]'); i.value = 'canvas-sync://192.168.1.10:47481/#…' })
      await pg.evaluate(() => document.querySelector('dialog[open] .sincro').scrollIntoView()); await esperar(300)
      const dlg = await (await pg.$('dialog[open]')).boundingBox()
      await foto(pg, 'sincronizar', { x: dlg.x, y: Math.max(0, dlg.y), width: dlg.width, height: Math.min(dlg.height, 820 - Math.max(0, dlg.y)) })
      await pg.keyboard.press('Escape'); await esperar(300)

      await cel.click('button[aria-label="Sincronizar con la PC"]'); await esperar(300)
      await cel.waitForFunction(() => !document.querySelector('.sincro-btn.girando'), { timeout: 15000 }); await esperar(800)
      await cel.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(1200)
      await cel.click('.zoom .porc'); await esperar(500)
      for (let i = 0; i < 4; i++) { await cel.click('button[aria-label="Acercar"]'); await esperar(150) }
      await esperar(500); await sinAviso(cel)
      await foto(cel, 'celular')
    } finally { srv.kill() }
  }

  // GIF del flujo de lectura (ffmpeg: concat con la duración de cada cuadro y paleta propia).
  const lista = fs.readdirSync(cuadros).filter(f => f.endsWith('.png')).sort()
  const concat = lista.map(f => `file '${path.join(cuadros, f).split(path.sep).join('/')}'\nduration ${fs.readFileSync(path.join(cuadros, f.replace('.png', '.txt')), 'utf8')}`).join('\n') + `\nfile '${path.join(cuadros, lista.at(-1)).split(path.sep).join('/')}'\n`
  fs.writeFileSync(path.join(cuadros, 'lista.txt'), concat)
  const gif = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(cuadros, 'lista.txt'),
    '-vf', 'fps=8,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', path.join(DESTINO, 'flujo-lectura.gif')], { stdio: 'inherit' })
  if (gif.status !== 0) console.log('Sin ffmpeg: no se generó el GIF')
  console.log('Capturas en', DESTINO, fs.readdirSync(DESTINO))
} finally {
  await b.close()
  cerrar()
  fs.rmSync(cuadros, { recursive: true, force: true })
}
