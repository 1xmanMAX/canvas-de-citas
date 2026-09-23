# Sistema de Citas para Tesis — Spec para App de Canvas

Sep 22, 2026 · @Someone

## Resumen y objetivo

Sistema para que Claude actúe como corrector de citas (estilo "profesor de citar"), verificador de fuentes académicas y generador de una base de datos estructurada de citas. Max escribe la app de canvas por su cuenta; este documento define el contrato de datos y el flujo para que ambas partes encajen sin fricción.

El sistema cubre tres funciones separadas:

1. **Corregir** — comparar lo que Max escribió contra las reglas del manual de citas (a subir) y señalar errores con explicación, como haría un profesor.
2. **Verificar** — confirmar que la fuente citada existe realmente y extraer su metadata exacta desde bases académicas, no solo de memoria o de una búsqueda genérica.
3. **Almacenar** — guardar cada cita ya corregida y verificada en un registro estructurado (JSON), que crece con cada cita nueva y que la app de canvas puede leer para graficar.

## Arquitectura general

Tres piezas separadas, cada una con una responsabilidad clara:

| Pieza | Qué hace | Dónde vive |
| --- | --- | --- |
| Skill de Claude | Lee el manual de citas de Max, corrige y verifica cada cita | Definida en un archivo SKILL.md |
| Base de datos de citas | Guarda cada cita ya corregida y verificada | Un archivo JSON acumulado (+ export opcional a BibTeX) |
| App de canvas | Lee el JSON y grafica las citas de forma visual | Desarrollada por Max, por fuera de Claude |

La skill y la app de canvas no se hablan directamente: se comunican a través del archivo JSON. Esto significa que Max puede rehacer o cambiar la app de canvas sin tocar la skill, y viceversa — el único punto de acoplamiento es el esquema de datos (sección más abajo).

## Flujo paso a paso de la skill

1. Max le pasa a Claude un fragmento de texto con una cita (o solo un título/DOI de una fuente que aún no ha citado).
2. Claude busca la fuente en fuentes académicas y confirma que existe realmente.
3. Claude extrae la metadata exacta: autor(es), año, título, revista/editorial, DOI o URL, idioma.
4. Claude aplica las reglas del manual de citas de Max (cargado en la skill) a esa fuente.
5. Claude compara la cita escrita por Max contra el resultado correcto y señala cualquier error, explicando la regla del manual que lo exige — igual que anotaciones de un profesor.
6. Claude genera la cita en-texto corregida y la entrada de bibliografía correspondiente.
7. Claude guarda o actualiza el registro de esa fuente en el archivo JSON acumulado.
8. Max puede pedir en cualquier momento "muéstrame el JSON" o "expórtalo" para alimentar la app de canvas.

## Verificación de fuentes

Para papers científicos (el tipo de fuente predominante en la tesis de Max), Claude verifica contra bases académicas estructuradas en vez de depender solo de una búsqueda web genérica — devuelven metadata exacta (DOI, autores, año, revista) en lugar de que Claude la interprete de una página:

| Base | Cubre | Por qué |
| --- | --- | --- |
| CrossRef | DOIs de casi cualquier paper publicado | Fuente de verdad para metadata bibliográfica |
| Semantic Scholar | Papers de ciencia e ingeniería, con resúmenes | Bueno para confirmar contenido y autores |
| OpenAlex | Catálogo abierto muy amplio, alternativa a Scopus | Buen respaldo cuando CrossRef no tiene el registro |

Para libros: Open Library o Google Books. Para normativa técnica (dado el trabajo de Max en ingeniería civil/topográfica): el repositorio oficial de cada norma (ej. ASTM, ISO, normas locales). Si una fuente no aparece en ninguna base, Claude lo marca como "no verificado" en vez de asumir que es correcta.

## Esquema de datos (contrato para la app de canvas)

Cada cita es un objeto dentro de un arreglo `citas` en un archivo JSON. Este es el esquema — el contrato que la app de canvas debe leer:

```json
{
  "citas": [
    {
      "id": "cita_003",
      "tipo_fuente": "articulo_cientifico",
      "autores": ["García, M."],
      "anio": 2020,
      "titulo": "Resistencia a compresión en concreto reforzado",
      "revista_o_editorial": "Revista de Ingeniería Civil",
      "doi_o_url": "https://doi.org/10.xxxx/xxxxx",
      "idioma": "es",
      "cita_textual_o_parafraseo": "textual",
      "pagina": 45,
      "cita_en_texto": "(García, 2020, p. 45)",
      "entrada_bibliografia": "García, M. (2020). Resistencia a compresión en concreto reforzado. Revista de Ingeniería Civil.",
      "estado_verificacion": "verificado",
      "fuente_verificacion": "CrossRef",
      "notas_correccion": "Año corregido de 2019 a 2020"
    }
  ]
}
```

Campos y sus valores posibles:

