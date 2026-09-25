// Funciones puras sobre el texto de un paper (sin navegador ni estado): separar la bibliografía,
// sacar el DOI y los datos aproximados de una referencia. Probadas en tests/unit.

const TITULO = /^(?:#+\s*)?(?:\d+\.?\s*)?(references|referencias|bibliograf[íi]a|literature cited|works cited|reference list|lista de referencias|referencias bibliogr[áa]ficas)\s*:?\s*$/i

/** Separa la sección de referencias de un texto en entradas. */
export function separarReferencias(texto) {
  const lineas = texto.replace(/\r/g, '').split('\n')
  let ini = -1
  for (let i = lineas.length - 1; i >= 0; i--) if (TITULO.test(lineas[i].trim())) { ini = i; break }
  let t
  if (ini >= 0) t = lineas.slice(ini + 1).join('\n')
  else {
    const m = [...texto.matchAll(/\b(References|REFERENCES|Referencias|REFERENCIAS|Bibliografía|BIBLIOGRAFÍA)\b\s+(?=[A-ZÁÉÍÓÚ[\d])/g)].at(-1)
    if (!m) return []
    t = texto.slice(m.index + m[0].length)
  }
  t = t.replace(/\s+/g, ' ').trim().replace(/([\w)(/.:])-\s(\d)/g, '$1-$2')
  const numeradas = t.split(/\s(?=\[\d{1,3}\]\s)/)
  const autor = "[A-ZÁÉÍÓÚÑ][\\p{L}'’-]+"
  const inicio = new RegExp(`(?<=[.)\\]]|\\d{4}[a-z]?\\)?\\.?|https?:\\/\\/\\S+)\\s+(?=(?:${autor}(?:\\s[A-Z][\\p{L}'’-]+)?,\\s(?:[A-Z]\\.\\s?)+|[A-ZÁÉÍÓÚ][A-Z&.\\s]{2,}\\.\\s\\(|${autor},\\s[A-Z]\\p{L}+))`, 'u')
  const partes = numeradas.length > 4 ? numeradas : t.split(inicio)
  return partes.map(x => x.trim()).filter(x => x.length > 25 && /(19|20)\d{2}|s\.\s?f\./.test(x)).slice(0, 400)
}

export function doiDe(ref) {
  let d = (/10\.\d{4,9}\/[^\s,;]+/.exec(ref) || [])[0]?.replace(/\.+$/, '')
  while (d && d.endsWith(')') && (d.match(/\(/g) || []).length < (d.match(/\)/g) || []).length) d = d.slice(0, -1)
  return d || null
}

/** Datos aproximados de una referencia (se revisan en el formulario antes de guardar). */
export function analizarReferencia(ref) {
  const limpia = ref.replace(/^\[\d+\]\s*/, '')
  const a = /^(.*?)[\s.,(]+((?:19|20)\d{2})[a-z]?\)?[.,]?\s+(.*)$/.exec(limpia)
  const doi = doiDe(limpia)
  if (!a) return { titulo: limpia.slice(0, 200), doi_o_url: doi ? `https://doi.org/${doi}` : '' }
  const autores = a[1].split(/;|,\s(?=[A-ZÁÉÍÓÚ][\p{L}'’-]+,)|\s&\s|\sand\s|\sy\s/u).map(s => s.replace(/^[,&\s]+|[,\s]+$/g, '').trim()).filter(s => s.length > 1).slice(0, 12)
  const titulo = (/^(.+?[.?!])(\s|$)/.exec(a[3]) || [, a[3]])[1].replace(/\.$/, '').trim()
  return { autores, anio: +a[2], titulo, doi_o_url: doi ? `https://doi.org/${doi}` : '' }
}
