// Capturas del README (docs/capturas/*.png) con los datos de ejemplo de la app: nunca datos
// reales. Uso (con build y Chrome, como las pruebas e2e): node scripts/capturas-readme.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { APP, FIXTURES, URL_APP, servidor, navegador, pagina, esperar, clicTexto, conEjemplo, adjuntar } from '../tests/e2e/comun.mjs'

const DESTINO = path.resolve(APP, '../docs/capturas')
fs.mkdirSync(DESTINO, { recursive: true })
const foto = (pg, nombre) => pg.screenshot({ path: path.join(DESTINO, nombre + '.png') })
/** Reemplaza el texto de un campo (seleccionar todo y escribir encima). */
async function reescribir(pg, sel, texto) {
  await pg.click(sel)
  await pg.$eval(sel, i => i.select())
  await pg.keyboard.type(texto)
  await pg.keyboard.press('Tab')
}
const sinAviso = pg => pg.waitForFunction(() => !document.querySelector('.aviso'), { timeout: 8000 }).catch(() => {})

const cerrar = await servidor()
const b = await navegador({ defaultViewport: { width: 1360, height: 820 } })
try {
  const pg = await pagina(b)
  await conEjemplo(pg)

  // 1. Lienzo del proyecto con una nota, una lista y un agrupador.
  await pg.click('button[aria-label="Añadir nota"]')
  await pg.type('dialog[open] input[placeholder^="Extended"]', 'Idea clave')
  await pg.type('dialog[open] textarea', 'Comparar la deriva de entrepiso de ASCE y la norma E.030.')
  await clicTexto(pg, 'Ficha rayada'); await clicTexto(pg, 'Manuscrita'); await clicTexto(pg, 'Guardar'); await esperar(300)
  await pg.click('button[aria-label="Añadir lista de tareas"]')
  await pg.type('dialog[open] input[placeholder^="Pendientes"]', 'Pendientes')
  for (const t of ['Revisar capítulo 2', 'Pedir norma al asesor']) { await pg.type('dialog[open] input[placeholder^="Nueva tarea"]', t); await pg.keyboard.press('Enter') }
  await clicTexto(pg, 'Guardar'); await esperar(300)
  await pg.click('button[aria-label="Agrupar elementos"]')
  await pg.type('dialog[open] input[placeholder^="Marco"]', 'Marco teórico')
  const casillas = await pg.$$('dialog[open] .lista input[type=checkbox]')
  for (const i of [0, 1, 2]) await casillas[i].click()
  await clicTexto(pg, 'Crear agrupador'); await esperar(600)
  await pg.click('.zoom .porc'); await esperar(600); await sinAviso(pg)
  await foto(pg, 'lienzo')

  // 2. Ficha de una fuente con sus citas.
  await pg.evaluate(() => (location.hash = '#/p/proyecto_001/f/fuente_001')); await esperar(900)
  await foto(pg, 'fuente')
  await pg.keyboard.press('Escape'); await esperar(400)

  // 3. Visor de PDF propio (búsqueda, recortes, citas con vínculo).
  await adjuntar(pg, 'fuente_003', path.join(FIXTURES, 'paper.pdf'))
  await clicTexto(pg, 'Abrir')
  await pg.waitForFunction(() => [...document.querySelectorAll('.pag-pdf canvas')].some(c => c.width > 0), { timeout: 30000 }); await esperar(1200); await sinAviso(pg)
  await foto(pg, 'visor')
  await pg.keyboard.press('Escape'); await esperar(300)
  await pg.evaluate(() => document.querySelector('.visor button[aria-label="Cerrar"]')?.click()); await esperar(300)

  // 4. Biblioteca (todas las citas con filtros).
  await pg.evaluate(() => (location.hash = '#/citas')); await esperar(1200)
  await foto(pg, 'biblioteca')

  // 5. Proyectos.
  await pg.evaluate(() => (location.hash = '#/')); await esperar(800)
  await foto(pg, 'proyectos')

  // 6. Sincronizar con la PC (contra el servidor de sincronización real, carpeta temporal).
  const crate = path.resolve(APP, '../receptor/sincro')
  if (spawnSync('cargo', ['build', '--release', '--quiet'], { cwd: crate, stdio: 'inherit' }).status === 0) {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-capturas-'))
    const srv = spawn(path.join(crate, 'target', 'release', 'canvas-sincro'), ['--carpeta', carpeta, '--puerto', '0'])
    const info = JSON.parse(await new Promise(res => srv.stdout.once('data', d => res(String(d).split('\n')[0]))))
    try {
      // Otro aparato del grupo (el "celular") sincroniza primero.
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

      await clicTexto(pg, 'Configuración')
      await pg.type('dialog[open] input[placeholder^="canvas-sync"]', `canvas-sync://127.0.0.1:${info.puerto}/#${info.clave}`)
      await reescribir(pg, 'dialog[open] .sincro input[maxlength="60"]', 'Laptop')
      await clicTexto(pg, 'Sincronizar', '//dialog[@open]//div[contains(@class,"fila")]')
      await pg.waitForFunction(() => document.querySelector('dialog[open] .grupo'), { timeout: 15000 }); await esperar(400); await sinAviso(pg)
      // Se muestra un código de ejemplo (no el de la prueba).
      await pg.evaluate(() => { const i = document.querySelector('dialog[open] input[placeholder^="canvas-sync"]'); i.value = 'canvas-sync://192.168.1.10:47481/#…' })
      await pg.evaluate(() => document.querySelector('dialog[open] .sincro').scrollIntoView())
      await esperar(300)
      await foto(pg, 'sincronizar')
      await pg.keyboard.press('Escape'); await esperar(300)

      // 7. La app en el celular (Android): se pone al día con lo de la laptop y se ve el lienzo.
      await cel.click('button[aria-label="Sincronizar con la PC"]'); await esperar(300)
      await cel.waitForFunction(() => !document.querySelector('.sincro-btn.girando'), { timeout: 15000 }); await esperar(800)
      await cel.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(1200)
      await cel.click('.zoom .porc'); await esperar(500)
      for (let i = 0; i < 4; i++) { await cel.click('button[aria-label="Acercar"]'); await esperar(150) }
      await esperar(500); await sinAviso(cel)
      await foto(cel, 'celular')
    } finally { srv.kill() }
  }
  console.log('Capturas en', DESTINO, fs.readdirSync(DESTINO))
} finally {
  await b.close()
  cerrar()
}
