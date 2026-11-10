# PR6 — Modo prudente y zoom panorámico

## Extracción conservadora
- Intervalo mínimo de 2 segundos entre inicios de solicitudes HTTP realizadas por la extensión, tanto para páginas como para páginas de adjuntos.
- Resolución de adjuntos secuencial: una sola solicitud en vuelo, sin concurrencia de cuatro workers.
- Detención inmediata ante HTTP 401, 403 o 429.
- Detención ante redirecciones, formularios o páginas de inicio de sesión, CAPTCHA o verificación detectables.
- No se reintenta automáticamente ni se sigue recorriendo la cola después de una barrera de acceso.
- Los recursos de la página actual se persisten antes de finalizar si la barrera aparece al resolver un adjunto.
- El trabajo termina como parcial cuando ya se había procesado alguna página; se conservan los lotes previamente guardados.
- Se registra `stopReason` en el trabajo para diagnóstico.

## Zoom panorámico
- Arrastre con botón izquierdo del mouse y con pantalla táctil.
- Rueda del mouse para acercar/alejar sin requerir Ctrl.
- Escala limitada entre 1× y 4×.
- Pan horizontal y vertical con límites calculados según el tamaño visible de la imagen y del visor.
- Zoom con punto de anclaje bajo el cursor; botón y teclas +/− también disponibles.

## Verificaciones
- `npm test`: 39 pruebas aprobadas.
- `npm run check`: validación sintáctica de scripts.
- ZIP validado con `unzip -t`.
- No se ejecutó una prueba E2E en Chrome ni una extracción real contra PeruTops desde este entorno. La detección de páginas de verificación usa heurísticas DOM/URL y no puede reconocer todos los desafíos personalizados.
