# Canvas de Citas (PWA)

App web instalable para gestionar las citas de la tesis. Svelte 5 + Vite, grafo en SVG propio,
datos en IndexedDB, funciona sin conexión. Sin Electron ni librerías de grafos.

## Uso

```bash
npm install
npm run dev       # desarrollo en http://localhost:5173
npm run build     # genera dist/ (estático: se puede subir a GitHub Pages, Netlify, etc.)
npm run preview   # sirve dist/ en la red local (para probar desde el celular)
```

Para instalarla: abre la app servida por HTTPS (o `localhost`) y usa "Instalar app" del navegador
(Chrome/Edge escritorio y Android; en iPhone: Compartir → "Agregar a inicio").

## Datos y la skill `citas-tesis`

Los datos viven en IndexedDB del dispositivo. El botón **Datos** (ícono de base de datos) permite:

- **Descargar los 3 JSON**: `proyectos.json`, `fuentes.json`, `citas.json`, con exactamente el esquema de
  `references/formato-datos.md` de la skill (mismos campos, mismo orden, ids `proyecto_001`, `fuente_003`, `cita_012`).
- **Importar** uno, dos o los tres archivos (botón o arrastrándolos a la ventana). *Combinar* actualiza por `id`
  y conserva los campos propios de la app aunque la skill reescriba la entrada; *Reemplazar* sustituye la colección.
  También acepta el esquema antiguo de un solo `citas.json` (con la metadata dentro de cada cita) y lo separa.
- **Carpeta sincronizada** (Chrome/Edge escritorio): guarda/lee los JSON directamente en la carpeta de trabajo
  de la skill, incluidos los documentos adjuntos en `fuentes/<id>/documento.<ext>` (`documento_original`).
- **Exportar .bib**: misma clave y mapeo de tipos que `scripts/gestionar_citas.py`.

Campos extra que agrega la app (la skill los ignora sin problema):
`proyectos[].canvas` (modo, posiciones, notas, fotos, conexiones), `proyectos[].actualizado`,
`fuentes[].tema` y `fuentes[].etiquetas`.

Flujo recomendado: exportar (o "Guardar en carpeta") → trabajar con la skill en Claude → importar (o
"Cargar desde carpeta") con *Combinar*. Evita crear citas nuevas en la app y en la skill a la vez sin
sincronizar entre medio, porque ambas numeran ids correlativos.

## Estructura

- `src/lib/store.svelte.js` — estado reactivo + escritura en IndexedDB (`db.js`)
- `src/lib/io.svelte.js` — exportar/importar JSON, carpeta, BibTeX
- `src/lib/citas.js` — reglas de formato (manual UPC / APA 6), etiquetas, BibTeX
- `src/lib/grafo.js`, `src/components/Lienzo.svelte` — layouts y lienzo SVG (pan, zoom, pellizco, arrastre)
- `src/views/` — Proyectos, Hub (tesis), General (vista de citas)
- `src/sw.js` — service worker (precache generado en el build por `vite.config.js`)
- `scripts/icons.js` — regenera los PNG del ícono
