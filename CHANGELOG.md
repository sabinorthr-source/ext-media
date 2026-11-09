# Changelog

## 1.5.1 — PR3.1: URL original, galería y retención local

- Diferencia las páginas internas de adjuntos del foro de los enlaces directos del CDN.
- Reconoce URLs de imagen `.data` mediante el parámetro `a` y conserva íntegra la query con token.
- El visor abre primero el original y usa la miniatura como fallback; las tarjetas siguen mostrando previews.
- Añade `content-visibility`, decodificación asíncrona, prioridad baja y botón flotante «Volver al inicio».
- «Limpiar» informa que elimina también la entrada de «Extracciones recientes».
- Añade acción para eliminar extracciones terminadas desde el popup.
- La limpieza automática nunca expulsa trabajos activos; retiene hasta 20 sesiones terminadas recientes y elimina las terminadas de más de 14 días.
- Añade pruebas para URL `.data`, origen del adjunto y política de retención.

## 1.5.0 — PR3: parser PeruTops y memoria acotada

- Extrae adjuntos miniatura desde `.file-preview`, conserva la página del adjunto y resuelve el recurso original.
- Identifica adjuntos por ID XenForo, independiente de la URL de la miniatura.
- Extrae imágenes externas citadas usando el `href` como original y `src`/`data-url` como preview.
- Conserva autor, post citado y orígenes de aparición.
- Añade parser PeruTops separado del coordinador de `content.js`.
- Procesa y persiste por página; elimina el `Map` global que retenía todos los recursos durante el rastreo.
- Añade lectura paginada de IndexedDB y navegación de galería en lotes de 100.
- Exportación completa bajo demanda para JSON/CSV y copia de URLs.
- Añade pruebas unitarias de clasificación de recursos e identidad de adjuntos.

### Pendiente

- Validación en Chrome con DOM vivo de PeruTops, especialmente acceso real al original del adjunto.
- Cola global real entre pestañas (PR2.1).
- Reanudación automática de trabajos interrumpidos.
- Pruebas de carga reales con miles de recursos y temas extensos.
