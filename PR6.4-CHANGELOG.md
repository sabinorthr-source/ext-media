# PR6.4 — Simplificación mediante OSS y navegación manual

## Incluido en 1.8.1

- Se elimina el desplazamiento automático de la galería al cambiar de página. «Siguiente» y «Anterior» actualizan los resultados sin mover el scroll del documento.
- Se conserva la paginación de 100 recursos por bloque y el renderizado progresivo de tarjetas.
- No se modifica el comportamiento de filtros ni la presentación de las categorías.

## Evaluación de Dexie.js

**Decisión: no introducir Dexie en esta entrega.** El repositorio actual no usa consultas complejas ni relaciones; el trabajo de IndexedDB se concentra en tres object stores y operaciones transaccionales explícitas. Dexie simplificaría la apertura, declaraciones de esquema y algunas operaciones de tabla, pero no reemplazaría las reglas críticas de Ext-Media: validar estados de sesión, impedir escrituras tardías, eliminar atómicamente `jobs`/`media`/`galleryTabs`, reconciliar pestañas y recuperar sesiones huérfanas.

Una migración real requeriría reescribir y volver a probar el repositorio completo, conservar el esquema físico y la migración v3 ya desplegada, verificar el comportamiento de transacciones abortadas y bloqueos entre varias galerías, y añadir el bundle local de Dexie con versión y licencia fijadas. Añadir Dexie como una capa superficial encima de `indexedDB` no sería simplificación. Se difiere hasta que exista una prueba de concepto que reduzca código sin debilitar esas garantías.

## Evaluación de GLightbox

**Decisión: conservar `viewers/media-viewer.js`.** GLightbox ofrece imágenes, video HTML5, navegación, teclado y gestos táctiles. Sin embargo, el visor actual incorpora una tira de miniaturas propia, zoom con rueda, paneo mediante Pointer Events, fullscreen nativo, fallback de URL y limpieza explícita del reproductor al cambiar de elemento/cerrar. Reproducir esa experiencia con GLightbox exigiría personalizaciones y pruebas de compatibilidad; no se ha demostrado que el reemplazo reduzca el mantenimiento total.

No se carga ninguna biblioteca desde CDN. La adopción futura exige distribuir una versión local fijada, incluir su licencia y probar imágenes originales, miniaturas, videos protegidos, navegación, teclado, táctil, fullscreen, errores y cierre/reapertura.

## Aplazado

- TanStack Virtual: no se incorpora. Se mantiene la paginación de 100 recursos y el renderizado progresivo actual. Evaluar virtualización solo si mediciones con catálogos grandes muestran un problema real de memoria o fluidez.

## Validación

- `npm run check` y `npm test` deben pasar.
- La navegación manual debe verificarse en Chrome: avanzar/retroceder desde distintas posiciones de scroll, con filtros activos y con recursos de varias categorías.
