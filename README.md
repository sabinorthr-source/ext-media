# Ext-Media 1.3.0 — PeruTops

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
- Cada ejecución tiene un `sessionId`; los resultados de temas diferentes no se pisan inmediatamente. Se conservan hasta cinco sesiones en `chrome.storage.session`.
- El manifiesto se limita a `perutops.com` y `www.perutops.com`; se retira el dominio anterior `forosperu.club`.
- Se elimina el diálogo antiguo sin uso de `gallery.html`; el visor activo sigue siendo el diálogo creado por `gallery.js`.
- Los videos ya no se reproducen automáticamente al abrir el visor.

## Pruebas automatizadas

Requiere Node.js 18 o superior:

```bash
npm test
npm run check
```

Las pruebas cubren identidad del tema, aislamiento entre hilos, dominio HTTPS, alias `www` y normalización de rutas de paginación.

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
- Los resultados siguen almacenándose en `chrome.storage.session`. Para colecciones grandes y persistencia/reanudación robusta, el siguiente paso del roadmap es migrar el repositorio de resultados a IndexedDB y desacoplar la ejecución del ciclo de vida del content script.
