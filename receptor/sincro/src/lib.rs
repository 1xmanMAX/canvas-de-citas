// receptor/sincro/src/lib.rs
//! Sincronización por la red local de Canvas de Citas: cifrado compatible con la app
//! (`app/src/lib/cifrado.js`), acceso a la carpeta de datos y servidor HTTP.
pub mod cifrado;
pub mod carpeta;
pub mod servidor;
pub mod parche;
pub mod reparto;
pub mod almacen;
pub mod carpetas;
pub mod local;
pub mod arranque;
