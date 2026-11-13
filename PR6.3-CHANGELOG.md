# PR6.3 — Diagnóstico de vistas previas y recuperación de enlaces

## Cambios
- Restaurada la extracción de enlaces normales y URLs detectadas en texto plano, sin recuperar el antiguo límite de 200 páginas.
- Excluidas las citas completas del análisis de recursos para evitar duplicados y metadatos innecesarios.
- Eliminados de la galería los metadatos y la acción «Ir al mensaje citado».
- Persistencia de diagnóstico por recurso, con URL saneada (sin query strings ni tokens).
- Verificación HTTP de recursos PeruTops cuando los permisos de host lo permiten; no se atribuye un 403/404 sin respuesta HTTP real.
- Resolución autenticada de páginas de adjuntos con fallback directo.
- Migración IndexedDB v3 para eliminar metadatos de citas heredados.

## Limitaciones
- Para servidores externos sin permiso de host, un `img.onerror` no permite distinguir con certeza entre 403, 404, bloqueo por hotlink, fallo de red o incompatibilidad. Se informa como no verificable.
- No se descargan ni almacenan blobs o copias de imágenes.
