# PR6.1 + PR6.2 — Ext-Media 1.7.0

## Comportamiento de sesiones

- La acción «Eliminar datos» desaparece del popup.
- «Limpiar» sigue disponible en la galería y elimina explícitamente la sesión.
- Cada pestaña de galería se registra en `galleryTabs` vinculada a su `sessionId`.
- Cerrar una galería no elimina datos si otra pestaña continúa utilizando la misma sesión.
- Al cerrar la última galería de una sesión terminal, se eliminan en una transacción sus registros `jobs`, `media` y `galleryTabs`.
- Navegar fuera de una galería también libera su asociación y puede disparar la limpieza de la última referencia.
- En el inicio de Chrome o después de una actualización, se reconstruyen las asociaciones a partir de las pestañas existentes.
- Las sesiones terminales sin galería se consideran huérfanas y se eliminan. Las sesiones activas no se expulsan por esta limpieza.
- Se eliminan las reglas de retención de 20 sesiones y 14 días.

## Integridad

- IndexedDB pasa a versión 2 y añade `galleryTabs`; los almacenes `jobs` y `media` existentes se conservan durante la migración.
- La eliminación usa una transacción única sobre los tres almacenes.
- `create` no sobrescribe identificadores de sesión existentes.
- `saveBatch` y `finish` rechazan datos tardíos para sesiones eliminadas o no activas.
- `getPage` comprueba la identidad de sesión y la clave de cada registro devuelto.
- La recuperación elimina recursos sin trabajo propietario y asociaciones de pestañas sin sesión.
- Las decisiones de ciclo de vida se extraen a `shared/session-lifecycle.js` para probarlas de forma aislada.
- El test del visor ahora comprueba el comportamiento táctil implementado, no una expresión que no existe en el código.

## Permiso nuevo

Se añade `tabs` para poder identificar las páginas internas de galería, conocer sus `sessionId` y reconstruir asociaciones después de reiniciar Chrome. No se amplían los `host_permissions` ni se añade backend.

## Pruebas pendientes de entorno real

Las pruebas automatizadas validan reglas de ciclo de vida, recuperación, contratos y sintaxis. No sustituyen una prueba de IndexedDB concurrente ejecutada en Chrome ni una prueba de cierre forzado del navegador. Antes de dar PR6 por validado en uso real, ejecutar el checklist de la entrega.
