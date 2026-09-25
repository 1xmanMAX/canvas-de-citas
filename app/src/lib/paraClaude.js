// CLAUDE.md de la carpeta de almacenamiento: resumen legible de todo lo que hay en la app
// (proyectos, objetivos, fuentes, citas, notas, conexiones) e instrucciones para que Claude
// agregue bibliografía o vincule fuentes editando los JSON. La app lo reescribe en cada guardado.
import { S } from './store.svelte.js'
import { listaObjetivos } from './objetivos.js'
import { TIPOS_FUENTE, ESTADOS_USO, ESTADOS_VERIF, autorCorto, anio, paginaTexto } from './citas.js'
import { LISTAS, nombreTarjeta, duracionTexto } from './tarjetas.js'

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

/** Notas, listas de tareas, notas de voz (con transcripción) y fotos de un lienzo. */
function tarjetas(c, sangria = '') {
  const L = []
  for (const n of c.notas || []) L.push(`${sangria}- Nota${n.titulo ? ` «${una(n.titulo)}»` : ''}: ${una(n.texto)}`)
  for (const l of c.listas || []) {
    L.push(`${sangria}- Lista de tareas «${una(l.titulo) || 'sin título'}» \`${l.id}\``)
    for (const it of l.items || []) L.push(`${sangria}  - [${it.hecho ? 'x' : ' '}] ${una(it.t)}`)
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
  if (p.canvas.conexiones.length) L.push('### Conexiones', '', ...conexiones(p.canvas.conexiones, p).map(x => x.slice(2)), '')
  return L
}

function biblioteca() {
  const L = ['## Biblioteca (todas las fuentes)', '']
  const orden = [...S.fuentes].sort((a, b) => autorCorto(a).localeCompare(autorCorto(b)))
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
  (estilo: adhesiva | rayada | tarjeta; letra: sans | serif | mono | mano) o a \`canvas.listas\`
  \`{ "id": "lista_<algo único>", "titulo": "…", "items": [{ "t": "tarea", "hecho": false }], "creado": "<ISO>", "x": 0, "y": 0 }\`.
  Las notas de voz (\`canvas.audios\`) y fotos (\`canvas.fotos\`) llevan el archivo incrustado: no las crees, solo
  puedes corregir su \`transcripcion\`, \`titulo\`, \`texto\` o \`anotacion\`.
- Escribe JSON válido y completo (la app ignora un archivo a medio escribir y reintenta).
- No borres campos que no conozcas: la app guarda ahí posiciones del lienzo y otros datos.
`

/** Markdown con todo el contenido de la app, para que Claude lo lea desde la carpeta. */
export function generarClaudeMd() {
  const L = ['# Canvas de Citas — datos de la tesis', '', `_Generado por la app el ${new Date().toLocaleString('es-PE')}_`, '']
  for (const p of S.proyectos) L.push(...proyecto(p))
  if (!S.proyectos.length) L.push('_Todavía no hay proyectos._', '')
  L.push(...biblioteca(), INSTRUCCIONES)
  return L.join('\n')
}
