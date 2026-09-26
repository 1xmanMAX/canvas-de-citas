// Matemática del visor de fotos: la imagen (en px reales) se dibuja con translate(tx, ty) scale(k).

export function ajustar(anchoImg, altoImg, anchoVista, altoVista, margen = 16) {
  const k = Math.min((anchoVista - 2 * margen) / anchoImg, (altoVista - 2 * margen) / altoImg)
  return { k, tx: (anchoVista - anchoImg * k) / 2, ty: (altoVista - altoImg * k) / 2 }
}

/** Zoom por `factor` dejando quieto el punto (cx, cy) de la vista. */
export function zoomEn(v, factor, cx, cy, kMin, kMax) {
  const k = Math.min(kMax, Math.max(kMin, v.k * factor))
  return { k, tx: cx - ((cx - v.tx) * k) / v.k, ty: cy - ((cy - v.ty) * k) / v.k }
}

/** Se puede alejar hasta la mitad de "ajustar" y acercar hasta 8× el tamaño real. */
export const limitesZoom = ajuste => ({ kMin: ajuste.k * 0.5, kMax: 8 })

/** Punto de la vista → coordenadas de los trazos (0–1000 sobre la imagen), recortado a la imagen. */
export function aImagen(v, x, y, anchoImg, altoImg) {
  const a = n => Math.round(Math.min(1000, Math.max(0, n)))
  return [a(((x - v.tx) / v.k / anchoImg) * 1000), a(((y - v.ty) / v.k / altoImg) * 1000)]
}
