// Acción `use:autocompletar={{ sugerir }}` para inputs y textareas: al escribir "#algo" o "@algo"
// muestra sugerencias bajo el campo; ↑/↓ elige, Enter o Tab inserta, Esc cierra.
const PALABRA = /(^|[^\p{L}\p{N}/.@&])([#@])(\p{L}[\p{L}\p{N}_.-]*)?$/u

export function autocompletar(nodo, opciones) {
  let sugerir = opciones.sugerir
  let caja = null, lista = [], activa = 0, rango = null

  const cerrar = () => { caja?.remove(); caja = null; lista = [] }

  function palabra() {
    const fin = nodo.selectionStart
    if (fin == null || fin !== nodo.selectionEnd) return null
    const m = PALABRA.exec(nodo.value.slice(0, fin))
    if (!m) return null
    const parcial = m[3] || ''
    return { prefijo: m[2], parcial, ini: fin - parcial.length - 1, fin }
  }

  const mostrarTexto = t => (rango.prefijo === '#' ? '#' + t : t)

  function pintar() {
    if (!caja) {
      caja = document.createElement('ul')
      caja.className = 'autocompletar'
      caja.setAttribute('role', 'listbox')
      // Dentro del diálogo abierto (capa superior): fuera de él no se vería.
      ;(nodo.closest('dialog') || document.body).append(caja)
    }
    caja.replaceChildren(...lista.map((t, k) => {
      const li = document.createElement('li')
      li.textContent = mostrarTexto(t)
      li.setAttribute('role', 'option')
      if (k === activa) li.className = 'activa'
      li.onmousedown = e => { e.preventDefault(); elegir(k) }
      return li
    }))
    const r = nodo.getBoundingClientRect()
    caja.style.left = `${Math.round(r.left)}px`
    caja.style.top = `${Math.round(r.bottom + 4)}px`
  }

  function mostrar() {
    rango = palabra()
    lista = rango ? sugerir(rango.prefijo, rango.parcial) : []
    // Nada que sugerir, o ya está escrita completa: no estorbar.
    if (!lista.length || (lista.length === 1 && mostrarTexto(lista[0]) === rango.prefijo + rango.parcial)) return cerrar()
    activa = 0
    pintar()
  }

  function elegir(k) {
    const texto = mostrarTexto(lista[k]) + ' '
    const v = nodo.value
    nodo.value = v.slice(0, rango.ini) + texto + v.slice(rango.fin)
    const pos = rango.ini + texto.length
    nodo.setSelectionRange(pos, pos)
    nodo.dispatchEvent(new Event('input', { bubbles: true }))
    cerrar()
  }

  function tecla(e) {
    if (!caja) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      activa = (activa + (e.key === 'ArrowDown' ? 1 : lista.length - 1)) % lista.length
      pintar()
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation(); elegir(activa)
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); cerrar()
    }
  }

  const alSalir = () => setTimeout(cerrar, 150)
  nodo.addEventListener('input', mostrar)
  nodo.addEventListener('keydown', tecla)
  nodo.addEventListener('blur', alSalir)
  return {
    update(o) { sugerir = o.sugerir },
    destroy() {
      cerrar()
      nodo.removeEventListener('input', mostrar)
      nodo.removeEventListener('keydown', tecla)
      nodo.removeEventListener('blur', alSalir)
    }
  }
}
