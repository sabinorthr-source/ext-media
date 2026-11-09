# PR5 — Pruebas y endurecimiento

- CSV neutralizado contra fórmulas y escapado correcto de comillas.
- JSON/CSV/copia de URLs recorren páginas de 100; no cargan todos los objetos multimedia en un array global.
- URL de recursos exportadas restringidas a HTTP/HTTPS.
- Limpieza de sesiones terminadas y reintento único ante `QuotaExceededError`.
- Si la cuota sigue agotada, se detiene el rastreo y se conserva el trabajo parcial.
- Pruebas de regresión para paginación larga, lotes, sesión autenticada, liberación del mapa por página, cuota, visor y CSV.
