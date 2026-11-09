# Ext-Media 1.5.1 — PR3.1 URLs originales + galería fluida

Extensión Chrome Manifest V3 para extraer recursos multimedia del **tema activo** de la web y consultarlos en una galería local. No usa backend, cuentas, sincronización remota ni dependencias de runtime.

## Instalación

1. Descomprime el ZIP.
2. Abre `chrome://extensions` y activa **Modo de desarrollador**.
3. Si ya tienes cargada otra copia de Ext-Media, desactívala o elimínala para evitar confundir versiones.
4. Pulsa **Cargar descomprimida** y selecciona la carpeta `ext-media-v1.5.1`.
5. Abre un tema de la web y ejecuta la extracción.

## Cambios PR3

### Adaptador DOM específico para la web

- Añade `shared/la web-parser.js`, separado del coordinador de extracción.
- Reconoce adjuntos en miniatura: `.message-attachments`, `.attachmentList`, `.file.file--linked`, `.file-preview`, `.u-anchorTarget#attachment-{id}`.
- Trata `img.src` de `media.la web.com/attachments/...` como miniatura, no como recurso original.
- Conserva la URL de la página del adjunto (`a.file-preview[href]`) y resuelve la URL original mediante una solicitud autenticada al mismo origen.
- Usa el ID numérico del adjunto como clave estable para deduplicar aunque la URL resuelta cambie.
- Reconoce imágenes dentro de citas XenForo (`blockquote.bbCodeBlock--quote`) y enlaces externos `a.link--external > img.bbImage`.
- Prefiere el `href` de la imagen externa como URL original y conserva `src`/`data-url` como miniatura.
- Distingue páginas de adjunto del foro (mismo origen) de URLs directas del CDN.
- Reconoce enlaces CDN `.data` cuyo parámetro `a` contiene el nombre original, conservando íntegros los tokens y parámetros de acceso.
- Extrae autor y referencia al post citado desde `data-source="post:{id}"` y `.bbCodeBlock-sourceJump`.
- Mantiene los orígenes de aparición para no perder el contexto si un recurso aparece en el post original y en una cita.
- Excluye avatares, firmas, reacciones, medallas y controles del editor.
- Mantiene extracción de vídeos, iframes y enlaces multimedia.

### Memoria y galería

- Ya no mantiene un `Map` con todos los recursos de todas las páginas durante la extracción.
- Procesa cada página en un mapa temporal, resuelve sus adjuntos, guarda lotes y libera el mapa antes de avanzar.
- El repositorio fusiona registros repetidos sin perder atribución de citas.
- La galería consulta IndexedDB en páginas de 100 recursos; no carga todo el catálogo ni crea miles de tarjetas DOM al abrir.
- JSON, CSV y copiar URLs recuperan todos los lotes solo cuando el usuario solicita explícitamente esa operación.
- Las tarjetas fuera de pantalla usan `content-visibility`, y las imágenes usan carga diferida, decodificación asíncrona y prioridad baja.
- El visor abre primero la URL original y recurre a la miniatura si el original falla.
- Añade un botón flotante para volver al inicio.
- «Limpiar» elimina los recursos y también el registro de esa sesión; el popup permite eliminar extracciones terminadas sin abrir la galería.

### Integridad y límites

- La identidad y paginación siguen limitadas al mismo tema activo de la web.
- No se reintroduce un límite fijo de 200 páginas.
- La concurrencia de resolución de adjuntos se mantiene en cuatro solicitudes.
- No se descargan ni almacenan los archivos multimedia completos; se guardan metadatos y URLs.

## Pruebas

Requiere Node.js 18 o superior:

```bash
npm test
npm run check
```

Las pruebas cubren identidad de tema, clasificación de URLs, IDs de adjuntos, selección de limpieza de historial, estado de trabajos, manifiesto e importaciones. Los tests no simulan un navegador DOM completo ni reemplazan la validación manual de Chrome.

## Validación manual obligatoria en la web

1. Abrir un tema con adjuntos en miniatura como el fragmento compartido: verificar que aparezcan en galería y que la URL original no sea la miniatura de 65×140.
2. Abrir una cita con `blockquote.bbCodeBlock--quote` e imágenes `a.link--external > img.bbImage`: verificar miniatura, URL original, autor citado y enlace al post citado.
3. Verificar un adjunto de imagen citado y uno de vídeo, si el foro los ofrece.
4. Probar firmas, avatares, medallas y reacciones para comprobar que no se incorporen.
5. Abrir una extracción con cientos o miles de recursos: comprobar que la galería carga 100 por página y que los controles anterior/siguiente funcionan.
6. Exportar JSON y CSV y confirmar que incluyan todos los recursos, no solo la página visible.
7. Probar un tema de más de 200 páginas si existe uno accesible.

## Limitaciones conocidas / trabajo pendiente

- La URL original de los adjuntos depende de la respuesta real de la página de adjunto en la web. Si el servidor devuelve un formato HTML distinto al previsto, la miniatura se conserva y habrá que ajustar el resolver con esa respuesta real.
- No se ha ejecutado esta versión en una sesión real de Chrome conectada a la web; las pruebas automatizadas no certifican el DOM real ni cookies, permisos o anti-hotlink.
- La cola global entre pestañas aún no está implementada. La afirmación anterior de que dos temas se ponen en cola no está respaldada por el código PR2 inspeccionado: esta versión mantiene sesiones aisladas, pero puede permitir que dos pestañas intenten extraer simultáneamente. Debe corregirse en PR2.1 antes de considerar completa la gestión de trabajos.
- La extracción no se reanuda automáticamente después de cerrar/recargar la pestaña. Los resultados parciales sí se conservan.
- Cerrar la galería no borra la extracción: se conserva para «Extracciones recientes». «Limpiar» sí elimina recursos y registro, por lo que esa extracción deja de aparecer en recientes.
- La limpieza automática (al iniciar Chrome/instalar o actualizar la extensión y al finalizar una extracción) conserva todas las sesiones activas, elimina sesiones terminadas de más de 14 días y limita a 20 las sesiones terminadas más recientes. El popup muestra las seis más recientes.
- Los contadores y filtros de la galería reflejan la página visible de 100 elementos. Las exportaciones y copia de URLs abarcan el conjunto completo.

## Estructura añadida

- `shared/la web-parser.js`: parser DOM específico para el marcado observado en la web.
- `tests/la web-parser.test.js`: pruebas de clasificación y claves de adjuntos.
- `tests/fixtures/la web/README.md`: contrato DOM documentado a partir de los fragmentos facilitados.