| Campo | Tipo | Notas |
| --- | --- | --- |
| tipo\_fuente | texto | `articulo_cientifico`, `libro`, `normativa_tecnica`, `otro` |
| idioma | texto | `es`, `en` |
| cita\_textual\_o\_parafraseo | texto | `textual` o `parafraseo` |
| estado\_verificacion | texto | `verificado`, `no_verificado`, `dudoso` |
| fuente\_verificacion | texto | de dónde vino la confirmación (CrossRef, Semantic Scholar, OpenAlex, etc.) |

Cada cita nueva se agrega como un elemento más del arreglo — la app de canvas los lee todos y decide cómo graficarlos (por autor, por año, por tema, agrupados, conectados, como Max decida diseñarlo).

## Export paralelo a BibTeX

Además del JSON (para la app de canvas), la skill puede generar el mismo registro en formato `.bib` — el estándar universal compatible con Zotero, Mendeley, JabRef y LaTeX. Se genera desde la misma base de datos, así que no hay que mantener dos fuentes de verdad:

```bibtex
@article{garcia2020resistencia,
  author  = {García, M.},
  title   = {Resistencia a compresión en concreto reforzado},
  journal = {Revista de Ingeniería Civil},
  year    = {2020},
  doi     = {10.xxxx/xxxxx}
}
```

Esto es opcional — solo aporta valor si en algún momento Max quiere usar un gestor de referencias además de su propia app de canvas.

## Especificación para la app de canvas

Lo que la app de Max necesita hacer, del lado suyo:

1. **Leer** el archivo `citas.json` (esquema de la sección anterior) cada vez que se abra o se le indique refrescar.
2. **Renderizar** cada cita como un nodo en el canvas — mínimo: autor, año, título abreviado.
3. **Agrupar o conectar** nodos según el criterio que Max elija (por autor, por año, por tema/tipo de fuente) — esto es decisión de diseño de Max, el JSON ya trae los campos para soportar cualquiera de esas vistas.
4. **Distinguir visualmente** el `estado_verificacion` (ej. color distinto para "no\_verificado") para que Max vea de un vistazo qué citas todavía necesitan revisión.
5. (Opcional) **Detalle al hacer clic**: mostrar `cita_en_texto`, `entrada_bibliografia` y `notas_correccion` completos.

El archivo JSON es la única superficie de contacto entre la skill y la app — mientras la app siga leyendo ese esquema, Max puede rehacerla o cambiarla de tecnología sin tocar la skill.

## Arquitectura técnica: rendimiento y conexiones externas

| Necesidad | Cómo resolverla |
| --- | --- |
| **App ligera, sin lag** | Separar los datos en tres archivos en vez de uno: `proyectos.json`, `fuentes.json` y `citas.json` (ver más abajo). Al abrir un proyecto, cargar solo sus citas, no toda la biblioteca. Renderizar el canvas con SVG o `<canvas>` ligero en vez de un framework pesado de gráficos si la cantidad de nodos crece a cientos. |
| **Conexión con Word** | MVP: los botones "Copiar" ya presentes en el mockup (cita en texto y bibliografía listas para pegar) cubren el caso simple. Versión más avanzada: un complemento de Word (Word Add-in con Office.js) que inserta la cita desde un panel lateral dentro del propio Word, al estilo Zotero/Mendeley — requiere hospedar un taskpane y un manifiesto de complemento. |
| **Conexión con Claude / IA** | Dos rutas, no excluyentes: (1) la que ya existe — la skill `citas-tesis` dentro de una conversación de Claude, que ya lee y escribe `citas.json` y verifica fuentes sin backend propio; (2) integración directa en la app — un backend propio (nunca desde el navegador, por la llave de API) que llama a la API de Claude para automatizar verificación o extracción como una función más de la app. |
| **Fuentes con su documento original adjunto** | Cada fuente puede guardar su PDF, HTML o MD original junto a su metadata (ej. `fuentes/<id>/documento.pdf`). Esto permite que Claude, vía la skill, lea el documento real — no solo la metadata — para verificar una cita textual contra el texto exacto, ubicar la página correcta de una idea parafraseada, o sugerir nuevas citas de esa misma fuente para investigaciones futuras. |

Esto implica un cambio de esquema respecto a la sección "Esquema de datos" de arriba: en vez de un solo `citas.json` con todo mezclado, conviene separar tres tablas — `proyectos.json` (tus tesis/trabajos, con objetivos e indicadores), `fuentes.json` (biblioteca de fuentes compartida entre proyectos, cada una con su documento adjunto opcional) y `citas.json` (instancias de cita: qué fuente, en qué proyecto, en qué página, con qué estado de uso — usando / revisado sin usar / sin revisar). Así una misma fuente puede reutilizarse en una investigación futura sin duplicar su registro bibliográfico completo.

## Próximos pasos

- [ ] Max sube el manual de citas (PDF o Word)
- [ ] Claude extrae las reglas exactas del manual y las codifica en la skill
- [ ] Claude construye la skill (SKILL.md + lógica de verificación + generación del JSON/BibTeX)
- [ ] Prueba con 2–3 citas reales de la tesis de Max
- [ ] Max empieza a construir la app de canvas sobre el esquema JSON de este documento
