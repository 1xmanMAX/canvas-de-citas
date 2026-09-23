import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

// Genera sw.js con la lista exacta de archivos del build para precache (sin Workbox).
function serviceWorker() {
  return {
    name: 'cc-service-worker',
    apply: 'build',
    // writeBundle: el bundle ya está completo (CSS e index.html incluidos).
    writeBundle(opciones, bundle) {
      const publicos = ['./', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']
      const archivos = Object.keys(bundle).filter(f => !f.endsWith('.map') && f !== 'index.html' && f !== 'sw.js')
      const hash = createHash('sha1')
      for (const f of [...archivos, 'index.html'].sort()) {
        const b = bundle[f]
        hash.update(f).update(b.type === 'chunk' ? b.code : b.source)
      }
      const src = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', 'cc-' + hash.digest('hex').slice(0, 10))
        .replace('__ASSETS__', JSON.stringify([...publicos, ...archivos.sort()]))
      writeFileSync(join(opciones.dir, 'sw.js'), src)
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [svelte(), serviceWorker()],
  build: { target: 'es2020', modulePreload: false, assetsInlineLimit: 0, cssCodeSplit: false }
})
