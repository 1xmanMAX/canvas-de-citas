---
name: canvas-de-citas
description: Integración total de Claude Code con la app Canvas de Citas de Max (lienzo de su tesis): leer y modificar proyectos, objetivos (OG, OE1…), indicadores, fuentes, citas, documentos PDF, notas, listas de tareas, notas de voz y sus transcripciones, imágenes, gráficos y conexiones, guardados en su carpeta de almacenamiento (hoy F:\THE FORGE\THESIS\New folder). Úsala siempre que Max pida agregar bibliografía o fuentes a su tesis o a un objetivo, registrar una cita, poner una nota, tarea, imagen o gráfico en su lienzo/canvas/tablero, conectar ideas, revisar qué tiene en el lienzo, buscar en sus notas o audios, marcar tareas, o resumir el estado de sus fuentes — aunque no mencione la app ni la skill por su nombre.
---

# Canvas de Citas

La app (PWA en `https://1xmanmax.github.io/canvas-de-citas/`) guarda todo en la carpeta de
almacenamiento que Max eligió en Configuración (hoy **`F:\THE FORGE\THESIS\New folder`**; el
script la recuerda en `carpeta.txt`, se ve con `canvas.mjs carpeta` y se cambia con
`canvas.mjs carpeta <ruta>`): `proyectos.json` (incluye los lienzos), `fuentes.json`, `citas.json`,
`fuentes/<id>/documento.*` y un `CLAUDE.md` que regenera en cada guardado. Cuando la app está
abierta revisa la carpeta cada ~8 s y carga lo que cambie; si está cerrada, lo carga al abrirla.

Haz **todo** con el script, no editando los JSON a mano: conserva el formato exacto de la app,
asigna ids sin repetir, coloca las tarjetas sin encimarlas, reduce imágenes, escribe de forma
atómica y deja la marca que la app necesita para que un borrado no reaparezca.

```bash
node ~/.claude/skills/canvas-de-citas/scripts/canvas.mjs <comando> …
```

La lista completa de comandos, opciones y formatos está en `references/comandos.md`
(también `canvas.mjs ayuda`). Léela antes del primer uso en una conversación.

## Flujo

1. **Mira antes de tocar.** `resumen` y luego `ver <proyecto>` para conocer los ids, las claves de
   objetivos (`og`, `oe1`…) y lo que ya existe. Para encontrar algo concreto, `buscar`.
2. **Haz el cambio** con el comando adecuado. Varias acciones seguidas están bien: cada comando
   relee la carpeta, así que no pisa lo que la app haya guardado entre medio.
3. **Cuéntale a Max qué quedó y dónde** (ids, objetivo), y que la app lo muestra en unos segundos.

## Fuentes y citas

- Para una fuente nueva, verifica primero sus datos con la skill **citas-tesis** (CrossRef,
  OpenAlex, Open Library…) y usa lo que devuelva: autores `"Apellido, I."`, año, título,
  editorial/revista, DOI y `entrada_bibliografia` en el formato del manual. Solo marca
  `estado_verificacion: "verificado"` si de verdad se confirmó; si no, `no_verificado` o `dudoso`.
  No edites la skill citas-tesis (es sincronizada).
- `fuente-nueva` detecta duplicados (DOI o título + año) y devuelve la existente: vincúlala en
  vez de duplicarla.
- Vincular a un objetivo (`--objetivo oe2`) también la vincula al proyecto. Una fuente vinculada
  sin citas aparece como "sin revisar"; cuando Max la use, registra la cita con `cita-nueva`
  (página, cita en texto, contexto).
- Si Max da un PDF, adjúntalo con `documento <fuente> <ruta>`.
- Libro sin DOI: deja `doi_o_url` vacío (o la URL de la editorial/Open Library si la hay); nunca
  inventes un DOI. Ejemplo de `entrada_bibliografia` de libro:
  `Priestley, M. J. N., Seible, F., & Calvi, G. M. (1996). Seismic design and retrofit of bridges. New York, NY: Wiley.`
- `fuente-nueva --proyecto/--objetivo` deja una cita "sin revisar" como marcador; `cita-nueva`
  la completa en vez de duplicarla.

## Leer los papers

- Para leer o citar un paper, usa `leer <fuente_id>` (o `--paginas 4-6`) en vez de abrir el PDF:
  es texto limpio en Markdown con marcas `## Página N`, mucho más rápido y fiable que leer el PDF.
  Cita con la paginación impresa de la revista (suele aparecer al inicio de cada página) y, si el
  texto avisa de capas duplicadas o páginas sin texto, verifica en el PDF.
