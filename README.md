# Ext-Media 1.6.0

Extensión Chrome Manifest V3 para extraer y organizar multimedia del tema activo de PeruTops. Los datos se almacenan localmente en IndexedDB; no usa backend, cuenta, nube ni CDN en tiempo de ejecución.

## Funciones
- Recorrido de todas las páginas del tema activo, sin límite arbitrario de 200 páginas.
- Extracción de imágenes, adjuntos, videos, embeds y enlaces, con contexto de publicación/cita.
- Persistencia por sesión y paginación de galería de 100 recursos.
- Renderizado progresivo de 30 tarjetas y carga diferida de miniaturas.
- Visor único con navegación separada por tipo, miniaturas, zoom, fullscreen y soporte de teclado/táctil.
- Exportación completa JSON/CSV y copia de URLs mediante lectura paginada.
- CSV protegido frente a fórmulas de hoja de cálculo.
- Limpieza por sesión e higiene de sesiones antiguas; las sesiones activas no se eliminan.
- Manejo de cuota: limpieza de sesiones terminadas y, si no alcanza, finalización parcial preservando los datos persistidos.

## Instalación
1. Descomprime el ZIP en una carpeta permanente.
2. Abre `chrome://extensions/` y activa Modo desarrollador.
3. Pulsa **Cargar descomprimida** y selecciona la carpeta `ext-media-v1.6.0`.
4. Inicia la extracción desde una página de tema de PeruTops.

Para actualizar una instalación anterior, conserva la misma carpeta e identidad de extensión; haz copia de seguridad y pulsa Recargar. No desinstales si quieres conservar IndexedDB.

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
