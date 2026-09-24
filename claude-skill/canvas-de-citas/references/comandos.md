# Comandos de canvas.mjs

`node ~/.claude/skills/canvas-de-citas/scripts/canvas.mjs <comando> …`

Opciones comunes: `--proyecto proyecto_001` (se puede omitir si solo hay uno) y
`--objetivo og|oe1|oe2…` para trabajar en el sub-lienzo de un objetivo. Los JSON se pasan con
`--json '{…}'` o, si son largos o tienen comillas, con `--json-archivo ruta.json`
(igual `--datos` / `--datos-archivo` en gráficos).

## Leer
| Comando | Qué hace |
|---|---|
| `resumen` | Proyectos, conteos y objetivos disponibles |
| `ver [proyecto_001]` | Todo el proyecto con ids: objetivos, indicadores, fuentes, citas, tarjetas, conexiones, sub-lienzos |
| `ver biblioteca` | Todas las fuentes |
| `buscar <texto>` | Busca en fuentes, citas, notas, listas, transcripciones y textos de imágenes |
| `obtener <id>` | JSON completo de cualquier elemento |
| `extraer <id> [--a carpeta]` | Guarda una imagen o nota de voz en un archivo (para verla con Read); en una fuente, da la ruta de su documento |

## Proyectos, fuentes y citas
| Comando | Qué hace |
|---|---|
| `proyecto-nuevo --json '{"titulo":…, "objetivo_general":…, "objetivos_especificos":[…], "indicadores":[…]}'` | Crea un proyecto |
| `fuente-nueva --json '{…}' [--proyecto P] [--objetivo oe1] [--forzar]` | Crea una fuente (detecta duplicados por DOI o título+año) y la vincula |
| `vincular <fuente> [--proyecto P] [--objetivo oe1]` | Vincula una fuente existente a un proyecto u objetivo |
| `desvincular <fuente> [--proyecto P] [--objetivo oe1]` | La quita del objetivo, o del proyecto (borra sus citas ahí) |
| `cita-nueva --json '{"fuente_id":…, "estado_uso":"usando", "cita_textual_o_parafraseo":"textual", "pagina":45, "cita_en_texto":"(Autor, 2018, p. 45)", "contexto":"Cap. 2"}'` | Registra una cita (reutiliza el marcador "sin revisar") |
| `documento <fuente> <ruta.pdf>` | Adjunta el documento original de la fuente |
| `indicador <n o texto> --objetivo oe1` | Vincula un indicador del proyecto al objetivo |

Campos de fuente: `tipo_fuente` (articulo_cientifico, libro, capitulo_libro, normativa_tecnica, otro),
`autores` (["Apellido, I."]), `anio`, `titulo`, `revista_o_editorial`, `doi_o_url`, `idioma`,
`entrada_bibliografia` (APA 6 del manual), `estado_verificacion` (verificado, dudoso, no_verificado),
`fuente_verificacion`, `notas_correccion`, y opcionales `tema`, `etiquetas` (["…"]).
`estado_uso` de citas: usando, revisado_no_usado, no_revisado.

## Tarjetas del lienzo
| Comando | Qué hace |
|---|---|
| `nota --texto "…" [--titulo] [--estilo adhesiva|rayada|tarjeta] [--letra sans|serif|mono|mano] [--color amarillo|rosa|verde|celeste|naranja|lila]` | Nota |
| `lista --titulo "…" --tareas "a|b|c"` | Lista de tareas |
| `tarea <lista> --agregar "d|e" · --marcar 2 · --desmarcar 2 · --quitar 3 · --editar 1 --texto "…"` | Modifica una lista |
| `imagen <ruta.png/jpg/webp/gif/svg> [--titulo] [--texto] [--anotacion]` | Imagen (se reduce como en la app) |
| `grafico <tipo> --datos '{…}' --titulo "…" [--subtitulo] [--fuente "INEI (2023)"] [--unidad "%"] [--eje-x] [--eje-y] [--valores] [--guardar f.svg] [--solo-archivo]` | Gráfico SVG como tarjeta |
| `conectar <desde> <hasta> [--etiqueta "…"]` | Hilo entre dos elementos (`hub` = tarjeta del proyecto; `objetivo` en sub-lienzos) |
| `mover <id> <x> <y>` | Recoloca una tarjeta (o una fuente: pasa el lienzo a Libre) |

Todas las tarjetas aceptan `--x --y`; si no, se colocan solas en un hueco libre.

Datos por tipo de gráfico:
- `barras`, `lineas`: `{"etiquetas":["2021","2022"],"series":[{"nombre":"Lima","valores":[3,5]}]}` (o `"valores"` para una serie). `--desde-cero` en líneas.
- `barras-h` (etiquetas largas, rankings): igual que barras.
- `dona`: `{"etiquetas":["A","B"],"valores":[60,40]}` (más de 6 partes se agrupan en "Otros"; `--total "encuestados"`).
- `dispersion`: `{"series":[{"nombre":"Puentes","puntos":[[1.2,30],[2.5,41]]}]}` (máx. 3 series).

## Editar y borrar
| Comando | Qué hace |
|---|---|
| `editar <id> --json '{…}'` | Cambia campos de un proyecto, fuente, cita, tarjeta (texto, titulo, estilo, transcripcion, anotacion…) o conexión (etiqueta) |
| `borrar <id>` | Borra una tarjeta, conexión, cita o fuente (con sus citas y rastros en los lienzos). Proyectos: `--confirmar` |
