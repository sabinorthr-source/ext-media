# Fixtures DOM de PeruTops

Los ejemplos de referencia usados para el adaptador PR3 son los fragmentos aportados por el usuario:

- Adjuntos en miniatura: `section.message-attachments > ul.attachmentList > li.file.file--linked > a.file-preview[href*="/attachments/"] > img[src*="media.perutops.com/attachments/"]`.
- La URL del `img.src` es una miniatura; el enlace `a.file-preview.href` apunta a la página del adjunto y el identificador se encuentra en `a.u-anchorTarget#attachment-{id}`.
- Citas: `blockquote.bbCodeBlock--quote` con `data-source="post:{id}"`, autor en `.bbCodeBlock-sourceJump`, y contenido dentro de `.bbCodeBlock-expandContent` / `.bbWrapper`.
- Imágenes externas citadas: `a.link--external[href] > img.bbImage[src][data-url]`; el `href` apunta al recurso original y `src`/`data-url` pueden ser miniaturas.
- Publicación original: `.message-userContent[data-lb-id="post-{id}"] > article.message-body > .bbWrapper`.

Estos fixtures documentan el contrato real observado, no una promesa de compatibilidad con todos los skins XenForo. La extracción DOM completa debe verificarse en Chrome con una página real de PeruTops.
