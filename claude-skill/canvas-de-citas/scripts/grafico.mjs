// Gráficos SVG estáticos para el lienzo (se insertan como tarjeta de foto). Sin librerías.
// Paleta categórica validada (skill dataviz, modo claro), en orden fijo; nunca se cicla.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const C = { fondo: '#FBFAF6', tinta: '#211F1A', tinta2: '#6B6559', rejilla: '#E6E0D2', eje: '#B9B1A0' }
const FUENTE = "'Segoe UI', Arial, Helvetica, sans-serif"
const W = 760, H = 460

const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Formato de números: --decimales n fija los decimales; --coma usa coma decimal.
let FMT = { coma: false, decimales: null }
const fmt = (v, unidad = '') => {
  let t
  if (FMT.decimales !== null) t = v.toFixed(FMT.decimales)
  else t = Math.abs(v) >= 1000 ? String(Math.round(v)) : String(+v.toFixed(Math.abs(v) < 10 ? 2 : 1))
  if (Math.abs(v) >= 1000) t = t.replace(/\B(?=(\d{3})+(?!\d))/g, FMT.coma ? '.' : ',')
  if (FMT.coma) t = t.replace(/\.(\d+)$/, ',$1')
  return `${t}${unidad}`
}

/** Divisiones "redondas" del eje (1, 2, 2.5, 5 × 10^n). */
function divisiones(min, max, n = 5) {
  if (min === max) { max = min + 1 }
  const bruto = (max - min) / n, mag = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map(k => k * mag).find(p => p >= bruto)
  const ini = Math.floor(min / paso) * paso, fin = Math.ceil(max / paso) * paso
  const l = []
  for (let v = ini; v <= fin + paso / 2; v += paso) l.push(+v.toFixed(10))
  return l
}

function marco(o, cuerpo, altoExtra = 0) {
  const pie = o.fuente ? `<text x="24" y="${H + altoExtra - 14}" font-size="11.5" fill="${C.tinta2}">Fuente: ${esc(o.fuente)}</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + altoExtra}" width="${W}" height="${H + altoExtra}" font-family="${FUENTE}">
<rect width="${W}" height="${H + altoExtra}" fill="${C.fondo}"/>
<text x="24" y="36" font-size="19" font-weight="600" fill="${C.tinta}">${esc(o.titulo || '')}</text>
${o.subtitulo ? `<text x="24" y="58" font-size="13" fill="${C.tinta2}">${esc(o.subtitulo)}</text>` : ''}
${cuerpo}
${pie}
</svg>`
}

/** Leyenda en una fila bajo el título (solo con 2 o más series). */
function leyenda(nombres, y) {
  if (nombres.length < 2) return ''
  let x = 24
  return nombres.map((n, i) => {
    const s = `<rect x="${x}" y="${y - 9}" width="12" height="12" rx="3" fill="${SERIES[i]}"/><text x="${x + 18}" y="${y + 1}" font-size="12.5" fill="${C.tinta}">${esc(n)}</text>`
    x += 18 + n.length * 7.2 + 22
    return s
  }).join('')
}

function normalizarSeries(d) {
  const series = d.series || [{ nombre: d.nombre || '', valores: d.valores || [] }]
  if (series.length > SERIES.length) throw new Error(`Máximo ${SERIES.length} series: agrupa el resto en "Otros" o haz varios gráficos`)
  return series.map(s => ({ nombre: s.nombre || '', valores: s.valores.map(Number) }))
}

/** Rectángulo con las esquinas del extremo de datos redondeadas (4 px), anclado a la base. */
function barra(x, y, w, h, color, horizontal = false) {
  const r = Math.min(4, w / 2, Math.abs(h) / 2)
  if (h <= 0.5) return ''
  if (horizontal) return `<path d="M${x} ${y}h${h - r}q${r} 0 ${r} ${r}v${w - 2 * r}q0 ${r} ${-r} ${r}h${-(h - r)}z" fill="${color}"/>`
  return `<path d="M${x} ${y + h}v${-(h - r)}q0 ${-r} ${r} ${-r}h${w - 2 * r}q${r} 0 ${r} ${r}v${h - r}z" fill="${color}"/>`
}

