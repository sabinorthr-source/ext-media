# Ext-Media 1.4.0 — PeruTops

Extensión Chrome Manifest V3 para recopilar recursos multimedia del **tema activo** de `perutops.com` y mostrarlos en una galería local.

## Instalación de desarrollo

1. Descomprime el ZIP.
2. Abre `chrome://extensions`.
3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** y selecciona esta carpeta.
5. Abre o recarga un tema de PeruTops y pulsa el icono de Ext-Media.

No necesita backend, cuenta externa, servicio remoto ni dependencias de runtime. `package.json` solo usa el runner de pruebas integrado en Node.js.

## Cambios de esta versión

- La identidad del tema se basa en el ID numérico XenForo, no solo en que la URL contenga `/threads/`.
- La paginación solo acepta enlaces del paginador que pertenezcan al mismo tema y origen.
- Se elimina el límite fijo de 200 páginas. El recorrido continúa mientras existan páginas nuevas enlazadas por la paginación del tema.
- Se registran errores por página y se marca la extracción como parcial si alguna página no pudo leerse.
- El parser prefiere el nodo `.message` externo para no procesar dos veces `.message-cell--main`.
- Las imágenes, videos, adjuntos, embeds y enlaces dentro de citas se conservan con metadatos de cita cuando el HTML del foro los expone.
- La resolución de páginas de adjuntos se limita a cuatro solicitudes concurrentes.
- Cada ejecución tiene un `sessionId` y se guarda en IndexedDB local. Los resultados parciales se persisten por página, sin depender de la memoria del content script.
- El service worker registra estados de ejecución, progreso, errores y pestaña de origen; al cerrar la pestaña o reiniciar Chrome, marca la sesión como interrumpida y conserva los recursos ya guardados.
- La galería recupera resultados desde IndexedDB; las sesiones antiguas se limpian automáticamente después de 14 días y se limita el historial a 20 trabajos.
- Se elimina el permiso `storage`: esta versión usa IndexedDB y no guarda el catálogo en `chrome.storage.session`.
- El manifiesto se limita a `perutops.com` y `www.perutops.com`; se retira el dominio anterior `forosperu.club`.
- Se elimina el diálogo antiguo sin uso de `gallery.html`; el visor activo sigue siendo el diálogo creado por `gallery.js`.
- Los videos ya no se reproducen automáticamente al abrir el visor.

## Arquitectura de PR2

- `background.js`: router de mensajes, ciclo de vida de pestañas, badge de progreso y apertura de galería.
- `storage/indexed-db.js`: apertura/versionado de IndexedDB y utilidades de transacción.
- `storage/job-repository.js`: persistencia de ejecuciones, lotes de recursos, consultas, limpieza y estados de interrupción.
- `shared/job-state.js`: normalización y transiciones de estados, compartida con pruebas Node.
- `content.js`: mantiene la lectura/parseo DOM porque necesita `DOMParser`; envía lotes de hasta 100 recursos al service worker.
- `gallery.js`: consulta el repositorio por `sessionId`; no depende de `chrome.storage.session`.

Estados persistidos: `running`, `completed`, `partial`, `failed` e `interrupted`. El historial conserva hasta 20 trabajos y elimina trabajos terminados con más de 14 días. La política se aplica a metadatos y URLs, no descarga ni almacena los archivos multimedia.

## Pruebas automatizadas

Requiere Node.js 18 o superior:

```bash
npm test
npm run check
```

Las pruebas cubren identidad del tema, aislamiento entre hilos, dominio HTTPS, alias `www`, normalización de rutas de paginación y transiciones de estado de ejecución.

## Pruebas manuales pendientes en Chrome

Estas pruebas requieren una sesión real de PeruTops; no se pueden certificar con las pruebas unitarias:

1. Abrir un tema de varias páginas y confirmar que se recorre desde la página actual hasta todas las páginas enlazadas.
2. Confirmar que un enlace a otro tema dentro de un post o una cita no se incorpora al recorrido.
3. Probar una cita que contenga una imagen, un enlace de adjunto y un video, si existe un ejemplo visible.
4. Abrir dos temas en pestañas distintas y confirmar que cada galería muestra su propia sesión.
5. Probar un tema con más de 200 páginas si el sitio dispone de uno accesible.
6. Repetir con un usuario autenticado y con una página que devuelva 403/404 para verificar el estado parcial.

## Limitaciones conocidas

- El crawler depende de que XenForo exponga los enlaces de navegación en `.pageNav`, `.pageNavWrapper`, `.pagination` o `rel="next"`. Si PeruTops personaliza ese HTML, habrá que ajustar el adaptador con una captura DOM real.
- No se ha probado la extensión en una sesión autenticada real de Chrome. El acceso de lectura de páginas protegidas depende de los permisos y cookies que el navegador ya tenga.
- La persistencia de resultados está en IndexedDB. La ejecución del crawler y el parseo siguen dependiendo de la pestaña de origen: si se cierra, navega, se recarga, Chrome se reinicia o la extensión se actualiza, el trabajo se marca como interrumpido y se conservan los resultados parciales, pero todavía no se reanuda automáticamente.

## Validación pendiente en navegador

Esta entrega pasó las pruebas unitarias y las comprobaciones de sintaxis, pero aún requiere una prueba manual en Chrome con PeruTops para validar el ciclo real de IndexedDB, la suspensión/reactivación del service worker y el cierre/recarga de pestañas. PR2 no implementa reanudación automática del crawler: conserva y permite reabrir el resultado parcial.
