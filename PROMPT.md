Quiero que construyas "Canvas de Citas", una app web para gestionar las citas de mi tesis.

Contexto y requisitos funcionales completos: léelos en `spec.md` (en esta misma carpeta) antes de escribir código.

Diseño: en `design-reference/` hay 4 pantallas HTML estáticas que muestran exactamente cómo se debe ver cada vista (colores, tipografía, layout). Ábrelas y replica el diseño con fidelidad — no son solo referencia aproximada, son el diseño final aprobado:
1. `1-proyectos.html` — lista de proyectos
2. `2-tesis-hub.html` — vista de una tesis: nodo central + fuentes alrededor + notas/fotos/conexiones/etiquetas
3. `3-fuente-citas.html` — modal con las citas de una fuente
4. `4-vista-general.html` — vista general con filtros y panel de detalle

Antes de generar código, pregúntame lo que necesites sobre:
- Stack técnico que prefiero (framework de frontend, si quiero backend propio o solo archivos locales al inicio)
- Si quiero empezar por una sola pantalla (sugiero `2-tesis-hub.html`, es la más central) o por el esqueleto completo de navegación
- Cómo prefiero manejar los tres archivos de datos (`proyectos.json`, `fuentes.json`, `citas.json`) al inicio: archivos locales en disco, localStorage del navegador, o ya con una base de datos

No implementes todavía la integración con Claude/IA ni el complemento de Word — esas son fases posteriores descritas en `spec.md`, bajo "Arquitectura técnica: rendimiento y conexiones externas". Por ahora enfócate en que la interfaz funcione y lea/escriba los tres JSON según el esquema del spec.