function barras(d, o) {
  const series = normalizarSeries(d), etq = d.etiquetas || series[0].valores.map((_, i) => String(i + 1))
  const todos = series.flatMap(s => s.valores)
  const ticks = divisiones(Math.min(0, ...todos), Math.max(0, ...todos))
  const top = series.length > 1 ? 96 : 80, izq = 64, der = 24, abajo = o.fuente ? 76 : 56
  const aw = W - izq - der, ah = H - top - abajo
  const y = v => top + ah - ((v - ticks[0]) / (ticks.at(-1) - ticks[0])) * ah
  const grupo = aw / etq.length, bw = Math.max(3, Math.min(56, (grupo * 0.72) / series.length - 2))
  const maxV = Math.max(...todos)
  let s = leyenda(series.map(x => x.nombre), 78)
  for (const t of ticks) s += `<line x1="${izq}" x2="${W - der}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? C.eje : C.rejilla}" stroke-width="1"/><text x="${izq - 8}" y="${y(t) + 4}" font-size="11.5" text-anchor="end" fill="${C.tinta2}">${fmt(t, o.unidad)}</text>`
  etq.forEach((e, i) => {
    const x0 = izq + i * grupo + (grupo - series.length * (bw + 2) + 2) / 2
    series.forEach((se, k) => {
      const v = se.valores[i] ?? 0, x = x0 + k * (bw + 2)
      s += barra(x, Math.min(y(v), y(0)), bw, Math.abs(y(v) - y(0)), SERIES[k])
      if (o.valores || (series.length === 1 && v === maxV)) s += `<text x="${x + bw / 2}" y="${y(v) - 6}" font-size="11.5" text-anchor="middle" fill="${C.tinta}">${fmt(v, o.unidad)}</text>`
    })
    s += `<text x="${izq + i * grupo + grupo / 2}" y="${top + ah + 18}" font-size="12" text-anchor="middle" fill="${C.tinta2}">${esc(e)}</text>`
  })
  if (o.ejeY) s += `<text transform="translate(16 ${top + ah / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${C.tinta2}">${esc(o.ejeY)}</text>`
  if (o.ejeX) s += `<text x="${izq + aw / 2}" y="${top + ah + 40}" font-size="12" text-anchor="middle" fill="${C.tinta2}">${esc(o.ejeX)}</text>`
  return marco(o, s)
}

function barrasH(d, o) {
  const series = normalizarSeries(d), etq = d.etiquetas || []
  const todos = series.flatMap(s => s.valores)
  const ticks = divisiones(Math.min(0, ...todos), Math.max(0, ...todos))
  const fila = Math.max(26, series.length * 16 + 10), top = series.length > 1 ? 96 : 80
  const alto = top + etq.length * fila + (o.fuente ? 70 : 44)
  const izq = Math.min(300, 24 + Math.max(...etq.map(e => String(e).length)) * 6.8), der = 56, aw = W - izq - der
  const x = v => izq + ((v - ticks[0]) / (ticks.at(-1) - ticks[0])) * aw
  const bh = Math.max(8, (fila - 8) / series.length - 2)
  let s = leyenda(series.map(z => z.nombre), 78)
  for (const t of ticks) s += `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${top + etq.length * fila}" stroke="${t === 0 ? C.eje : C.rejilla}"/><text x="${x(t)}" y="${top + etq.length * fila + 18}" font-size="11.5" text-anchor="middle" fill="${C.tinta2}">${fmt(t, o.unidad)}</text>`
  etq.forEach((e, i) => {
    const y0 = top + i * fila + (fila - series.length * (bh + 2)) / 2
    s += `<text x="${izq - 10}" y="${top + i * fila + fila / 2 + 4}" font-size="12.5" text-anchor="end" fill="${C.tinta}">${esc(e)}</text>`
    series.forEach((se, k) => {
      const v = se.valores[i] ?? 0, yy = y0 + k * (bh + 2)
      s += barra(Math.min(x(v), x(0)), yy, bh, Math.abs(x(v) - x(0)), SERIES[k], true)
      if (o.valores || series.length === 1) s += `<text x="${x(v) + 6}" y="${yy + bh / 2 + 4}" font-size="11.5" fill="${C.tinta}">${fmt(v, o.unidad)}</text>`
    })
  })
  return marco(o, s, alto - H)
}

