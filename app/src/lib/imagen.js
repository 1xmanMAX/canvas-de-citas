/** Reduce una imagen a 1024 px de lado como máximo y la devuelve como data URL JPEG. */
export async function comprimir(archivo) {
  const bmp = await createImageBitmap(archivo)
  const s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height))
  const tela = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s) })
  tela.getContext('2d').drawImage(bmp, 0, 0, tela.width, tela.height)
  bmp.close?.()
  return tela.toDataURL('image/jpeg', 0.78)
}

/** Como comprimir(), pero devuelve también la proporción (ancho / alto) para dibujar la tarjeta. */
export async function comprimirFoto(archivo) {
  const imagen = await comprimir(archivo)
  const img = new Image()
  img.src = imagen
  await img.decode()
  return { imagen, proporcion: Math.round((img.naturalWidth / img.naturalHeight) * 1000) / 1000 }
}

/** ¿Hay que reducir el original? Solo si es enorme (más de 12 MP o 15 MB): a 4096 px de lado mayor. */
export function tamanoOriginal(ancho, alto, bytes) {
  if (ancho * alto <= 12e6 && bytes <= 15e6) return { reducir: false, ancho, alto }
  const s = 4096 / Math.max(ancho, alto)
  return { reducir: true, ancho: Math.round(ancho * s), alto: Math.round(alto * s) }
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

/** Miniatura para el lienzo (como comprimirFoto) + el original en alta para el visor. */
export async function prepararFoto(archivo) {
  const { imagen, proporcion } = await comprimirFoto(archivo)
  const bmp = await createImageBitmap(archivo)
  const t = tamanoOriginal(bmp.width, bmp.height, archivo.size)
  let original = archivo, extension = EXT[archivo.type] || 'jpg'
  if (t.reducir || !EXT[archivo.type]) {
    const tela = Object.assign(document.createElement('canvas'), { width: t.ancho, height: t.alto })
    tela.getContext('2d').drawImage(bmp, 0, 0, t.ancho, t.alto)
    original = await new Promise(res => tela.toBlob(res, 'image/jpeg', 0.9))
    extension = 'jpg'
  }
  bmp.close?.()
  return { imagen, proporcion, original, extension }
}
