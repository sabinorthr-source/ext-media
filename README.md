# Extractor Multimedia — PR3 (Parser y resolvedor XenForo)

Versión de actualización: **1.4.0**. Este paquete es un overlay para la rama que ya contiene la base PR1/PR2 (mensajería `START_EXTRACTOR`, `EXTRACTOR_PROGRESS`, `EXTRACTOR_RESULTS`, `RESET_EXTRACTION` y estado en `chrome.storage.session`). Incluye los archivos de integración necesarios para que el paquete sea consistente.

## Qué cambia

- Parser XenForo modular en `core/xenforo-parser.js`.
- Las citas ya no se descartan sin inspección: se parsean por separado, incluyendo imágenes, videos, enlaces y adjuntos citados. Cada recurso conserva `context: "post"` o `context: "quoted"` y `sources[]` con post/página de origen.
- Detección de S9e en atributos `data-s9e-mediaembed-iframe` tanto en formato JSON objeto como en la secuencia de pares clave/valor usada por algunos renderizados.
- Clasificación por extensión, nombre, MIME y URL para imágenes, videos, embeds, adjuntos y enlaces.
- Resolvedor de páginas de adjuntos: sigue redirecciones y busca contenido directo mediante MIME, `video/source`, `og:video`, `og:image` y `bbImage`.
- Concurrencia limitada a **4** resoluciones simultáneas.
- Los temas enlazados se detectan, pero no se recorren salvo que se active la casilla en el popup. Si se activan, se recorre solo un nivel de temas secundarios y hasta 25 temas distintos.
- El límite de páginas deja de estar fijado en 200. El popup permite elegir 500, 1.000, 2.000 o 5.000 páginas por ejecución. El límite cuenta páginas intentadas, incluso las fallidas, para evitar ciclos infinitos. Si se alcanza, el resultado queda marcado como parcial con `stopReason: "PAGE_LIMIT_REACHED"`.
- Deduplicación de URL conservando las ubicaciones de origen en `sources[]`.

## Archivos

- `content.js`: orquestación del rastreo y comunicación con el service worker.
- `core/media-classifier.js`: clasificación y normalización de recursos.
- `core/s9e-parser.js`: lectura de payloads S9e.
- `core/xenforo-parser.js`: publicaciones, metadatos, citas, multimedia y enlaces.
- `core/attachment-resolver.js`: resolución de adjuntos con concurrencia limitada.
- `core/concurrency.js`: pool de concurrencia.
- `core/thread-crawler.js`: cola y deduplicación de páginas.
- `popup.html`, `popup.js`: opciones de temas enlazados y límite de páginas.
- `manifest.json`: orden de carga de los módulos.
- `background.js`: conserva la base PR2 y persiste los metadatos nuevos del resultado.
- `shared/`: protocolo y estado de PR2.
- `tests/fixtures/`: HTML sintético de posts, citas, S9e y mensajes anidados.

`gallery.html`, `gallery.css` y `gallery.js` no se modifican. La galería existente sigue recibiendo `items`; este PR añade metadatos a cada recurso sin cambiar el contrato básico.

## Instalación

1. Haz una copia de seguridad de la carpeta actual de la extensión.
2. Descomprime este ZIP encima de la carpeta del proyecto, aceptando reemplazar los archivos incluidos.
3. No elimines `gallery.html`, `gallery.css` ni `gallery.js`.
4. Abre `chrome://extensions`, pulsa **Recargar** en la extensión.
5. Recarga la pestaña del foro antes de iniciar una extracción.
6. Empieza con el límite de 500 páginas. Activa “Explorar también temas enlazados” solo cuando realmente quieras incorporar contenido de otros temas.

## Pruebas locales

Requiere Node.js 18 o posterior:

```bash
node --check content.js
node --check background.js
node --check popup.js
node --check core/media-classifier.js
node --check core/s9e-parser.js
node --check core/xenforo-parser.js
node --check core/attachment-resolver.js
node --check core/concurrency.js
node --check core/thread-crawler.js
node tests/protocol.test.js
node tests/pr3.test.js
```

Las pruebas Node cubren las funciones puras, formatos S9e, clasificación, cola y concurrencia; los HTML de `tests/fixtures/` son fixtures de regresión para inspección/pruebas DOM en navegador. No sustituyen una prueba end-to-end con sesión iniciada en PeruTops/Foros Perú.

## Referencia de reglas

Se contrastaron los patrones con el extractor XenForo de `gallery-dl`, publicado bajo GPL-2.0-or-later. Se reutilizan ideas de parsing y casos de compatibilidad, no bloques de código fuente. Referencia: https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/xenforo.py

## Limitaciones conocidas

- No se hace rastreo recursivo ilimitado: los temas enlazados son opcionales y solo un nivel.
- No se descarga el archivo multimedia; se registran las URLs y metadatos para la galería.
- Los proveedores S9e no reconocidos se conservan como URL embed cuando existe `src`; no se convierten automáticamente en archivo descargable.
- Se necesita validar con HTML real de ambas instalaciones XenForo y con sesión autenticada. Los fixtures sintéticos no garantizan compatibilidad con todos los addons del foro.
