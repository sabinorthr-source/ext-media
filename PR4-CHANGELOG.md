# PR4 — Galería y visor

- Un único diálogo declarativo `mediaViewer`; eliminado el diálogo dinámico heredado.
- Prototipo local de lightbox inspirado en GLightbox, sin dependencia remota.
- Navegación separada por tipo, miniaturas, zoom, fullscreen, teclado y gestos táctiles.
- Videos no se precargan en las tarjetas; usan poster y se reproducen en el visor.
- Reproductores se pausan y descargan al cerrar o cambiar de video.
- Se conserva el contrato de sesión/paginación de 1.5.1.

La comparación GLightbox/PhotoSwipe y la decisión están en `viewers/README.md`.
