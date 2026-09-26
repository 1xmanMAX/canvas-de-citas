// app/tests/unit/etiquetas.test.js — etiquetas # y menciones @ (src/lib/etiquetas.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraer, normalizar, etiquetasDe, parsearConsulta, coincideConsulta, indexar, resumen, colorEtiqueta, sugerencias } from '../../src/lib/etiquetas.js'

test('extrae etiquetas y menciones del texto', () => {
  assert.deepEqual(extraer('Revisar #retrabajo con @Villarreal y #Hormigón-armado.'), { temas: ['retrabajo', 'Hormigón-armado'], personas: ['@Villarreal'] })
})

test('correos, URLs y números no son etiquetas', () => {
  assert.deepEqual(extraer('max@gmail.com https://x.com/#seccion cap. #2 y #1.3 a@b'), { temas: [], personas: [] })
})

test('el punto final no forma parte de la etiqueta; el interno sí', () => {
  assert.deepEqual(extraer('ver #norma.E060. y @J.Pérez.').temas, ['norma.E060'])
  assert.deepEqual(extraer('ver @J.Pérez.').personas, ['@J.Pérez'])
})

test('normalizar ignora tildes, mayúsculas y el #', () => {
  assert.equal(normalizar('#Hormigón'), 'hormigon')
  assert.equal(normalizar('@Villarreal'), '@villarreal')
})

test('etiquetasDe une el campo y el texto sin duplicados', () => {
  assert.deepEqual(etiquetasDe(['#concreto y @Ana', 'otra vez #Concreto'], ['abierto', '@ana']), { temas: ['abierto', 'concreto'], personas: ['@ana'] })
})

test('consulta combinada: todas las partes deben coincidir', () => {
  const c = parsearConsulta('#retrabajo @Villarreal costo')
  assert.deepEqual(c, { temas: ['retrabajo'], personas: ['@villarreal'], palabras: ['costo'] })
  const item = { texto: 'El costo del retrabajo', temas: ['retrabajo'], personas: ['@Villarreal'] }
  assert.ok(coincideConsulta(item, c))
  assert.ok(!coincideConsulta({ ...item, personas: [] }, c))
  assert.ok(coincideConsulta(item, parsearConsulta('COSTÓ')))
  assert.ok(!coincideConsulta(item, parsearConsulta('precio')))
  assert.ok(coincideConsulta(item, parsearConsulta('Retrabájo')))
})

test('indexar recorre tarjetas, sub-lienzos, agrupadores, objetivos, fuentes y citas', () => {
  const p = {
    id: 'proyecto_001', objetivos_especificos: ['Medir #retrabajo'], objetivo_general: '',
    canvas: {
      notas: [{ id: 'n1', texto: 'idea #vial', etiquetas: ['@Ana'] }], listas: [{ id: 'l1', titulo: 'Pendientes', items: [{ t: 'llamar @Luis' }] }],
      audios: [{ id: 'a1', transcripcion: 'hablar de #costos' }], fotos: [{ id: 'f1', titulo: 'Grieta', etiquetas: ['patologia'] }],
      agrupadores: [{ id: 'g1', titulo: 'Marco #teórico' }],
      objetivos: { oe1: { notas: [{ id: 'n2', texto: '#dentro' }], listas: [], audios: [], fotos: [] } }
    }
  }
  const items = indexar({ proyectos: [p], fuentes: [{ id: 'fuente_001', titulo: 'T', autores: ['Villarreal, J.'], etiquetas: ['abierto'] }], citas: [{ id: 'cita_001', proyecto_id: 'proyecto_001', fuente_id: 'fuente_001', contexto: 'cap. 2 #antecedentes' }] })
  const por = id => items.find(i => i.id === id)
  assert.deepEqual(por('n1').personas, ['@Ana'])
  assert.deepEqual(por('l1').personas, ['@Luis'])
  assert.deepEqual(por('a1').temas, ['costos'])
  assert.deepEqual(por('f1').temas, ['patologia'])
  assert.equal(por('g1').tipo, 'agrupador')
  assert.equal(por('n2').clave, 'oe1')
  assert.deepEqual(por('proyecto_001:oe1').temas, ['retrabajo'])
  assert.deepEqual(por('fuente_001').temas, ['abierto'])
  assert.deepEqual(por('cita_001').temas, ['antecedentes'])
})

test('resumen cuenta y muestra la forma más usada', () => {
  const r = resumen([{ temas: ['Vial'], personas: [] }, { temas: ['vial'], personas: [] }, { temas: ['vial', 'costos'], personas: ['@Ana'] }])
  assert.deepEqual(r.temas, [{ etiqueta: 'vial', cuenta: 3 }, { etiqueta: 'costos', cuenta: 1 }])
  assert.deepEqual(r.personas, [{ etiqueta: '@Ana', cuenta: 1 }])
})

test('color estable por etiqueta', () => {
  assert.equal(colorEtiqueta('#Hormigón'), colorEtiqueta('hormigon'))
  assert.ok(colorEtiqueta('x') >= 0 && colorEtiqueta('x') < 8)
})

test('sugerencias por prefijo y autores', () => {
  const items = [{ temas: ['vial', 'vivienda'], personas: ['@Vera'] }, { temas: ['vial'], personas: [] }]
  assert.deepEqual(sugerencias(items, '#', 'vi', []), ['vial', 'vivienda'])
  assert.deepEqual(sugerencias(items, '@', 'v', ['Villarreal, J.', 'Otro, A.']), ['@Vera', '@Villarreal'])
})
