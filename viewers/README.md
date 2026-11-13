# Visor multimedia — PR4

`media-viewer.js` es un prototipo local de lightbox inspirado en el flujo de interacción de GLightbox. No es una copia ni una integración del paquete GLightbox: implementa solo lo que Ext-Media necesita y evita código externo en tiempo de ejecución.

## Comparación técnica

| Criterio | GLightbox 3.x | PhotoSwipe 5.x | Necesidad de Ext-Media |
|---|---|---|---|
| Imágenes | Sí | Sí, foco principal | Sí |
| Video HTML5 | Sí | No es un visor general de video | Sí |
| Iframes | Sí | No es su caso principal | No por ahora |
| Zoom y gestos | Sí | Muy sólido, orientado a imagen | Sí, básico |
| Miniaturas inferiores | Requiere personalización | Requiere personalización | Sí |
| Fullscreen de la galería | Requiere control adicional | No es su foco principal | Sí |
| Peso/dependencia | Biblioteca externa | Biblioteca externa | Preferimos mínimo runtime |

GLightbox encaja mejor que PhotoSwipe para un visor mixto de imágenes y videos. PhotoSwipe ofrece una experiencia de zoom y navegación de imágenes más especializada, pero no sustituye un reproductor de video. Fuentes: repositorios oficiales de [GLightbox](https://github.com/biati-digital/glightbox) y [PhotoSwipe](https://github.com/dimsemenov/photoswipe).

## Decisión

Se prototipa el patrón de interacción tipo GLightbox con código local y sin dependencia de CDN o npm en ejecución. La colección se construye por tipo: abrir una imagen filtra estrictamente `type === image`; abrir un video filtra `type === video`. Las miniaturas, fullscreen, navegación y limpieza de `<video>` se controlan dentro del visor.

Si en una fase posterior se decide adoptar GLightbox real, debe incorporarse una distribución vendorizada con versión fijada, licencia MIT y archivos de licencia. No cargar scripts desde CDN dentro de Manifest V3.
