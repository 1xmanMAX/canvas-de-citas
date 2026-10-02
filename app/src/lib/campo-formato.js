// Formato en los campos de texto de las tarjetas: los botones de BarraFormato.svelte y los atajos
// (Ctrl+B negrita, Ctrl+I cursiva, Ctrl+U subrayado, Ctrl+Shift+H resaltado) ponen o quitan las
// marcas de lib/formato.js alrededor de lo seleccionado.
import { alternarMarca } from './formato.js'

let ultimo = null // último campo con formato que tuvo el foco (los botones actúan sobre él)

/** Pone o quita el estilo en el campo `el` (o en el último que tuvo el foco). */
export function marcar(el, estilo) {
  el ||= ultimo
  if (!el || !el.isConnected) return
  const { valor, inicio, fin } = alternarMarca(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, estilo)
  el.value = valor
  el.dispatchEvent(new Event('input', { bubbles: true })) // para bind:value
  el.focus()
  el.setSelectionRange(inicio, fin)
}

const ATAJOS = { b: 'b', i: 'i', u: 'u' }

/** Acción para un textarea o input: atajos de formato y recordar el campo para los botones. */
export function conFormato(el) {
  const foco = () => (ultimo = el)
  const teclas = e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    const k = e.key.toLowerCase()
    const estilo = e.shiftKey ? (k === 'h' ? 'h' : null) : ATAJOS[k]
    if (!estilo) return
    e.preventDefault()
    marcar(el, estilo)
  }
  el.addEventListener('focus', foco)
  el.addEventListener('keydown', teclas)
  return {
    destroy() {
      el.removeEventListener('focus', foco)
      el.removeEventListener('keydown', teclas)
      if (ultimo === el) ultimo = null
    }
  }
}
