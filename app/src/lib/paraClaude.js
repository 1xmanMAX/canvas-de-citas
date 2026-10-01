// CLAUDE.md de la carpeta de almacenamiento: resumen legible de todo lo que hay en la app
// (proyectos, objetivos, fuentes, citas, notas, conexiones) e instrucciones para que Claude
// agregue bibliografía o vincule fuentes editando los JSON. La app lo reescribe en cada guardado.
import { S } from './store.svelte.js'
import { listaObjetivos } from './objetivos.js'
import { TIPOS_FUENTE, ESTADOS_USO, ESTADOS_VERIF, autorCorto, anio, paginaTexto } from './citas.js'
import { LISTAS, nombreTarjeta, duracionTexto, cajas } from './tarjetas.js'
import { contiene } from './agrupadores.js'
import { NODO_W, alturaNodo } from './grafo.js'

const una = t => String(t ?? '').replace(/\s+/g, ' ').trim()
const ref = f => (f ? `${autorCorto(f)} (${anio(f)}) \`${f.id}\`` : '(fuente borrada)')

function nombreNodo(id, p, o) {
  const f = S.fuentePorId.get(id)
  if (f) return ref(f)
  const ind = o?.indicadores.find(x => x.id === id)
  if (ind) return `indicador «${una(ind.texto)}»`
  for (const c of [o, p.canvas]) for (const l of LISTAS) {
    const t = c?.[l]?.find(x => x.id === id)
    if (t) return `${nombreTarjeta(l, t)} \`${id}\``
  }
  return id === 'hub' ? 'el proyecto' : id === 'objetivo' ? 'el objetivo' : `\`${id}\``
}

/** Notas, listas de tareas, tablas, notas de voz (con transcripción) y fotos de un lienzo. */
function tarjetas(c, sangria = '') {
  const L = []
  for (const n of c.notas || []) L.push(`${sangria}- Nota${n.titulo ? ` «${una(n.titulo)}»` : ''}: ${una(n.texto)}`)
  for (const l of c.listas || []) {
    L.push(`${sangria}- Lista de tareas «${una(l.titulo) || 'sin título'}» \`${l.id}\``)
    for (const it of l.items || []) L.push(`${sangria}  - [${it.hecho ? 'x' : ' '}] ${una(it.t)}`)
  }
  for (const t of c.tablas || []) {
    L.push(`${sangria}- Tabla «${una(t.titulo) || 'sin título'}» \`${t.id}\` (${t.filas?.length || 0} filas × ${t.filas?.[0]?.length || 0} columnas${t.fusiones?.length ? `, ${t.fusiones.length} celdas combinadas` : ''})`)
    for (const r of (t.filas || []).slice(0, 30)) L.push(`${sangria}  | ${r.map(x => una(x)).join(' | ')} |`)
  }
  for (const a of c.audios || []) L.push(`${sangria}- Nota de voz (${duracionTexto(a.duracion)}${a.creado ? `, ${a.creado.slice(0, 10)}` : ''}): ${a.transcripcion ? `«${una(a.transcripcion)}»` : '(sin transcripción)'}`)
  for (const f of c.fotos || []) {
    L.push(`${sangria}- Foto «${una(f.titulo) || 'sin título'}»${f.trazos?.length ? ' (con marcas dibujadas)' : ''}`)
    if (f.texto) L.push(`${sangria}  - Texto: ${una(f.texto)}`)
    if (f.anotacion) L.push(`${sangria}  - Anotación: ${una(f.anotacion)}`)
  }
  return L
}

function conexiones(l, p, o) {
  return l.map(c => `  - ${nombreNodo(c.desde, p, o)} → ${nombreNodo(c.hasta, p, o)}${c.etiqueta ? ` — ${una(c.etiqueta)}` : ''}`)
}

