// Utilidades de las pruebas de navegador: localizar Chrome/Chromium, levantar `vite preview`
// con la app compilada y pequeños ayudantes. Requiere `npm run build` antes.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

export const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const FIXTURES = path.join(APP, 'tests', 'fixtures')
export const SALIDA = path.join(APP, 'tests', 'e2e', 'capturas')
export const PUERTO = +(process.env.PUERTO_PRUEBAS || 4199)
export const URL_APP = `http://localhost:${PUERTO}/`

const CANDIDATOS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Perplexity/Comet/Application/comet.exe`,
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
]
export function chrome() {
  const c = CANDIDATOS.find(p => p && fs.existsSync(p))
  if (!c) throw new Error('No encontré Chrome/Chromium: define CHROME_PATH (ver CLAUDE.md, "Pruebas").')
  return c
}

/** Levanta `vite preview` (si no hay ya un servidor en el puerto) y devuelve una función para cerrarlo. */
export async function servidor() {
  const vivo = async () => { try { return (await fetch(URL_APP)).ok } catch { return false } }
  if (await vivo()) return () => {}
  if (!fs.existsSync(path.join(APP, 'dist', 'index.html'))) throw new Error('Falta dist/: ejecuta npm run build')
  const vite = path.join(APP, 'node_modules', 'vite', 'bin', 'vite.js')
  const p = spawn(process.execPath, [vite, 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: APP, stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await vivo()); i++) await esperar(250)
  if (!(await vivo())) { p.kill(); throw new Error('vite preview no respondió') }
  return () => p.kill()
}

export async function navegador(opciones = {}) {
  return puppeteer.launch({ executablePath: chrome(), headless: 'new', defaultViewport: { width: 1500, height: 950 }, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...opciones })
}

export const esperar = ms => new Promise(r => setTimeout(r, ms))

/** Página nueva en un contexto limpio (sin datos de otras pruebas) que acumula errores. */
export async function pagina(b) {
  const ctx = await b.createBrowserContext()
  const pg = await ctx.newPage()
  pg.errores = []
  pg.on('pageerror', e => pg.errores.push('PAGEERROR ' + e.message))
  pg.on('console', m => m.type() === 'error' && pg.errores.push(m.text()))
  return pg
}

export const clicTexto = async (pg, t, raiz = '', tag = 'button') =>
  (await pg.waitForSelector(`::-p-xpath(${raiz}//${tag}[contains(normalize-space(.), "${t}")])`, { visible: true, timeout: 10000 })).click()

/** App vacía con los datos de ejemplo cargados. */
export async function conEjemplo(pg) {
  await pg.goto(URL_APP, { waitUntil: 'networkidle0' })
  await esperar(800)
  await clicTexto(pg, 'Cargar ejemplo')
  await esperar(700)
}

/** Lienzo de proyecto_001 tal como quedó guardado en IndexedDB. */
export const lienzoGuardado = pg => pg.evaluate(() => new Promise(res => {
  const r = indexedDB.open('canvas-de-citas')
  r.onsuccess = () => { const q = r.result.transaction('proyectos').objectStore('proyectos').get('proyecto_001'); q.onsuccess = () => res(q.result.canvas) }
}))

/** Adjunta un documento a una fuente desde su ficha (queda la ficha abierta). */
export async function adjuntar(pg, fid, archivo) {
  await pg.evaluate(f => (location.hash = `#/p/proyecto_001/f/${f}`), fid)
  await (await pg.waitForSelector('dialog[open] input[type=file]', { timeout: 10000 })).uploadFile(archivo)
  await esperar(700)
}

// --- Registro de resultados ---
export function suite(nombre) {
  const r = { nombre, ok: 0, fallas: [] }
  r.paso = async (n, fn) => {
    try { await fn(); r.ok++; console.log(`  ✔ ${n}`) } catch (e) { r.fallas.push(n); console.log(`  ✖ ${n}: ${e.message.split('\n')[0]}`) }
  }
  console.log(`\n${nombre}`)
  return r
}
