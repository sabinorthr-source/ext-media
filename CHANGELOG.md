# Changelog

## 1.4.0 — PR2: estabilidad Manifest V3

- Sustituye `chrome.storage.session` por IndexedDB local para trabajos y recursos.
- Persiste lotes de recursos durante el recorrido, en grupos de 100.
- Registra estado, progreso, errores, pestaña de origen e identidad del tema.
- Marca trabajos como interrumpidos ante cierre/recarga/navegación de la pestaña, reinicio de Chrome o actualización de la extensión.
- Añade historial de extracciones recientes al popup para reabrir resultados parciales o completos.
- Añade indicador de progreso mediante el badge de la acción de Chrome.
- Separa la capa IndexedDB y el repositorio de trabajos del router del service worker.
- Elimina el permiso `storage` y conserva los permisos de host limitados a PeruTops.
- Añade pruebas de estado, manifiesto e importaciones del service worker.

### Limitación conocida

El parseo sigue ejecutándose en el content script porque depende de `DOMParser` y del DOM de la página. Si la pestaña desaparece, el trabajo se marca como interrumpido; los recursos ya persistidos pueden reabrirse desde el historial, pero el crawler no se reanuda automáticamente.