/** Agrupadores del lienzo `c` con lo que tiene dentro cada uno (por posición). */
function agrupadores(c, p, o, sangria = '') {
  if (!c?.agrupadores?.length) return []
  const libres = [...cajas(c).entries()].map(([id, k]) => ({ id, caja: k }))
  const fuentes = o
    ? (c.fuentes || []).map(x => ({ id: x.id, caja: { x: x.x, y: x.y, w: NODO_W, h: alturaNodo(false, false) } }))
    : Object.entries(c.posiciones || {}).map(([id, q]) => ({ id, caja: { x: q.x, y: q.y, w: NODO_W, h: alturaNodo(false, false) } }))
  const inds = (o?.indicadores || []).map(x => ({ id: x.id, caja: { x: x.x, y: x.y, w: 210, h: 60 } }))
  const todos = [...fuentes, ...inds, ...libres]
  return c.agrupadores.map(g => {
    const dentro = (Array.isArray(g.miembros) ? g.miembros : todos.filter(e => contiene(g, e.caja)).map(e => e.id)).map(id => nombreNodo(id, p, o))
    return `${sangria}- Agrupador «${una(g.titulo)}» \`${g.id}\`: ${dentro.length ? dentro.join('; ') : '(vacío)'}`
  })
}

function proyecto(p) {
  const L = [`## ${una(p.titulo) || 'Sin título'} \`${p.id}\``, '']
  if (p.area) L.push(`Área: ${una(p.area)}`, '')
  const objs = listaObjetivos(p)
  if (objs.length) {
    L.push('### Objetivos', '')
    for (const ob of objs) {
      L.push(`- **${ob.corto}** (clave \`${ob.clave}\`): ${una(ob.texto)}`)
      const o = p.canvas.objetivos?.[ob.clave]
      if (!o) continue
      if (o.indicadores.length) L.push(`  - Indicadores: ${o.indicadores.map(x => una(x.texto)).join('; ')}`)
      if (o.fuentes.length) L.push(`  - Fuentes: ${o.fuentes.map(x => ref(S.fuentePorId.get(x.id))).join('; ')}`)
      L.push(...tarjetas(o, '  '))
      if (o.conexiones.length) L.push('  - Conexiones:', ...conexiones(o.conexiones, p, o).map(x => '  ' + x))
      L.push(...agrupadores(o, p, o, '  '))
    }
    L.push('')
  }
  if (p.indicadores?.length) L.push('### Indicadores', '', ...p.indicadores.map(t => `- ${una(t)}`), '')

  const citas = S.citasPorProyecto.get(p.id) || []
  const porFuente = new Map()
  for (const c of citas) (porFuente.get(c.fuente_id) ?? porFuente.set(c.fuente_id, []).get(c.fuente_id)).push(c)
  if (porFuente.size) {
    L.push('### Fuentes y citas', '')
    for (const [fid, cs] of porFuente) {
      L.push(`- ${ref(S.fuentePorId.get(fid))}`)
      for (const c of cs) {
        const partes = [ESTADOS_USO[c.estado_uso] || c.estado_uso, c.cita_textual_o_parafraseo, una(c.cita_en_texto), paginaTexto(c.pagina), una(c.contexto)].filter(Boolean)
        L.push(`  - \`${c.id}\`: ${partes.join(' · ')}`)
      }
    }
    L.push('')
  }
  const libres = tarjetas(p.canvas)
  if (libres.length) L.push('### Notas, tareas, audios y fotos del lienzo', '', ...libres, '')
  // Lienzos de lectura: las tarjetas de cada fuente (las clavadas también están en el lienzo general).
  const lecturas = Object.entries(p.canvas.lecturas || {}).map(([fid, t]) => [fid, t, tarjetas(t, '  ')]).filter(([, , l]) => l.length)
  if (lecturas.length) {
    L.push('### Lienzos de lectura (uno por fuente)', '')
    for (const [fid, t, l] of lecturas) {
      const n = ['notas', 'listas', 'tablas', 'audios', 'fotos'].reduce((s, k) => s + (t[k] || []).filter(x => x.en_general).length, 0)
      L.push(`- ${S.fuentePorId.has(fid) ? ref(S.fuentePorId.get(fid)) : `\`${fid}\` (fuente borrada)`}${n ? ` · ${n} clavada${n === 1 ? '' : 's'} en el lienzo general` : ''}`, ...l)
    }
    L.push('')
  }
  if (p.canvas.conexiones.length) L.push('### Conexiones', '', ...conexiones(p.canvas.conexiones, p).map(x => x.slice(2)), '')
  const grupos = agrupadores(p.canvas, p)
  if (grupos.length) L.push('### Agrupadores (recuadros que reúnen elementos del lienzo)', '', ...grupos, '')
  return L
}

function biblioteca(fuentes) {
  const L = ['## Biblioteca (todas las fuentes)', '']
  const orden = [...fuentes].sort((a, b) => autorCorto(a).localeCompare(autorCorto(b)))
  for (const f of orden) {
    const datos = [TIPOS_FUENTE[f.tipo_fuente] || f.tipo_fuente, ESTADOS_VERIF[f.estado_verificacion] || f.estado_verificacion, f.tema, f.documento_original ? `documento: ${f.documento_original}` : ''].filter(Boolean)
    L.push(`- ${ref(f)} — ${una(f.titulo)}${datos.length ? ` _(${datos.join(' · ')})_` : ''}`)
    if (f.entrada_bibliografia) L.push(`  - ${una(f.entrada_bibliografia)}`)
    for (const p of f.puntos || []) L.push(`  - Punto (${p.tipo}${p.pagina ? `, p. ${p.pagina}` : ''}${p.objetivos?.length ? `, ${p.objetivos.join('/').toUpperCase()}` : ''}): ${una(p.texto)}`)
    if (f.referencias_citadas?.length) L.push(`  - Cita a: ${f.referencias_citadas.join(', ')}`)
  }
  if (!orden.length) L.push('_Todavía no hay fuentes._')
  return [...L, '']
}

const INSTRUCCIONES = `## Cómo modificar estos datos (para Claude)

La app **Canvas de Citas** guarda aquí \`proyectos.json\`, \`fuentes.json\` y \`citas.json\` y
recarga esta carpeta sola (unos 8 s, o al volver a la ventana). Este CLAUDE.md lo regenera la
app en cada guardado: **no lo edites**.

**Usa la skill \`canvas-de-citas\`** y su script
(\`node ~/.claude/skills/canvas-de-citas/scripts/canvas.mjs ayuda\`): agrega y edita fuentes,
citas, notas, listas, imágenes, gráficos y conexiones con el formato correcto, y borra de forma
que la app no lo restaure. Lo de abajo describe el formato por si hay que editar a mano.

- **Agregar bibliografía:** añade un objeto a \`fuentes.json\` con un id nuevo \`fuente_NNN\`
  (siguiente número libre, nunca reutilizar), \`tipo_fuente\` (${Object.keys(TIPOS_FUENTE).join(', ')}),
  \`autores\` ("Apellido, I."), \`anio\`, \`titulo\`, \`revista_o_editorial\`, \`doi_o_url\`, \`idioma\`,
  \`entrada_bibliografia\`, \`estado_verificacion\` (${Object.keys(ESTADOS_VERIF).join(', ')}),
  \`fuente_verificacion\`, \`notas_correccion\`, \`tema\` y \`documento_original: null\`.
  Verifica la fuente con la skill **citas-tesis** antes de marcarla como verificada.
- **Vincular una fuente a un proyecto:** añade a \`citas.json\` un objeto \`cita_NNN\` con
  \`proyecto_id\`, \`fuente_id\`, \`estado_uso\` (${Object.keys(ESTADOS_USO).join(', ')}),
  \`cita_textual_o_parafraseo\` (textual | parafraseo), \`pagina\`, \`cita_en_texto\` y \`contexto\`.
- **Vincular una fuente a un objetivo:** en \`proyectos.json\`, dentro del proyecto, agrega
  \`{ "id": "fuente_NNN", "x": 0, "y": 0 }\` a \`canvas.objetivos.<clave>.fuentes\` (claves \`og\`, \`oe1\`, \`oe2\`…
  como aparecen arriba). Si el objetivo aún no tiene sub-lienzo, créalo como
  \`{ "indicadores": [], "fuentes": [], "notas": [], "conexiones": [] }\`. Separa las posiciones
  (x, y) unos 260 px para que las tarjetas no se encimen. La fuente también debe estar vinculada
  al proyecto en \`citas.json\`.
- **Agregar una nota o una lista de tareas al lienzo:** en el proyecto (o en \`canvas.objetivos.<clave>\`)
  añade a \`canvas.notas\` \`{ "id": "nota_<algo único>", "titulo": "", "texto": "…", "estilo": "adhesiva", "letra": "sans", "color": "amarillo", "creado": "<ISO>", "x": 0, "y": 0 }\`
  (estilo: adhesiva | rayada | tarjeta; letra: sans | serif | mono | mano | libro | moderna | elegante | redonda | plumon | escolar | antigua | codigo | lapicero; listas, tablas, notas de voz, fotos y agrupadores también aceptan \`letra\`, opcional) o a \`canvas.listas\`
  \`{ "id": "lista_<algo único>", "titulo": "…", "items": [{ "t": "tarea", "hecho": false }], "creado": "<ISO>", "x": 0, "y": 0 }\`.
  Tablas en \`canvas.tablas\`: \`{ "id": "tabla_<algo único>", "titulo": "…", "filas": [["Encabezado", "…"], ["celda", "…"]], "encabezado": true, "creado": "<ISO>", "x": 0, "y": 0 }\`
  (todas las filas con el mismo número de celdas; \`encabezado\`: la primera fila va en negrita). Opcionales:
  \`fusiones\` \`[{ "fila": 0, "col": 0, "filas": 1, "cols": 2 }]\` (celdas combinadas; el texto va en la primera) y
  \`colores\` \`{ "1,0": "verde" }\` (fondo de la celda fila,columna: amarillo | verde | celeste | rosa | naranja | lila | gris).
  Las notas de voz (\`canvas.audios\`) y fotos (\`canvas.fotos\`) llevan el archivo incrustado: no las crees, solo
  puedes corregir su \`transcripcion\`, \`titulo\`, \`texto\` o \`anotacion\`.
- **Lienzo de lectura de cada fuente:** \`canvas.lecturas.<fuente_id>\` es un tablero propio de esa fuente
  (\`notas\`, \`listas\`, \`tablas\`, \`audios\`, \`fotos\`, \`conexiones\`, \`agrupadores\`, con la fuente al centro en (0, 0)).
  Ahí van las citas y recortes tomados del documento. Una tarjeta con \`"en_general": { "x": 0, "y": 0 }\`
  está "clavada": también se ve en el lienzo general del proyecto, en esa posición (sin ese campo, solo en su lectura).
- **Agrupadores** (recuadros punteados con nombre): \`canvas.agrupadores\` (o en \`canvas.objetivos.<clave>\`)
  con \`{ "id": "grupo_<algo único>", "titulo": "…", "color": "azul", "miembros": ["fuente_001", "nota_…"], "x": 0, "y": 0, "w": 600, "h": 400 }\`
  (color: azul | verde | rojo | ocre | lila | gris). \`miembros\` son los ids de lo que agrupa (cada
  elemento en un solo agrupador); la app ajusta sola el recuadro (x, y, w, h) a lo que tiene dentro.
  Coloca los miembros cerca entre sí (unos 220 px de separación) para que el recuadro quede compacto.
- Escribe JSON válido y completo (la app ignora un archivo a medio escribir y reintenta).
- No borres campos que no conozcas: la app guarda ahí posiciones del lienzo y otros datos.
`

/** Markdown con todo el contenido de la app, para que Claude lo lea desde la carpeta. */
export function generarClaudeMd({ proyectos, fuentes } = { proyectos: S.proyectos, fuentes: S.fuentes }) {
  const L = ['# Canvas de Citas — datos de la tesis', '', `_Generado por la app el ${new Date().toLocaleString('es-PE')}_`, '']
  for (const p of proyectos) L.push(...proyecto(p))
  if (!proyectos.length) L.push('_Todavía no hay proyectos._', '')
  L.push(...biblioteca(fuentes), INSTRUCCIONES)
  return L.join('\n')
}
