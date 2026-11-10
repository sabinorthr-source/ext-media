# Changelog

## 1.6.0 — PR4 + PR5

### PR4 — Galería y visor
- Un único diálogo accesible `mediaViewer`; se elimina el visor dinámico heredado.
- Prototipo local de lightbox inspirado en GLightbox, sin dependencia externa ni CDN.
- Navegación estrictamente separada: imágenes solo recorren imágenes; videos solo recorren videos.
- Tira de miniaturas, zoom básico, fullscreen nativo, teclado, gestos táctiles y retorno del foco.
- Videos se pausan y se descargan del DOM al cambiar de elemento o cerrar el visor.
- Tarjetas de video usan poster/miniatura y no crean reproductores de video en cada tarjeta.
- Renderizado progresivo de 30 tarjetas dentro de la página de 100 resultados.

### PR5 — Pruebas y endurecimiento
- CSV neutraliza fórmulas de hoja de cálculo y escapa comillas.
- Exportaciones JSON/CSV y copia de URLs recorren páginas de 100 sin reunir todo el catálogo en un array de objetos.
- URLs de recursos exportadas se limitan a HTTP/HTTPS.
- Ante cuota excedida, intenta limpiar solo sesiones terminadas antiguas/sobrantes y reintenta el lote una vez.
- Si el almacenamiento sigue lleno, detiene el rastreo, conserva resultados guardados y marca la extracción como parcial.
- Se añaden pruebas de regresión de visor, CSV, temas extensos, lotes, sesión autenticada, memoria de página y cuota.

### Validación pendiente en Chrome
- Reproducción de videos reales y protegidos con sesión iniciada.
- Fullscreen y gestos en Windows/Android.
- Carga de imágenes originales con token y CDN de PeruTops.
- Prueba de cuota real de IndexedDB y catálogos de varios miles de recursos.


## 1.7.0 — PR6
- Modo prudente: intervalo de 2 s entre inicios de solicitudes, páginas y adjuntos secuenciales.
- Detención sin reintentos ante HTTP 401/403/429 y pantallas de acceso/verificación detectables.
- Conservación de recursos persistidos y estado parcial al detenerse por una barrera.
- Zoom panorámico con mouse/táctil, rueda, límites de movimiento y máximo 4×.
