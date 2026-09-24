#!/usr/bin/env node
// Canvas de Citas desde Claude Code: leer, agregar, modificar y borrar todo lo de la app
// (proyectos, objetivos, fuentes, citas, documentos, notas, listas, imágenes, gráficos, conexiones).
// Uso: node canvas.mjs <comando> [argumentos] [--opciones]   ·   node canvas.mjs ayuda
import fs from 'node:fs'
import path from 'node:path'
import {
  CARPETA, CONFIG, cargar, guardar, ruta, marcarEliminados, nuevoId, idLocal, ahoraISO, localizar,
  proyecto as buscarProyecto, subLienzo, clavesObjetivo, lienzos, LISTAS_TARJETA
} from './datos.mjs'
import { tamano, ocupadasProyecto, ocupadasObjetivo, lugarLibre } from './disposicion.mjs'
import { cargarImagen, extraerDataURL } from './imagen.mjs'
import { grafico } from './grafico.mjs'

// --- Argumentos ---
const [cmd = 'ayuda', ...resto] = process.argv.slice(2)
const pos = [], op = {}
for (let i = 0; i < resto.length; i++) {
  const a = resto[i]
  if (a.startsWith('--')) {
    const k = a.slice(2), sig = resto[i + 1]
    if (sig === undefined || sig.startsWith('--')) op[k] = true
    else { op[k] = sig; i++ }
  } else pos.push(a)
}
const leerJsonOp = (k) => {
  if (op[`${k}-archivo`]) return JSON.parse(fs.readFileSync(op[`${k}-archivo`], 'utf8').replace(/^﻿/, ''))
  if (op[k] === undefined || op[k] === true) return null
  return JSON.parse(op[k])
}
const fallar = m => { throw new Error(m) }
const ok = m => console.log(m)

// --- Catálogos (iguales a app/src/lib/citas.js y tarjetas.js) ---
const TIPOS_FUENTE = ['articulo_cientifico', 'libro', 'capitulo_libro', 'normativa_tecnica', 'otro']
const ESTADOS_USO = ['usando', 'revisado_no_usado', 'no_revisado']
const ESTADOS_VERIF = ['verificado', 'dudoso', 'no_verificado']
const ESTILOS = ['adhesiva', 'rayada', 'tarjeta'], LETRAS = ['sans', 'serif', 'mono', 'mano']
const COLORES = ['amarillo', 'rosa', 'verde', 'celeste', 'naranja', 'lila']
const enLista = (v, l, campo) => { if (v != null && v !== '' && !l.includes(v)) fallar(`${campo} "${v}" no válido. Usa: ${l.join(', ')}`) }