function lineas(d, o) {
  const series = normalizarSeries(d), etq = d.etiquetas || series[0].valores.map((_, i) => String(i + 1))
  const todos = series.flatMap(s => s.valores.filter(Number.isFinite))
  const ticks = divisiones(o.desdeCero ? Math.min(0, ...todos) : Math.min(...todos), Math.max(...todos))
  const directas = series.length > 1 && series.length <= 4
  const top = series.length > 1 ? 96 : 80, izq = 64, der = directas ? 130 : 30, abajo = o.fuente ? 76 : 56
  const aw = W - izq - der, ah = H - top - abajo
  const x = i => izq + (etq.length === 1 ? aw / 2 : (i / (etq.length - 1)) * aw)
  const y = v => top + ah - ((v - ticks[0]) / (ticks.at(-1) - ticks[0])) * ah
  let s = leyenda(series.map(z => z.nombre), 78)
  for (const t of ticks) s += `<line x1="${izq}" x2="${izq + aw}" y1="${y(t)}" y2="${y(t)}" stroke="${C.rejilla}"/><text x="${izq - 8}" y="${y(t) + 4}" font-size="11.5" text-anchor="end" fill="${C.tinta2}">${fmt(t, o.unidad)}</text>`
  const cada = Math.ceil(etq.length / 12)
  etq.forEach((e, i) => { if (i % cada === 0) s += `<text x="${x(i)}" y="${top + ah + 18}" font-size="12" text-anchor="middle" fill="${C.tinta2}">${esc(e)}</text>` })
  series.forEach((se, k) => {
    const pts = se.valores.map((v, i) => [x(i), y(v)]).filter((_, i) => Number.isFinite(se.valores[i]))
    s += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${SERIES[k]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    if (pts.length <= 24) for (const [px, py] of pts) s += `<circle cx="${px}" cy="${py}" r="4" fill="${SERIES[k]}" stroke="${C.fondo}" stroke-width="2"/>`
    const [ux, uy] = pts.at(-1) || [0, 0]
    if (directas) s += `<text x="${ux + 10}" y="${uy + 4}" font-size="12" fill="${C.tinta}">${esc(se.nombre)}</text>`
    if (o.valores || series.length === 1) s += `<text x="${ux}" y="${uy - 10}" font-size="11.5" text-anchor="middle" fill="${C.tinta}">${fmt(se.valores.at(-1), o.unidad)}</text>`
  })
  if (o.ejeY) s += `<text transform="translate(16 ${top + ah / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${C.tinta2}">${esc(o.ejeY)}</text>`
  if (o.ejeX) s += `<text x="${izq + aw / 2}" y="${top + ah + 40}" font-size="12" text-anchor="middle" fill="${C.tinta2}">${esc(o.ejeX)}</text>`
  return marco(o, s)
}

function dona(d, o) {
  let etq = [...(d.etiquetas || [])], val = (d.valores || []).map(Number)
  // Más de 6 partes no se leen en una dona: el resto se agrupa en "Otros".
  if (val.length > 6) {
    const orden = val.map((v, i) => [v, etq[i]]).sort((a, b) => b[0] - a[0])
    const resto = orden.slice(5).reduce((s, [v]) => s + v, 0)
    etq = [...orden.slice(0, 5).map(x => x[1]), 'Otros']; val = [...orden.slice(0, 5).map(x => x[0]), resto]
  }
  const total = val.reduce((s, v) => s + v, 0) || 1
  const cx = 230, cy = 260, R = 150, r = 92
  let a = -Math.PI / 2, s = ''
  val.forEach((v, i) => {
    const b = a + (v / total) * Math.PI * 2, largo = b - a > Math.PI ? 1 : 0
    const p = (ang, rad) => `${cx + Math.cos(ang) * rad} ${cy + Math.sin(ang) * rad}`
    if (v > 0) s += `<path d="M${p(a, R)}A${R} ${R} 0 ${largo} 1 ${p(b, R)}L${p(b, r)}A${r} ${r} 0 ${largo} 0 ${p(a, r)}Z" fill="${SERIES[i]}" stroke="${C.fondo}" stroke-width="2"/>`
    a = b
  })
  s += `<text x="${cx}" y="${cy - 4}" font-size="26" font-weight="600" text-anchor="middle" fill="${C.tinta}">${fmt(total, o.unidad)}</text><text x="${cx}" y="${cy + 18}" font-size="12" text-anchor="middle" fill="${C.tinta2}">${esc(o.total || 'total')}</text>`
  val.forEach((v, i) => {
    const y = 150 + i * 34
    s += `<rect x="440" y="${y - 11}" width="14" height="14" rx="3" fill="${SERIES[i]}"/><text x="462" y="${y + 1}" font-size="13.5" fill="${C.tinta}">${esc(etq[i])}</text><text x="${W - 30}" y="${y + 1}" font-size="13.5" text-anchor="end" fill="${C.tinta2}">${fmt(v, o.unidad)} · ${Math.round((v / total) * 100)}%</text>`
  })
  return marco(o, s)
}

function dispersion(d, o) {
  const series = d.series || [{ nombre: '', puntos: d.puntos || [] }]
  // Con todos los pares en juego, solo los 3 primeros colores son distinguibles (skill dataviz).
  if (series.length > 3) throw new Error('Dispersión: máximo 3 series; haz varios gráficos')
  const xs = series.flatMap(z => z.puntos.map(p => +p[0])), ys = series.flatMap(z => z.puntos.map(p => +p[1]))
  const tx = divisiones(Math.min(...xs), Math.max(...xs)), ty = divisiones(Math.min(...ys), Math.max(...ys))
  const top = series.length > 1 ? 96 : 80, izq = 64, der = 30, abajo = o.fuente ? 84 : 64
  const aw = W - izq - der, ah = H - top - abajo
  const x = v => izq + ((v - tx[0]) / (tx.at(-1) - tx[0])) * aw, y = v => top + ah - ((v - ty[0]) / (ty.at(-1) - ty[0])) * ah
  let s = leyenda(series.map(z => z.nombre), 78)
  for (const t of ty) s += `<line x1="${izq}" x2="${izq + aw}" y1="${y(t)}" y2="${y(t)}" stroke="${C.rejilla}"/><text x="${izq - 8}" y="${y(t) + 4}" font-size="11.5" text-anchor="end" fill="${C.tinta2}">${fmt(t)}</text>`
  for (const t of tx) s += `<text x="${x(t)}" y="${top + ah + 18}" font-size="11.5" text-anchor="middle" fill="${C.tinta2}">${fmt(t)}</text>`
  series.forEach((se, k) => { for (const [px, py] of se.puntos) s += `<circle cx="${x(+px)}" cy="${y(+py)}" r="4.5" fill="${SERIES[k]}" fill-opacity=".85" stroke="${C.fondo}" stroke-width="2"/>` })
  if (o.ejeY) s += `<text transform="translate(16 ${top + ah / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${C.tinta2}">${esc(o.ejeY)}</text>`
  if (o.ejeX) s += `<text x="${izq + aw / 2}" y="${top + ah + 42}" font-size="12" text-anchor="middle" fill="${C.tinta2}">${esc(o.ejeX)}</text>`
  return marco(o, s)
}

export const TIPOS = { barras, 'barras-h': barrasH, lineas, dona, pastel: dona, dispersion }

/** Devuelve el SVG de un gráfico. `datos` según el tipo (ver SKILL.md); `o`: titulo, subtitulo, fuente, unidad, ejeX, ejeY, valores. */
export function grafico(tipo, datos, o = {}) {
  FMT = { coma: !!o.coma, decimales: Number.isFinite(o.decimales) ? o.decimales : null }
  const f = TIPOS[tipo]
  if (!f) throw new Error(`Tipo de gráfico desconocido: ${tipo}. Usa: ${Object.keys(TIPOS).join(', ')}`)
  return f(datos, o)
}
