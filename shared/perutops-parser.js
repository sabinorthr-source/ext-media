(function (root) {
  "use strict";

  const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:$|[?#])/i;
  const VIDEO_EXT = /\.(?:mp4|webm|mov|m4v|ogv|ogg|mkv)(?:$|[?#])/i;
  const UI_SELECTOR = [
    ".message-cell--user", ".message-avatar", ".avatar", ".message-attribution",
    ".message-user", ".message-signature", ".bdMedal_messageUserMedals",
    ".bdMedal_userMedals", ".bdMedal_medalImage", ".reaction", ".reactions",
    ".reactionsBar", ".reactionSummary", ".message-actionBar", ".shareButtons"
  ].join(",");
  const EDITOR_SELECTOR = ".message-editorWrapper,.message-editor,.fr-element,.formRow,.attachmentUpload";
  const QUOTE_SELECTOR = "blockquote.bbCodeBlock--quote, .bbCodeBlock--quote, blockquote.bbCodeBlock, blockquote";

  const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();
  function absolute(value, base) {
    if (!value) return "";
    try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) ? url.href : ""; }
    catch { return ""; }
  }
  function classifyUrl(value, label = "") {
    const url = String(value || "");
    let path = url.split(/[?#]/)[0];
    let queryFilename = "";
    try {
      const parsed = new URL(url, "https://perutops.com/");
      path = parsed.pathname;
      queryFilename = parsed.searchParams.get("a") || parsed.searchParams.get("filename") || "";
    } catch {}
    const text = `${path} ${queryFilename} ${label}`.toLowerCase();
    if (/^data:image\//i.test(url)) return "ui";
    if (/avatar|reaction|favicon|emoji|medal|medalla|distintivo/i.test(text) || /\/(?:avatars?|medals?)\//i.test(path)) return "ui";
    if (/(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)/i.test(url)) return "embed";
    if (/(?:t\.me|telegram\.me|telegram\.dog)(?:\/|$)/i.test(url)) return "telegram";
    // En XenForo el parámetro `a` puede terminar en `-jpeg.407279`, no `.jpeg`.
    const imageName = /(?:^|[-_.])(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:\.\d+)?$/i;
    const videoName = /(?:^|[-_.])(?:mp4|webm|mov|m4v|ogv|ogg|mkv)(?:\.\d+)?$/i;
    if (IMAGE_EXT.test(path) || imageName.test(queryFilename)) return "image";
    if (VIDEO_EXT.test(path) || videoName.test(queryFilename)) return "video";
    if (/\/attachments\//i.test(path)) return "attachment";
    return "link";
  }
  function isForumAttachmentPage(value, pageUrl) {
    try {
      const target = new URL(value, pageUrl);
      const page = new URL(pageUrl);
      return target.origin === page.origin && /\/attachments\//i.test(target.pathname);
    } catch { return false; }
  }
  function attachmentId(anchor, listItem) {
    const idAnchor = listItem?.querySelector(".u-anchorTarget[id^='attachment-']") ||
      listItem?.querySelector("a[id^='attachment-']");
    const fromDom = (idAnchor?.id || "").match(/^attachment-(\d+)$/i)?.[1];
    const fromUrl = String(anchor?.getAttribute("href") || "").match(/\.([0-9]+)\/?(?:[?#]|$)/)?.[1];
    return fromDom || fromUrl || "";
  }
  function isQuotedElement(element) { return Boolean(element?.closest?.(QUOTE_SELECTOR)); }
  
  function imageDetails(img, pageUrl, messageLink, author) {
    const listItem = img.closest(
      ".message-attachments li.file, .attachmentList li.file, li.file"
    );
    const previewAnchor = img.closest("a.file-preview[href], a[href]");
    const anchorHref = absolute(
      previewAnchor?.getAttribute("href"),
      pageUrl
    );
    // Miniatura que muestra XenForo en el tema.
    const thumbnail =
      absolute(img.getAttribute("src"), pageUrl) ||
      absolute(img.getAttribute("data-preview"), pageUrl) ||
      absolute(img.getAttribute("data-thumb"), pageUrl);
    // Posibles direcciones del archivo original.
    const dataOriginal =
      absolute(img.getAttribute("data-original"), pageUrl) ||
      absolute(img.getAttribute("data-url"), pageUrl) ||
      absolute(img.getAttribute("data-src"), pageUrl);
    const isXfAttachment =
      !!anchorHref && isForumAttachmentPage(anchorHref, pageUrl);
    const anchorType = anchorHref
      ? classifyUrl(anchorHref, img.alt || img.title)
      : "";
    // Si el enlace apunta directamente a una imagen externa,
    // se conserva como original.
    const externalOriginal =
      anchorHref &&
      !isXfAttachment &&
      ["image", "video"].includes(anchorType)
        ? anchorHref
        : "";
    // En PeruTops, el enlace del adjunto es la referencia estable
    // que permite resolver el archivo original.
    const attachmentPage = isXfAttachment ? anchorHref : "";
    const originalUrl =
      attachmentPage ||
      externalOriginal ||
      dataOriginal ||
      thumbnail;
    const fileName = cleanText(
      listItem?.querySelector(".file-name")?.textContent ||
      listItem?.querySelector(".file-name[title]")?.getAttribute("title") ||
      img.alt ||
      img.title
    ) || "Imagen";
    const id = attachmentId(previewAnchor, listItem);
    return {
      type: "image",
      url: originalUrl,
      title: fileName,
      sourcePage: messageLink,
      author,
      // La tarjeta debe conservar la miniatura.
      preview: thumbnail || originalUrl,
      // Alternativa visual si la miniatura falla.
      fallbackUrl: thumbnail || originalUrl,
      // Se conserva la ruta estable del adjunto.
      attachmentPage,
      attachmentId: id,
      // Todavía no tenemos el archivo original directo
      // si solamente conocemos la página del adjunto.
      original: !attachmentPage
    };
  }

  function add(map, item) {
    if (!item.url) return;
    const key = item.attachmentId ? `attachment:${item.attachmentId}` : item.url;
    const origin = { sourcePage: item.sourcePage || "", author: item.author || "" };
    item.origins = [origin];
    const previous = map.get(key);
    if (!previous) { map.set(key, item); return; }
    previous.origins ||= [];
    if (!previous.origins.some(x => x.sourcePage === origin.sourcePage && x.author === origin.author)) previous.origins.push(origin);
    if (!previous.preview && item.preview) previous.preview = item.preview;
    if (!previous.attachmentPage && item.attachmentPage) previous.attachmentPage = item.attachmentPage;
    if ((!previous.title || previous.title === "Imagen") && item.title) previous.title = item.title;
  }

  function extractPage(doc, pageUrl) {
    const items = new Map();
    const messages = [...doc.querySelectorAll(".message")];
    const roots = messages.length ? messages : [...doc.querySelectorAll("article.message, .message-cell--main")];
    if (!roots.length && doc.body) roots.push(doc.body);

    for (const rootNode of roots) {
      const rootElement = rootNode.matches?.(".message") ? rootNode : rootNode.closest?.(".message") || rootNode;
      const postId = (rootElement.id || "").match(/post-(\d+)/)?.[1] ||
        (rootElement.querySelector(".message-userContent[data-lb-id], .message-userContent [data-lb-id], [data-lb-id^='post-']")?.getAttribute("data-lb-id") || "").match(/post-(\d+)/)?.[1];
      const messageLink = postId ? `${new URL(pageUrl).origin}${new URL(pageUrl).pathname}#post-${postId}` :
        absolute(rootElement.querySelector(".message-attribution-main a[href*='/threads/'], .message-attribution a[href*='/threads/']")?.getAttribute("href"), pageUrl) || pageUrl;
      const author = cleanText(rootElement.querySelector(".message-name, .username, [itemprop='author']")?.textContent);

      // PeruTops: los adjuntos en miniatura usan .file-preview + href a la página
      // del adjunto + img.src en media.perutops.com. La URL src NO es el original.
      for (const anchor of rootElement.querySelectorAll(".message-attachments .file-preview[href], .attachmentList .file-preview[href]")) {
        if (anchor.closest(EDITOR_SELECTOR) || isQuotedElement(anchor)) continue;
        const img = anchor.querySelector("img");
        const href = absolute(anchor.getAttribute("href"), pageUrl);
        if (!href || !/\/attachments\//i.test(new URL(href).pathname)) continue;
        if (img) add(items, imageDetails(img, pageUrl, messageLink, author));
        else {
          const li = anchor.closest("li.file");
          const title = cleanText(li?.querySelector(".file-name")?.textContent || anchor.textContent) || "Adjunto";
          add(items, { type: classifyUrl(href, title), url: href, title, sourcePage: messageLink, author,
            preview: "", attachmentPage: href, attachmentId: attachmentId(anchor, li) });
        }
      }

      for (const img of rootElement.querySelectorAll("img")) {
        if (img.closest(UI_SELECTOR) || img.closest(EDITOR_SELECTOR) || isQuotedElement(img)) continue;
        if (/avatar|reaction|favicon|emoji|medal|medalla|distintivo/i.test(`${img.className || ""} ${img.alt || ""} ${img.title || ""}`)) continue;
        // Evita que el mismo adjunto se agregue de nuevo desde el selector genérico.
        if (img.closest(".message-attachments .file-preview, .attachmentList .file-preview")) continue;
        const item = imageDetails(img, pageUrl, messageLink, author);
        if (item.url && ["image", "attachment"].includes(classifyUrl(item.url, item.title))) add(items, item);
      }

      for (const video of rootElement.querySelectorAll("video")) {
        if (video.closest(UI_SELECTOR) || video.closest(EDITOR_SELECTOR) || isQuotedElement(video)) continue;
        const candidates = [video.getAttribute("src"), video.getAttribute("data-src"),
          ...[...video.querySelectorAll("source")].map(s => s.getAttribute("src") || s.getAttribute("data-src"))].filter(Boolean);
        for (const raw of candidates) {
          const url = absolute(raw, pageUrl);
          if (url) add(items, { type: "video", url, playUrl: url, title: cleanText(video.getAttribute("title") || video.getAttribute("data-filename")) || "Video", sourcePage: messageLink, author });
        }
      }

      for (const frame of rootElement.querySelectorAll("iframe[src], iframe[data-src]")) {
        if (frame.closest(UI_SELECTOR) || frame.closest(EDITOR_SELECTOR) || isQuotedElement(frame)) continue;
        const url = absolute(frame.getAttribute("src") || frame.getAttribute("data-src"), pageUrl);
        if (url) add(items, { type: "embed", url, title: cleanText(frame.title) || "Contenido incrustado", sourcePage: messageLink, author });
      }

      // Adjuntos sin miniatura y adjuntos de vídeo.
      for (const anchor of rootElement.querySelectorAll(".message-attachments a[href*='/attachments/'], .attachmentList a[href*='/attachments/']")) {
        if (anchor.closest(EDITOR_SELECTOR) || isQuotedElement(anchor) || anchor.querySelector("img")) continue;
        const url = absolute(anchor.getAttribute("href"), pageUrl);
        if (!url || /\/attachments\/upload(?:\?|$)/i.test(url)) continue;
        const li = anchor.closest("li.file");
        const title = cleanText(li?.querySelector(".file-name")?.textContent || anchor.getAttribute("title") || anchor.textContent) || "Adjunto";
        const type = /\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(title) || /-(?:mp4|webm|mov|m4v)(?:[./?#]|$)/i.test(url) ? "video" : classifyUrl(url, title);
        add(items, { type, url, title, sourcePage: messageLink, author, preview: "", attachmentPage: url, attachmentId: attachmentId(anchor, li) });
      }

      // Recupera enlaces normales además de multimedia, sin incluir controles internos ni citas.
      for (const anchor of rootElement.querySelectorAll("a[href]")) {
        if (anchor.closest(UI_SELECTOR) || anchor.closest(EDITOR_SELECTOR) || isQuotedElement(anchor) || anchor.matches("[data-xf-click='attribution']")) continue;
        if (anchor.closest(".message-attachments, .attachmentList")) continue;
        const rawHref = anchor.getAttribute("href") || "";
        if (!rawHref || rawHref.startsWith("#") || /\/attachments\/upload(?:\?|$)/i.test(rawHref) ||
          /\/goto\/post(?:\?|\/|$)/i.test(rawHref) || /\/members\//i.test(rawHref) ||
          /\/content-removal\//i.test(rawHref) || /\/posts\/\d+\/(?:share|reactions|report)(?:\?|$)/i.test(rawHref) ||
          /\/threads\/[^/]+\/reply\?quote=\d+/i.test(rawHref)) continue;
        const href = absolute(rawHref, pageUrl);
        if (!href) continue;
        if (anchor.querySelector("img")) continue;
        const title = cleanText(anchor.textContent || anchor.getAttribute("title") || href).slice(0, 300);
        const type = classifyUrl(href, title);
        add(items, { type, url: href, title, sourcePage: messageLink, author, preview: type === "image" ? href : "", attachmentPage: /\/attachments\//i.test(new URL(href).pathname) ? href : "" });
      }

      // URLs escritas como texto también forman parte del catálogo de enlaces.
      const walker = doc.createTreeWalker(rootElement, 4);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      for (const node of textNodes) {
        if (node.parentElement?.closest(`a,script,style,textarea,${QUOTE_SELECTOR}`)) continue;
        const matches = (node.nodeValue || "").match(/(?:https?:\/\/|www\.)[^\s<>\"'«»]+/gi) || [];
        for (let candidate of matches) {
          candidate = candidate.replace(/[.,;!?)\]}]+$/g, "");
          const href = absolute(candidate.startsWith("www.") ? `https://${candidate}` : candidate, pageUrl);
          if (!href) continue;
          const type = classifyUrl(href, candidate);
          add(items, { type, url: href, title: candidate.slice(0, 300), sourcePage: messageLink, author, preview: type === "image" ? href : "" });
        }
      }
    }

    const discoveredPages = new Set();
    for (const anchor of doc.querySelectorAll(".pageNav a[href], .pageNavWrapper a[href], .pagination a[href], a[rel='next'][href]")) {
      const href = absolute(anchor.getAttribute("href"), pageUrl);
      if (href) discoveredPages.add(href);
    }
    return { items: [...items.values()], discoveredPages: [...discoveredPages] };
  }

  root.ExtMediaPeruTopsParser = { absolute, classifyUrl, isForumAttachmentPage, attachmentId, extractPage };
})(globalThis);
