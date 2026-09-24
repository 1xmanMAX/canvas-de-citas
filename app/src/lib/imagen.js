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