const apellido = a => String(a || '').split(',')[0].trim()
function autorCorto(f) {
  const ap = (f?.autores || []).map(apellido).filter(Boolean)
  if (!ap.length) return f?.titulo?.split(' ').slice(0, 3).join(' ') || 'Sin autor'
  return ap.length === 1 ? ap[0] : ap.length === 2 ? `${ap[0]} & ${ap[1]}` : `${ap[0]} et al.`
}
const refF = f => `${autorCorto(f)} (${f.anio ?? 's. f.'})`
const una = t => String(t ?? '').replace(/\s+/g, ' ').trim()
const corta = (t, n = 70) => { t = una(t); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const normal = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// --- Contexto: proyecto + lienzo destino ---
function destino(d) {
  const p = buscarProyecto(d, op.proyecto)
  const clave = op.objetivo || null
  const c = subLienzo(p, clave)
  const ocupadas = clave ? ocupadasObjetivo(c) : ocupadasProyecto(d, p)
  return { p, clave, c, ocupadas }
}
const donde = (p, clave) => `${p.id}${clave ? ` › ${clave.toUpperCase()}` : ''}`
const aviso = () => ok('La app lo carga sola en ~8 s si está abierta (o al abrirla).')

function colocar(lista, o, ocupadas) {
  const { w, h } = tamano(lista, o)
  const x = op.x !== undefined ? +op.x : null, y = op.y !== undefined ? +op.y : null
  Object.assign(o, x !== null && y !== null ? { x, y } : lugarLibre(ocupadas, w, h, 0, 0))
  return o
}

function nuevaTarjeta(lista, datos) {
  const d = cargar(), { p, clave, c, ocupadas } = destino(d)
  const pref = { notas: 'nota', listas: 'lista', audios: 'audio', fotos: 'foto' }[lista]
  const o = colocar(lista, { id: idLocal(pref), ...datos, creado: ahoraISO(), x: 0, y: 0 }, ocupadas)
  c[lista].push(o)
  guardar(d, ['proyectos'])
  ok(`${pref} creada: ${o.id} en ${donde(p, clave)} (x ${o.x}, y ${o.y})`)
  aviso()
  return o
}

// --- Vista ---
function tarjetasMd(c, s = '') {
  const L = []
  for (const n of c.notas || []) L.push(`${s}- \`${n.id}\` Nota${n.titulo ? ` «${una(n.titulo)}»` : ''} [${n.estilo || 'adhesiva'}/${n.letra || 'sans'}]: ${una(n.texto)}`)
  for (const l of c.listas || []) {
    L.push(`${s}- \`${l.id}\` Lista «${una(l.titulo) || 'sin título'}»`)
    ;(l.items || []).forEach((it, i) => L.push(`${s}  ${i + 1}. [${it.hecho ? 'x' : ' '}] ${una(it.t)}`))
  }
  for (const a of c.audios || []) L.push(`${s}- \`${a.id}\` Nota de voz ${Math.round(a.duracion || 0)} s: ${a.transcripcion ? `«${una(a.transcripcion)}»` : '(sin transcripción)'}`)
  for (const f of c.fotos || []) {
    L.push(`${s}- \`${f.id}\` Imagen «${una(f.titulo) || 'sin título'}»${f.trazos?.length ? ` (${f.trazos.length} trazos)` : ''}${/svg/.test((f.imagen || '').slice(0, 30)) ? ' (gráfico SVG)' : ''}`)
    if (f.texto) L.push(`${s}  texto: ${una(f.texto)}`)
    if (f.anotacion) L.push(`${s}  anotación: ${una(f.anotacion)}`)
  }
  return L
}

function nombreNodo(d, p, c, id) {
  if (id === 'hub') return 'PROYECTO'
  if (id === 'objetivo') return 'OBJETIVO'
  const f = d.fuentes.find(x => x.id === id)
  if (f) return `${refF(f)} \`${id}\``
  const ind = (c.indicadores || []).find(x => x.id === id)
  if (ind) return `indicador «${una(ind.texto)}» \`${id}\``
  for (const l of LISTAS_TARJETA) { const t = (c[l] || []).find(x => x.id === id); if (t) return `${l.slice(0, -1)} «${corta(t.titulo || t.texto || t.transcripcion, 30)}» \`${id}\`` }
  return `\`${id}\``
}
const conexionesMd = (d, p, c, s = '') => (c.conexiones || []).map(k => `${s}- \`${k.id}\` ${nombreNodo(d, p, c, k.desde)} → ${nombreNodo(d, p, c, k.hasta)}${k.etiqueta ? ` — ${una(k.etiqueta)}` : ''}`)

function verProyecto(d, p) {
  const L = [`# ${una(p.titulo)} \`${p.id}\``, `Tipo: ${p.tipo} · Área: ${una(p.area) || '—'} · Lienzo: ${p.canvas.modo}${p.canvas.corcho ? ' (corcho)' : ''}`, '']
  if (p.objetivo_general) L.push(`**OG** (\`og\`): ${una(p.objetivo_general)}`)
  p.objetivos_especificos.forEach((t, i) => L.push(`**OE${i + 1}** (\`oe${i + 1}\`): ${una(t)}`))
  if (p.indicadores.length) L.push('', 'Indicadores:', ...p.indicadores.map((t, i) => `  ${i + 1}. ${una(t)}`))
  const citas = d.citas.filter(c => c.proyecto_id === p.id)
  const porF = new Map()
  for (const c of citas) (porF.get(c.fuente_id) ?? porF.set(c.fuente_id, []).get(c.fuente_id)).push(c)
  L.push('', `## Fuentes (${porF.size}) y citas (${citas.length})`)
  for (const [fid, cs] of porF) {
    const f = d.fuentes.find(x => x.id === fid)
    L.push(`- \`${fid}\` ${f ? `${refF(f)} — ${corta(f.titulo, 80)}` : '(fuente borrada)'}`)
    for (const c of cs) L.push(`  - \`${c.id}\` ${c.estado_uso} · ${c.cita_textual_o_parafraseo || ''}${c.pagina != null ? ` · p. ${c.pagina}` : ''}${c.cita_en_texto ? ` · ${c.cita_en_texto}` : ''}${c.contexto ? ` · ${una(c.contexto)}` : ''}`)
  }
  const t = tarjetasMd(p.canvas)
  if (t.length) L.push('', '## Tarjetas del lienzo', ...t)
  if (p.canvas.conexiones.length) L.push('', '## Conexiones', ...conexionesMd(d, p, p.canvas))
  for (const [clave, o] of Object.entries(p.canvas.objetivos || {})) {
    const extra = [
      ...(o.indicadores || []).map(x => `- \`${x.id}\` indicador: ${una(x.texto)}`),
      ...(o.fuentes || []).map(x => { const f = d.fuentes.find(y => y.id === x.id); return `- fuente \`${x.id}\` ${f ? refF(f) : ''}` }),
      ...tarjetasMd(o), ...conexionesMd(d, p, o)
    ]
    if (extra.length) L.push('', `## Sub-lienzo ${clave.toUpperCase()}`, ...extra)
  }
  return L.join('\n')
}

// --- Comandos ---
const C = {}

C.ayuda = () => ok(fs.readFileSync(new URL('../references/comandos.md', import.meta.url), 'utf8'))

C.carpeta = () => {
  if (!pos[0]) return ok(`Carpeta de datos: ${CARPETA}`)
  const r = path.resolve(pos.join(' '))
  if (!fs.existsSync(path.join(r, 'proyectos.json'))) fallar(`${r} no tiene proyectos.json: no parece la carpeta de la app`)
  fs.writeFileSync(CONFIG, r + '\n', 'utf8')
  ok(`Carpeta de datos guardada: ${r}`)
}

C.resumen = () => {
  const d = cargar()
  ok(`Carpeta: ${CARPETA}`)
  const md = ruta('CLAUDE.md')
  ok(fs.existsSync(md) ? `CLAUDE.md de la app: ${fs.statSync(md).mtime.toLocaleString('es-PE')}` : 'Sin CLAUDE.md (la app aún no guardó en esta carpeta con la versión nueva)')
  ok(`${d.proyectos.length} proyectos · ${d.fuentes.length} fuentes · ${d.citas.length} citas`)
  for (const p of d.proyectos) {
    const c = p.canvas, n = l => c[l].length + Object.values(c.objetivos).reduce((s, o) => s + (o[l]?.length || 0), 0)
    ok(`- ${p.id} «${una(p.titulo)}»: ${new Set(d.citas.filter(x => x.proyecto_id === p.id).map(x => x.fuente_id)).size} fuentes, ${n('notas')} notas, ${n('listas')} listas, ${n('audios')} audios, ${n('fotos')} imágenes · objetivos: ${clavesObjetivo(p).join(', ') || '—'}`)
  }
}

C.ver = () => {
  const d = cargar()
  if (op.biblioteca || pos[0] === 'biblioteca') {
    for (const f of [...d.fuentes].sort((a, b) => autorCorto(a).localeCompare(autorCorto(b), 'es')))
      ok(`- \`${f.id}\` ${refF(f)} — ${una(f.titulo)} [${f.tipo_fuente}, ${f.estado_verificacion}]${f.documento_original ? ` 📄 ${f.documento_original}` : ''}`)
    return
  }
  ok(verProyecto(d, buscarProyecto(d, pos[0] || op.proyecto)))
}

C.buscar = () => {
  const d = cargar(), q = normal(pos.join(' ') || fallar('Falta el texto a buscar'))
  const hay = t => normal(t).includes(q)
  for (const f of d.fuentes) if (hay([f.titulo, ...(f.autores || []), f.revista_o_editorial, f.doi_o_url, f.tema, f.entrada_bibliografia].join(' '))) ok(`fuente \`${f.id}\` ${refF(f)} — ${corta(f.titulo)}`)
  for (const c of d.citas) if (hay([c.cita_en_texto, c.contexto].join(' '))) ok(`cita \`${c.id}\` (${c.proyecto_id}, ${c.fuente_id}) ${corta(c.cita_en_texto + ' ' + c.contexto)}`)
  for (const p of d.proyectos) for (const { clave, c } of lienzos(p)) for (const l of LISTAS_TARJETA) for (const t of c[l] || [])
    if (hay([t.titulo, t.texto, t.anotacion, t.transcripcion, ...(t.items || []).map(i => i.t)].join(' '))) ok(`${l.slice(0, -1)} \`${t.id}\` en ${donde(p, clave)}: ${corta(t.titulo || t.texto || t.transcripcion || (t.items || []).map(i => i.t).join('; '))}`)
}

C.obtener = () => {
  const d = cargar(), r = localizar(d, pos[0]) || fallar(`No existe ${pos[0]}`)
  // Los archivos incrustados se resumen: usa "extraer" para verlos.
  ok(JSON.stringify(r.obj, (k, v) => typeof v === 'string' && v.startsWith('data:') ? `${v.slice(0, 40)}… (${Math.round(v.length / 1024)} KB, usa extraer)` : v, 2))
}

C['proyecto-nuevo'] = () => {
  const d = cargar(), j = leerJsonOp('json') || fallar('Falta --json con titulo, objetivo_general, objetivos_especificos, indicadores')
  if (!j.titulo) fallar('El proyecto necesita "titulo"')
  const p = { id: nuevoId(d, 'proyectos'), tipo: 'tesis', area: '', objetivo_general: '', objetivos_especificos: [], indicadores: [], ...j, actualizado: ahoraISO() }
  d.proyectos.push(p)
  guardar(d, ['proyectos'])
  ok(`Proyecto creado: ${p.id}`); aviso()
}

function crearFuente(d, j) {
  if (!j.titulo) fallar('La fuente necesita "titulo"')
  enLista(j.tipo_fuente, TIPOS_FUENTE, 'tipo_fuente'); enLista(j.estado_verificacion, ESTADOS_VERIF, 'estado_verificacion')
  const doi = s => (/10\.\d{4,9}\/\S+/i.exec(s || '') || [])[0]?.toLowerCase()
  const dup = d.fuentes.find(f => (doi(j.doi_o_url) && doi(f.doi_o_url) === doi(j.doi_o_url)) || (normal(f.titulo) === normal(j.titulo) && String(f.anio) === String(j.anio)))
  if (dup && !op.forzar) { ok(`Ya existe: ${dup.id} ${refF(dup)} (usa --forzar para duplicarla)`); return dup }
  const f = {
    id: nuevoId(d, 'fuentes'), tipo_fuente: 'otro', autores: [], anio: null, titulo: '', revista_o_editorial: '', doi_o_url: '', idioma: 'es',
    entrada_bibliografia: '', estado_verificacion: 'no_verificado', fuente_verificacion: '', notas_correccion: '', documento_original: null, ...j
  }
  if (typeof f.autores === 'string') f.autores = f.autores.split(/\s*;\s*/).filter(Boolean)
  d.fuentes.push(f)
  ok(`Fuente creada: ${f.id} ${refF(f)}`)
  return f
}

function vincular(d, fid, pid, clave) {
  const p = buscarProyecto(d, pid)
  if (!d.fuentes.some(f => f.id === fid)) fallar(`No existe la fuente ${fid}`)
  if (!d.citas.some(c => c.proyecto_id === p.id && c.fuente_id === fid)) {
    const c = { id: nuevoId(d, 'citas'), proyecto_id: p.id, fuente_id: fid, estado_uso: 'no_revisado', cita_textual_o_parafraseo: 'parafraseo', pagina: null, cita_en_texto: '', contexto: '' }
    d.citas.push(c)
    ok(`Vinculada a ${p.id} (cita ${c.id})`)
  }
  if (clave) {
    const o = subLienzo(p, clave)
    if (!o.fuentes.some(x => x.id === fid)) {
      const y = o.fuentes.length ? Math.max(...o.fuentes.map(x => x.y + 77)) + 24 : -90
      o.fuentes.push({ id: fid, x: 190 + 90, y: Math.round(y) })
      ok(`Vinculada al objetivo ${clave.toUpperCase()}`)
    }
  }
  p.actualizado = ahoraISO()
}

C['fuente-nueva'] = () => {
  const d = cargar(), f = crearFuente(d, leerJsonOp('json') || fallar('Falta --json con los datos de la fuente'))
  if (op.proyecto || op.objetivo) vincular(d, f.id, op.proyecto, op.objetivo)
  guardar(d); aviso()
}

C.vincular = () => {
  const d = cargar()
  vincular(d, pos[0] || fallar('Falta el id de la fuente'), op.proyecto, op.objetivo)
  guardar(d, ['proyectos', 'citas']); aviso()
}

C.desvincular = () => {
  const d = cargar(), fid = pos[0] || fallar('Falta el id de la fuente'), p = buscarProyecto(d, op.proyecto)
  if (op.objetivo) {
    const o = subLienzo(p, op.objetivo)
    o.fuentes = o.fuentes.filter(x => x.id !== fid)
    o.conexiones = o.conexiones.filter(k => k.desde !== fid && k.hasta !== fid)
    guardar(d, ['proyectos'])
    return ok(`Desvinculada de ${op.objetivo.toUpperCase()}`)
  }
  const quitadas = d.citas.filter(c => c.proyecto_id === p.id && c.fuente_id === fid).map(c => c.id)
  d.citas = d.citas.filter(c => !quitadas.includes(c.id))
  limpiarFuenteDeLienzo(p, fid)
  guardar(d, ['proyectos', 'citas'])
  marcarEliminados({ citas: quitadas })
  ok(`Desvinculada de ${p.id} (${quitadas.length} citas borradas)`); aviso()
}

C['cita-nueva'] = () => {
  const d = cargar(), j = leerJsonOp('json') || fallar('Falta --json')
  const p = buscarProyecto(d, j.proyecto_id || op.proyecto)
  if (!d.fuentes.some(f => f.id === j.fuente_id)) fallar(`No existe la fuente ${j.fuente_id}`)
  enLista(j.estado_uso, ESTADOS_USO, 'estado_uso')
  // Si la fuente solo tenía el marcador "sin revisar", se reutiliza (como hace la app).
  const previas = d.citas.filter(c => c.proyecto_id === p.id && c.fuente_id === j.fuente_id)
  const marcador = previas.length === 1 && previas[0].pagina == null && !previas[0].cita_en_texto && !previas[0].contexto ? previas[0] : null
  const c = marcador || { id: nuevoId(d, 'citas') }
  Object.assign(c, { proyecto_id: p.id, fuente_id: j.fuente_id, estado_uso: 'usando', cita_textual_o_parafraseo: 'parafraseo', pagina: null, cita_en_texto: '', contexto: '', ...j, id: c.id })
  if (!marcador) d.citas.push(c)
  p.actualizado = ahoraISO()
  guardar(d, ['proyectos', 'citas'])
  ok(`Cita ${marcador ? 'completada' : 'creada'}: ${c.id}`); aviso()
}

C.documento = () => {
  const d = cargar(), f = d.fuentes.find(x => x.id === pos[0]) || fallar(`No existe la fuente ${pos[0]}`)
  const archivo = pos[1] || fallar('Falta la ruta del documento (PDF, HTML, MD…)')
  if (!fs.existsSync(archivo)) fallar(`No existe ${archivo}`)
  const ext = (path.extname(archivo).slice(1) || 'pdf').toLowerCase(), rel = `fuentes/${f.id}/documento.${ext}`
  fs.mkdirSync(ruta('fuentes', f.id), { recursive: true })
  fs.copyFileSync(archivo, ruta(...rel.split('/')))
  f.documento_original = rel
  f.documento_nombre = path.basename(archivo) // la app muestra este nombre en la zona del documento
  guardar(d, ['fuentes'])
  ok(`Documento adjuntado a ${f.id}: ${rel}`)
  ok('La app lo importa si esa fuente aún no tenía documento en este navegador; si ya tenía uno, reemplázalo desde la ficha de la fuente.')
}

C.nota = () => {
  enLista(op.estilo, ESTILOS, 'estilo'); enLista(op.letra, LETRAS, 'letra'); enLista(op.color, COLORES, 'color')
  nuevaTarjeta('notas', { titulo: op.titulo || '', texto: op.texto || pos.join(' ') || fallar('Falta --texto'), estilo: op.estilo || 'adhesiva', letra: op.letra || 'sans', color: op.color || (op.estilo === 'tarjeta' ? 'celeste' : 'amarillo') })
}

C.lista = () => {
  const tareas = String(op.tareas || '').split('|').map(t => t.trim()).filter(Boolean)
  nuevaTarjeta('listas', { titulo: op.titulo || 'Lista de tareas', items: tareas.map(t => ({ t, hecho: false })) })
}

C.tarea = () => {
  const d = cargar(), r = localizar(d, pos[0])
  if (r?.lista !== 'listas') fallar(`${pos[0]} no es una lista`)
  const it = r.obj.items ||= []
  const n = k => { const i = +op[k] - 1; if (!it[i]) fallar(`La lista tiene ${it.length} tareas`); return i }
  if (op.agregar) String(op.agregar).split('|').forEach(t => t.trim() && it.push({ t: t.trim(), hecho: false }))
  if (op.marcar) it[n('marcar')].hecho = true
  if (op.desmarcar) it[n('desmarcar')].hecho = false
  if (op.quitar) it.splice(n('quitar'), 1)
  if (op.editar) it[n('editar')].t = op.texto || fallar('Falta --texto')
  guardar(d, ['proyectos'])
  ok(`Lista ${r.obj.id}: ${it.filter(x => x.hecho).length}/${it.length} hechas`); aviso()
}

C.imagen = () => {
  const img = cargarImagen(pos[0] || fallar('Falta la ruta de la imagen'))
  nuevaTarjeta('fotos', { titulo: op.titulo || path.basename(pos[0]).replace(/\.[^.]+$/, ''), texto: op.texto || '', anotacion: op.anotacion || '', ...img, trazos: [] })
}

C.grafico = () => {
  const tipo = pos[0] || fallar('Falta el tipo: barras, barras-h, lineas, dona, dispersion')
  const datos = leerJsonOp('datos') || fallar('Falta --datos (o --datos-archivo)')
  const svg = grafico(tipo, datos, { titulo: op.titulo, subtitulo: op.subtitulo, fuente: op.fuente, unidad: op.unidad || '', ejeX: op['eje-x'], ejeY: op['eje-y'], valores: !!op.valores, total: op.total, desdeCero: !!op['desde-cero'], coma: !!op.coma, decimales: op.decimales !== undefined ? +op.decimales : null })
  const archivo = op.guardar || path.join(process.env.TEMP || '.', `grafico-${Date.now()}.svg`)
  fs.writeFileSync(archivo, svg, 'utf8')
  if (op.guardar || op['solo-archivo']) ok(`SVG: ${archivo}`)
  if (op['solo-archivo']) return
  const img = cargarImagen(archivo)
  if (!op.guardar) fs.rmSync(archivo, { force: true })
  nuevaTarjeta('fotos', { titulo: op.titulo || 'Gráfico', texto: op.texto || '', anotacion: op.anotacion || '', ...img, trazos: [] })
}

C.conectar = () => {
  const d = cargar()
  // Sin --objetivo, se usa el lienzo donde ya está alguna de las tarjetas (principal o sub-lienzo).
  if (!op.objetivo) for (const id of pos) { const r = localizar(d, id); if (r?.tipo === 'tarjeta' && r.clave) { op.objetivo = r.clave; op.proyecto ||= r.proyecto.id; break } }
  const { p, clave, c } = destino(d)
  const [desde, hasta] = pos
  if (!desde || !hasta) fallar('Uso: conectar <desde> <hasta> [--etiqueta …]')
  const existe = id => id === (clave ? 'objetivo' : 'hub') || d.fuentes.some(f => f.id === id) || (c.indicadores || []).some(x => x.id === id) || LISTAS_TARJETA.some(l => (c[l] || []).some(x => x.id === id))
  for (const id of [desde, hasta]) if (!existe(id)) fallar(`${id} no está en el lienzo ${donde(p, clave)} (usa "${clave ? 'objetivo' : 'hub'}" para la tarjeta central)`)
  const k = { id: idLocal('con'), desde, hasta, etiqueta: op.etiqueta || '' }
  c.conexiones.push(k)
  guardar(d, ['proyectos'])
  ok(`Conexión ${k.id}: ${desde} → ${hasta}`); aviso()
}

C.indicador = () => {
  const d = cargar(), { p, clave, c } = destino(d)
  if (!clave) fallar('Indica el objetivo con --objetivo oe1')
  const arg = pos.join(' ')
  const texto = /^\d+$/.test(arg) ? p.indicadores[+arg - 1] : p.indicadores.find(t => normal(t) === normal(arg))
  if (!texto) fallar(`Indicador no encontrado. Indicadores del proyecto:\n${p.indicadores.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}\n(agrégalo antes con: editar ${p.id} --json '{"indicadores":[…]}')`)
  if (c.indicadores.some(x => x.texto === texto)) return ok('Ya estaba vinculado')
  const y = c.indicadores.length ? Math.max(...c.indicadores.map(x => x.y + 80)) + 24 : -90
  c.indicadores.push({ id: idLocal('ind'), texto, x: -190 - 210 - 90, y: Math.round(y) })
  guardar(d, ['proyectos'])
  ok(`Indicador vinculado a ${clave.toUpperCase()}: ${texto}`); aviso()
}

C.editar = () => {
  const d = cargar(), r = localizar(d, pos[0]) || fallar(`No existe ${pos[0]}`)
  const j = leerJsonOp('json') || fallar('Falta --json con los campos a cambiar')
  delete j.id
  if (r.tipo === 'fuente') { enLista(j.tipo_fuente, TIPOS_FUENTE, 'tipo_fuente'); enLista(j.estado_verificacion, ESTADOS_VERIF, 'estado_verificacion') }
  if (r.tipo === 'cita') enLista(j.estado_uso, ESTADOS_USO, 'estado_uso')
  if (r.tipo === 'proyecto' && j.canvas) fallar('No edites canvas directamente: usa los comandos de tarjetas, conectar, mover o borrar')
  if (r.tipo === 'proyecto' && (j.objetivos_especificos || j.objetivo_general !== undefined))
    ok('Ojo: los sub-lienzos van por posición (oe1, oe2…). Si reordenas o borras objetivos, revisa que cada sub-lienzo siga en su objetivo.')
  Object.assign(r.obj, j)
  if (r.tipo === 'proyecto') r.obj.actualizado = ahoraISO()
  guardar(d)
  ok(`Editado ${r.obj.id}: ${Object.keys(j).join(', ')}`); aviso()
}

C.mover = () => {
  const d = cargar(), [id, x, y] = pos
  const r = localizar(d, id)
  if (r?.tipo === 'tarjeta') Object.assign(r.obj, { x: +x, y: +y })
  else {
    const p = buscarProyecto(d, op.proyecto)
    if (op.objetivo) { const o = subLienzo(p, op.objetivo); const e = [...o.fuentes, ...o.indicadores].find(z => z.id === id) || fallar(`${id} no está en ${op.objetivo}`); Object.assign(e, { x: +x, y: +y }) }
    else if (d.fuentes.some(f => f.id === id)) { p.canvas.modo = 'libre'; p.canvas.posiciones[id] = { x: +x, y: +y }; ok('El lienzo pasa a modo Libre') }
    else fallar(`No se puede mover ${id}`)
  }
  guardar(d, ['proyectos']); ok(`Movido ${id} a (${x}, ${y})`)
}

function limpiarFuenteDeLienzo(p, fid) {
  const c = p.canvas
  delete c.posiciones[fid]
  c.conexiones = c.conexiones.filter(k => k.desde !== fid && k.hasta !== fid)
  for (const o of Object.values(c.objetivos)) {
    o.fuentes = (o.fuentes || []).filter(x => x.id !== fid)
    o.conexiones = (o.conexiones || []).filter(k => k.desde !== fid && k.hasta !== fid)
  }
}

C.borrar = () => {
  const d = cargar(), id = pos[0], r = localizar(d, id) || fallar(`No existe ${id}`)
  if (r.tipo === 'tarjeta') {
    r.lienzo[r.lista] = r.lienzo[r.lista].filter(x => x.id !== id)
    r.lienzo.conexiones = (r.lienzo.conexiones || []).filter(k => k.desde !== id && k.hasta !== id)
    guardar(d, ['proyectos'])
  } else if (r.tipo === 'conexion') {
    r.lienzo.conexiones = r.lienzo.conexiones.filter(k => k.id !== id)
    guardar(d, ['proyectos'])
  } else if (r.tipo === 'cita') {
    d.citas = d.citas.filter(c => c.id !== id)
    guardar(d, ['citas']); marcarEliminados({ citas: [id] })
  } else if (r.tipo === 'fuente') {
    const citas = d.citas.filter(c => c.fuente_id === id).map(c => c.id)
    d.citas = d.citas.filter(c => c.fuente_id !== id)
    d.fuentes = d.fuentes.filter(f => f.id !== id)
    for (const p of d.proyectos) limpiarFuenteDeLienzo(p, id)
    guardar(d); marcarEliminados({ fuentes: [id], citas })
  } else if (r.tipo === 'proyecto') {
    if (!op.confirmar) fallar(`Borrar el proyecto ${id} elimina también sus citas y su lienzo. Repite con --confirmar si el usuario lo pidió.`)
    const citas = d.citas.filter(c => c.proyecto_id === id).map(c => c.id)
    d.citas = d.citas.filter(c => c.proyecto_id !== id)
    d.proyectos = d.proyectos.filter(p => p.id !== id)
    guardar(d); marcarEliminados({ proyectos: [id], citas })
  }
  ok(`Borrado ${r.tipo} ${id}`); aviso()
}

C.extraer = () => {
  const d = cargar(), id = pos[0], r = localizar(d, id) || fallar(`No existe ${id}`)
  const dir = op.a || path.join(process.env.TEMP || '.', 'canvas-extraido')
  if (r.tipo === 'fuente') {
    if (!r.obj.documento_original) fallar(`${id} no tiene documento`)
    const f = ruta(...r.obj.documento_original.split('/'))
    return ok(fs.existsSync(f) ? `Documento: ${f}` : `El documento aún no está en la carpeta (${r.obj.documento_original}); ábrelo desde la app para que lo guarde.`)
  }
  if (r.tipo !== 'tarjeta' || !['fotos', 'audios'].includes(r.lista)) fallar('Solo se extraen imágenes, notas de voz o documentos de fuentes')
  const src = r.lista === 'fotos' ? r.obj.imagen : r.obj.audio
  ok(`Archivo: ${extraerDataURL(src, path.join(dir, id))}`)
  if (r.obj.trazos?.length) ok(`(tiene ${r.obj.trazos.length} trazos dibujados encima que no están en el archivo)`)
}

// --- Ejecutar ---
try {
  const f = C[cmd] || fallar(`Comando desconocido "${cmd}". Usa: ${Object.keys(C).join(', ')}`)
  f()
} catch (e) {
  console.error('Error: ' + e.message)
  process.exit(1)
}
