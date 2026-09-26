// Caja de la imagen en una tarjeta de foto: siempre con la proporción real (sin recortar).
// Ancho por defecto 200 px; una foto alta se hace más angosta para no quedar gigante.
// El ancho elegido arrastrando la esquina (`f.ancho`) se respeta entre 120 y 900 px.
export const ANCHO_FOTO = { min: 120, max: 900 }

export function anchoFoto(f) {
  const p = f.proporcion || 4 / 3
  const auto = p >= 0.75 ? 200 : Math.max(ANCHO_FOTO.min, Math.round((184 * p) / 0.75) + 16)
  return Math.min(ANCHO_FOTO.max, Math.max(ANCHO_FOTO.min, Math.round(f.ancho ?? auto)))
}

/** { w, iw, ih }: ancho de la tarjeta y tamaño de la imagen dentro (margen de 8 px). */
export function cajaFoto(f) {
  const w = anchoFoto(f), iw = w - 16
  return { w, iw, ih: Math.max(24, Math.round(iw / (f.proporcion || 4 / 3))) }
}
