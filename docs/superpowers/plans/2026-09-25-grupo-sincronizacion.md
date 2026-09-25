# Grupo de sincronización (solo lo que cambió) — Plan 3

> Sigue a los Planes 1 y 2. **Estado (2026-09-25): hecho.**

**Goal:** Varios aparatos (celular, laptop, la PC…) trabajan sobre los mismos datos; cada uno
sincroniza solo lo que cambió y todos terminan con la misma versión, aunque hayan editado a la
vez sin conexión.

**Architecture:** La PC (servidor `receptor/sincro`) es la casa del grupo y guarda la versión
común. Cada aparato tiene un id y un nombre, y la PC guarda, por aparato, la **base** (cómo
quedaron los datos en su última sincronización) en `<carpeta>/.sincro/base-<id>.json`, más la
lista del grupo en `.sincro/grupo.json`. Como aparato y PC tienen la misma base (lo comprueban
con una huella sha-256 de los datos en JSON canónico), entre ellos solo viajan **parches**.

## Protocolo v2 (el v1 sigue funcionando)

- `POST /sync/v2/leer` `{dispositivo, nombre, base: huella|null}` →
  `{etiqueta, huella, docs, grupo, modo: "parche", parche}` (cambios de la PC desde la base del
  aparato) o `{…, modo: "completo", datos}` si no hay base común.
- `POST /sync/v2/escribir` `{dispositivo, etiqueta, parche, huella, eliminados}` (o `datos` en
  vez de `parche`) → `{etiqueta, huella, escritas, grupo}`. 409 si la PC cambió desde la lectura
  (el aparato repite); 422 si el parche no da la huella esperada (el aparato envía todo). Solo se
  reescriben las colecciones que el parche toca.
- Parche: lista de `{r, v}` (poner), `{r, x: 1}` (quitar), `{r, orden}` (reordenar); la ruta `r`
  usa claves y `{id}` para elementos de listas. Mismo algoritmo en `app/src/lib/parche.js` y
  `receptor/sincro/src/parche.rs`, comprobado con `app/tests/vectores/parche.json`.

## En el aparato

1. Lee lo que cambió en la PC y reconstruye su versión (base + parche; si la huella no coincide,
   pide todo).
2. Fusión a tres vías (`lib/sincro.js`). **Orden de las listas**: el de la PC salvo que este
   aparato haya reordenado respecto a la base; lo nuevo va al final (así el orden converge).
3. Envía el parche de "versión de la PC → resultado" y guarda el resultado como nueva base.
4. Automática en todo aparato vinculado: al abrir, cada 5 min, al volver a la app y ~20 s
   después de un cambio local.

## Pruebas

- `app/tests/unit/parche.test.js`, `sincro-grupo.test.js` (PC falsa con varios aparatos),
  `receptor/sincro/tests/parche.rs` y `servidor.rs` (v2), integración con el binario real, y la
  suite e2e `grupo` (celular Android simulado + laptop contra `canvas-sincro`).

## Límites

- La PC debe estar encendida y en la misma red: es la casa del grupo (sin nube).
- Laptop con la app publicada (https) → PC (http en la red local): Chrome/Comet piden permiso de
  "acceso a la red local" la primera vez (`targetAddressSpace` en `fetch`).
- Documentos (PDF/HTML): siguen yendo completos, pero solo los que falten en un lado.
