// Reglas de formato (manual UPC "La primera cita", APA 6 en español) y etiquetas.
export const TIPOS_FUENTE = {
  articulo_cientifico: 'Artículo científico',
  libro: 'Libro',
  capitulo_libro: 'Capítulo de libro',
  normativa_tecnica: 'Normativa técnica',
  otro: 'Otro'
}
export const ESTADOS_USO = {
  usando: 'Usando en el texto',
  revisado_no_usado: 'Revisado, no usado',
  no_revisado: 'Sin revisar'
}
export const ESTADOS_VERIF = {
  verificado: 'Verificado',
  dudoso: 'Verificado parcial',
  no_verificado: 'No verificado'
}
export const TIPOS_PROYECTO = { tesis: 'Tesis', otro: 'Trabajo' }

const RANGO = { usando: 3, revisado_no_usado: 2, no_revisado: 1 }

/** Estado de una fuente dentro de un proyecto: el "mejor" estado entre sus citas. */
export function estadoDeCitas(citas) {
  let e = 'no_revisado'
  for (const c of citas) if ((RANGO[c.estado_uso] || 0) > RANGO[e]) e = c.estado_uso
  return e
}

/** Cita "vacía" que solo vincula una fuente a un proyecto (sin revisar todavía). */
export const esMarcador = c => c.pagina == null && !c.cita_en_texto && !c.contexto

export const apellido = a => String(a || '').split(',')[0].trim()

/** Entre paréntesis: "García", "García & López", "Pinto, Jáuregui, & Mori", "Morrison et al." */
export function autoresEnTexto(autores, primeraVez = true) {
  const ap = (autores || []).map(apellido).filter(Boolean)
  if (!ap.length) return 'Anónimo'
  if (ap.length === 1) return ap[0]
  if (ap.length === 2) return `${ap[0]} & ${ap[1]}`
  if (ap.length <= 5 && primeraVez) return `${ap.slice(0, -1).join(', ')}, & ${ap.at(-1)}`
  return `${ap[0]} et al.`
}

/** Etiqueta corta para nodos: "Villarreal", "Paulay & Priestley", "Priestley et al." */
export function autorCorto(f) {
  const ap = (f?.autores || []).map(apellido).filter(Boolean)
  if (!ap.length) return f?.titulo?.split(' ').slice(0, 3).join(' ') || 'Sin autor'
  if (ap.length === 1) return ap[0]
  if (ap.length === 2) return `${ap[0]} & ${ap[1]}`
  return `${ap[0]} et al.`
}

export const anio = f => f?.anio ?? 's. f.'

export function paginaTexto(p) {
  if (p === null || p === undefined || p === '') return ''
  return /[-–]/.test(String(p)) ? `pp. ${p}` : `p. ${p}`
}

export function sugerirCitaEnTexto(fuente, cita) {
  const pag = paginaTexto(cita?.pagina)
  return `(${autoresEnTexto(fuente?.autores)}, ${anio(fuente)}${pag ? ', ' + pag : ''})`
}

export function sugerirBibliografia(f) {
  const a = f.autores || []
  let autores
  if (a.length === 0) autores = ''
  else if (a.length === 1) autores = a[0]
  else if (a.length <= 6) autores = `${a.slice(0, -1).join(', ')}, & ${a.at(-1)}`
  else autores = `${a.slice(0, 4).join(', ')}, . . . ${a.at(-1)}`
  const partes = [autores ? `${autores} (${anio(f)}).` : `${f.titulo || ''} (${anio(f)}).`]
  if (autores && f.titulo) partes.push(`${f.titulo}.`)
  if (f.revista_o_editorial) partes.push(`${f.revista_o_editorial}.`)
  const doi = extraerDoi(f.doi_o_url)
  if (doi) partes.push(`https://doi.org/${doi}`)
  else if (f.doi_o_url) partes.push(`Recuperado de ${f.doi_o_url}`)
  return partes.join(' ').replace(/\.\.(?!\.)/g, '.')
}

export function extraerDoi(v) {
  const m = /(10\.\d{4,9}\/\S+)/.exec(String(v || ''))
  return m ? m[1] : ''
}

export function urlFuente(f) {
  const doi = extraerDoi(f?.doi_o_url)
  if (doi) return `https://doi.org/${doi}`
  return /^https?:\/\//.test(f?.doi_o_url || '') ? f.doi_o_url : ''
}

// --- BibTeX (misma clave y mapeo que scripts/gestionar_citas.py de la skill) ---
const TIPO_BIB = { articulo_cientifico: 'article', libro: 'book', capitulo_libro: 'incollection', normativa_tecnica: 'techreport', otro: 'misc' }
const sinTildes = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '')

function claveBib(f) {
  const ap = sinTildes(apellido(f.autores?.[0] || 'sinautor').toLowerCase()).replace(/[^a-z0-9]/g, '')
  const palabra = sinTildes((f.titulo || '').split(' ')[0].toLowerCase()).replace(/[^a-z0-9]/g, '')
  return `${ap}${f.anio ?? 's_f'}${palabra}`
}

export function aBibtex(fuentes) {
  const usadas = new Set()
  return fuentes.map(f => {
    const tipo = TIPO_BIB[f.tipo_fuente] || 'misc'
    const base = claveBib(f)
    let clave = base, n = 0
    while (usadas.has(clave)) clave = base + String.fromCharCode(97 + n++)
    usadas.add(clave)
    const campos = [['author', (f.autores || []).join(' and ')], ['title', f.titulo]]
    if (f.revista_o_editorial) campos.push([tipo === 'article' ? 'journal' : 'publisher', f.revista_o_editorial])
    campos.push(['year', f.anio ?? ''])
    const doi = extraerDoi(f.doi_o_url)
    if (doi) campos.push(['doi', doi])
    else if (f.doi_o_url) campos.push(['url', f.doi_o_url])
    return `@${tipo}{${clave},\n${campos.map(([k, v]) => `  ${k.padEnd(7)} = {${v ?? ''}}`).join(',\n')}\n}\n`
  }).join('\n')
}

export function haceCuanto(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
  for (const [u, seg] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]])
    if (s >= seg) return rtf.format(-Math.floor(s / seg), u)
  return 'justo ahora'
}

export const normalizar = s => sinTildes(String(s ?? '').toLowerCase())

export function coincide(f, q) {
  if (!q) return true
  const t = normalizar([f.titulo, f.anio, f.revista_o_editorial, f.tema, ...(f.autores || []), ...(f.etiquetas || [])].join(' '))
  return normalizar(q).split(/\s+/).every(p => t.includes(p))
}