- Los papers de Max ya están convertidos en `F:\THE FORGE\THESIS\PAPERS\texto\`; si agrega nuevos,
  `convertir "F:\THE FORGE\THESIS\PAPERS"` convierte solo lo nuevo.
- Si falta `node_modules` en la carpeta de la skill, ejecuta `npm i` ahí una vez.

## Analizar un paper para la tesis

Cuando Max pida analizar, fichar o "sacar lo importante" de un paper:

1. `leer <fuente>` (por partes con `--paginas` si es largo). Relee los objetivos con `ver`.
2. **Puntos clave**: registra con `punto <fuente> --texto "…" --pagina N --tipo … --objetivo oeX`
   solo lo que sirve para la tesis de Max (retrabajos, gestión de cambios, RFIs, agentes de IA,
   aceptación tecnológica, casos viales/Perú). Tipos: `hallazgo`, `dato` (cifras con su contexto),
   `metodo`, `definicion`, `marco`, `vacio` (brecha de investigación), `limitacion`, `cita`
   (textual, entre comillas y con página exacta). Redacta en español, con tus palabras salvo en
   `cita`; una idea por punto; el número de página impreso de la revista si aparece. Asigna el
   objetivo al que aporta (puede ser más de uno: `--objetivo oe2,oe3`). Cada punto queda en la
   ficha de la fuente y como tarjeta de color en el lienzo del objetivo, conectada al paper.
   Mejor 5–12 puntos precisos que 30 genéricos.
3. **Referencias**: `referencias <fuente>` lista la bibliografía del paper (con DOI si lo trae y
   si ya está en la biblioteca). Propón a Max las que valen la pena para la tesis (no todas).
   Verifica cada una con **citas-tesis** y agrégala con
   `referencia-nueva <paper> --json '{…}'`: queda vinculada al proyecto como "sin revisar" y
   conectada al paper con un hilo "cita a" (si ya existía, solo se conecta).
4. Para redactar un capítulo u objetivo: `puntos --objetivo oe1` (o `--tipo vacio`,
   `--buscar retrabajo`) devuelve todos los puntos agrupados con su cita (Autor, año, p. N).

## Tarjetas, imágenes y gráficos

- **Dónde:** si el pedido menciona un objetivo ("para el OE2", "vincúlalo al OE2"), crea las
  tarjetas relacionadas en ese sub-lienzo con `--objetivo oe2`; si no, en el lienzo principal.
  `conectar` detecta solo el sub-lienzo de las tarjetas; las dos deben estar en el mismo lienzo.
- **No inventes contenido.** Una ficha de lectura lleva lo que Max dio o lo que leíste en el
  documento de la fuente (`extraer <fuente>` da la ruta del PDF para leerlo). Si no tienes el
  contenido, crea la ficha con lo que sí sabes y `[completar: …]` donde falte, y díselo.
- Notas: elige el estilo con sentido — `rayada` + título para fichas de lectura ("Extended Mind,
  p. 114"), `adhesiva` para pendientes o ideas rápidas, `tarjeta` para definiciones; `--letra mano`
  para comentarios personales.
- Listas: una tarea por elemento, con verbo en infinitivo ("Pedir norma E.030 al asesor").
- Gráficos: para datos (resultados, estadísticas de una fuente, avance) usa `grafico`. Elige la
  forma por la tarea: comparar categorías → `barras` (`barras-h` si las etiquetas son largas),
  evolución en el tiempo → `lineas`, partes de un todo con pocas partes → `dona`, relación entre
  dos variables → `dispersion`. Pon siempre `--titulo` y, si los datos vienen de una fuente,
  `--fuente "Autor (año)"`: en una tesis cada figura debe citar su origen. No inventes datos.
  Para decimales con coma usa `--coma`, y `--decimales 1` para fijar decimales (p. ej. 5,0).
- Diagramas o esquemas (mapa conceptual, flujo de la metodología, línea de tiempo): escribe tú
  un SVG (fondo `#FBFAF6`, texto `#211F1A`, fuente Segoe UI/Arial, `viewBox` con el tamaño) en
  un archivo temporal y agrégalo con `imagen archivo.svg --titulo …`.
- Conecta lo relacionado (`conectar a b --etiqueta "sustenta"`): una fuente con la nota que la
  resume, un gráfico con la fuente de sus datos, una tarea con el objetivo que desbloquea.
- Para **ver** una imagen o un audio del lienzo: `extraer <id>` y abre el archivo (las imágenes
  con Read). Para corregir una transcripción: `editar <id> --json '{"transcripcion":"…"}'`.

## Cuidado

- Borrar es definitivo en la app: confirma con Max antes de `borrar` fuentes o proyectos que no
  pidió borrar explícitamente.
- Las notas de voz solo se crean desde la app (micrófono) o el celular; aquí solo se leen,
  extraen o se corrige su transcripción.
- Si la carpeta o `proyectos.json` no existen, pide a Max abrir la app y elegir la carpeta en
  Configuración → carpeta de almacenamiento. Que falte `CLAUDE.md` no impide trabajar: solo
  significa que la app todavía no guardó con la versión nueva.
- No edites `CLAUDE.md` (la app lo sobrescribe) ni el lienzo con `editar`: usa los comandos de
  tarjetas.
