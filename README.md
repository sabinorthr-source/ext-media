# Ext-Media 1.8.1

Extensión Chrome Manifest V3 para extraer y organizar multimedia del tema activo de PeruTops. Los datos se almacenan localmente en IndexedDB; no usa backend, cuenta, nube ni CDN en tiempo de ejecución.

## Funciones
- Recorrido de todas las páginas del tema activo, sin límite arbitrario de 200 páginas.
- Extracción de imágenes, adjuntos, videos, embeds y enlaces, con contexto de publicación.
- Persistencia por sesión y paginación de galería de 100 recursos.
- Renderizado progresivo de 30 tarjetas y carga diferida de miniaturas.
- Visor único con navegación separada por tipo, miniaturas, zoom, fullscreen y soporte de teclado/táctil.
- Exportación completa JSON/CSV y copia de URLs mediante lectura paginada.
- CSV protegido frente a fórmulas de hoja de cálculo.
- Seguimiento de pestañas que utilizan cada sesión; al cerrar la última galería se eliminan sus datos y la extracción desaparece de «Extracciones recientes».
- Recuperación de pestañas y limpieza de sesiones terminales huérfanas/interrumpidas.
- La acción «Limpiar» permanece dentro de la galería; el popup ya no elimina datos. Si se abren dos galerías para la misma sesión, cerrar solo una conserva los resultados de la otra.
- Manejo de cuota: limpieza de sesiones terminales sin galería activa y, si no alcanza, finalización parcial preservando los datos persistidos.

## Instalación
1. Descomprime el ZIP en una carpeta permanente.
2. Abre `chrome://extensions/` y activa Modo desarrollador.
3. Pulsa **Cargar descomprimida** y selecciona la carpeta `ext-media-v1.8.1`.
4. Inicia la extracción desde una página de tema de PeruTops.

Para actualizar una instalación anterior, conserva la misma carpeta e identidad de extensión; haz copia de seguridad y pulsa Recargar. No desinstales si quieres conservar IndexedDB. Al actualizar a esta versión, cierra las galerías antiguas y vuelve a abrirlas para registrar sus pestañas.

## Pruebas
```bash
npm test
npm run check
```

## Limitaciones conocidas
- La extensión almacena URLs y metadatos, no descarga el catálogo completo de archivos al disco.
- Las imágenes/videos protegidos dependen de que el navegador conserve una sesión válida y de las políticas del servidor.
- La cuota real varía por perfil, dispositivo y espacio disponible; no se puede garantizar una capacidad fija.
- El visor es un prototipo propio inspirado en el patrón de GLightbox, no una integración del paquete GLightbox. La comparación está en `viewers/README.md`.
- No se considera validado en producción hasta completar las pruebas manuales en Chrome autenticado.


## Versión 1.8.1

- La paginación «Siguiente»/«Anterior» ya no desplaza automáticamente la galería; la posición de lectura queda bajo control del usuario.
- Se conserva el tamaño de página de 100 recursos y el renderizado progresivo.
- Dexie.js y GLightbox se evaluaron y se decidió no adoptarlos todavía: el beneficio neto no compensa la reescritura y las pruebas de regresión necesarias. El detalle está en `PR6.4-CHANGELOG.md`.

## Versión 1.8.0

- Los enlaces normales y URLs escritas en el texto de las publicaciones vuelven a incluirse en el catálogo.
- Se omiten recursos que aparecen únicamente dentro de citas; se retiran los metadatos y enlaces de navegación de citas.
- La galería registra diagnósticos de errores de miniaturas. Para dominios PeruTops autorizados puede consultar el estado HTTP con HEAD (y GET Range si HEAD no está soportado); para dominios externos sin permisos informa que el estado no es verificable.
- Los adjuntos se resuelven desde la sesión autenticada del sitio y guardan una URL directa/fallback cuando el servidor la proporciona.
- IndexedDB v3 limpia los campos heredados de citas sin borrar las sesiones existentes.
