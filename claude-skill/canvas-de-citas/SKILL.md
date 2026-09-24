---
name: canvas-de-citas
description: Integración total de Claude Code con la app Canvas de Citas de Max (lienzo de su tesis): leer y modificar proyectos, objetivos (OG, OE1…), indicadores, fuentes, citas, documentos PDF, notas, listas de tareas, notas de voz y sus transcripciones, imágenes, gráficos y conexiones, guardados en F:\TESIS TAKE LOOK. Úsala siempre que Max pida agregar bibliografía o fuentes a su tesis o a un objetivo, registrar una cita, poner una nota, tarea, imagen o gráfico en su lienzo/canvas/tablero, conectar ideas, revisar qué tiene en el lienzo, buscar en sus notas o audios, marcar tareas, o resumir el estado de sus fuentes — aunque no mencione la app ni la skill por su nombre.
---

# Canvas de Citas

La app (PWA en `https://1xmanmax.github.io/canvas-de-citas/`) guarda todo en la carpeta
**`F:\TESIS TAKE LOOK`**: `proyectos.json` (incluye los lienzos), `fuentes.json`, `citas.json`,
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

## Tarjetas, imágenes y gráficos

- Notas: elige el estilo con sentido — `rayada` + título para fichas de lectura ("Extended Mind,
  p. 114"), `adhesiva` para pendientes o ideas rápidas, `tarjeta` para definiciones; `--letra mano`
  para comentarios personales.
- Listas: una tarea por elemento, con verbo en infinitivo ("Pedir norma E.030 al asesor").
- Gráficos: para datos (resultados, estadísticas de una fuente, avance) usa `grafico`. Elige la
  forma por la tarea: comparar categorías → `barras` (`barras-h` si las etiquetas son largas),
  evolución en el tiempo → `lineas`, partes de un todo con pocas partes → `dona`, relación entre
  dos variables → `dispersion`. Pon siempre `--titulo` y, si los datos vienen de una fuente,
  `--fuente "Autor (año)"`: en una tesis cada figura debe citar su origen. No inventes datos.
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
- Si la carpeta no existe o no hay `CLAUDE.md`, pide a Max abrir la app y elegir la carpeta en
  Configuración → carpeta de almacenamiento.
- No edites `CLAUDE.md` (la app lo sobrescribe) ni el lienzo con `editar`: usa los comandos de
  tarjetas.
