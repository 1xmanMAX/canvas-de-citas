# Handoff para Claude Code — Canvas de Citas

> Documento original de arranque del proyecto (histórico). El README actual está en la raíz.
> Los mockups HTML están en la raíz del repo.

Este paquete tiene todo lo necesario para que Claude Code (u otro desarrollador) empiece a construir la app sin perder el contexto de esta conversación.

## Qué hay aquí

- **`spec.md`** — el documento funcional completo: arquitectura (skill + JSON + app), flujo de la skill, esquema de datos (`proyectos.json` / `fuentes.json` / `citas.json`), export a BibTeX, y los requisitos técnicos (rendimiento, conexión con Word, conexión con Claude/IA, documentos adjuntos por fuente).
- **`design-reference/`** — las 4 pantallas del mockup, como HTML independiente que abre en cualquier navegador (doble clic en `1-proyectos.html`) y navega entre sí con clics reales:
  1. `1-proyectos.html` — lista de proyectos (tesis/trabajos)
  2. `2-tesis-hub.html` — la tesis como nodo central con las fuentes alrededor, notas, fotos, conexiones y etiquetas
  3. `3-fuente-citas.html` — ventana con todas las citas extraídas de una fuente
  4. `4-vista-general.html` — vista general de citas con filtros y panel de detalle

Estos HTML son visuales (colores, tipografía, layout, textos) — no llevan lógica real ni JavaScript funcional. Sirven para que Claude Code (o tú) vea exactamente cómo se ve cada pantalla y replique el diseño con precisión, sin que tengas que describirlo de palabra.

## Cómo empezar con Claude Code

1. Crea una carpeta para el proyecto (ej. `canvas-de-citas/`) y copia dentro este paquete completo (`spec.md` + `design-reference/`).
2. Abre una terminal en esa carpeta y ejecuta `claude`.
3. Usa el prompt de `PROMPT.md` como primer mensaje (ajusta lo que quieras antes de enviarlo).

Claude Code puede leer `spec.md` y los archivos de `design-reference/` directamente del disco — no hace falta que se los copies pegados en el chat.
