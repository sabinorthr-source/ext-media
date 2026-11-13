# Changelog

## 1.8.1 — PR6.4: simplificación OSS y navegación manual

- Se elimina el desplazamiento automático al cambiar de bloque en la galería; la navegación queda bajo control del usuario.
- Se conserva la paginación de 100 recursos y el renderizado progresivo.
- Se evalúan Dexie.js y GLightbox; se difiere su adopción porque la reducción de complejidad no está demostrada frente al riesgo de reescritura y pérdida de capacidades del visor.
- TanStack Virtual queda aplazado hasta que mediciones reales justifiquen virtualización.

## 1.8.0 — PR6.3 + recuperación de enlaces y simplificación de citas

- Se recupera la catalogación de enlaces HTTP/HTTPS normales y URLs escritas como texto en publicaciones.
- Se excluye el contenido multimedia y los enlaces dentro de citas; se eliminan sus metadatos y el acceso «Ir al mensaje citado».
- Se añade diagnóstico persistente de vistas previas: URL inválida, acceso denegado, recurso inexistente, error HTTP, tipo de contenido incorrecto, error de red/permisos y fallo de visualización.
- Se comprueban mediante HEAD los recursos de dominios PeruTops autorizados; se usa GET con Range solo si HEAD no está soportado.
- Se mejora la resolución de adjuntos protegidos con credenciales, URL directa y fallback de miniatura.
- Se amplían permisos de host a subdominios de PeruTops para consultar el CDN multimedia desde la galería.
- IndexedDB v3 migra y elimina metadatos heredados de citas.
