(() => {
  if (window.__extractorMultimediaInstalled) return;
  window.__extractorMultimediaInstalled = true;

  const threadIdentity = globalThis.ExtMediaThreadIdentity;
  if (!threadIdentity) throw new Error("No se cargó el módulo de identidad de tema.");
  let running = false;
  let activeSessionId = "";

  const absolute = (value, base) => {
    if (!value) return "";
    try { return new URL(value, base).href; } catch { return ""; }
  };
  const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();

  async function sendToBackground(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (response?.ok === false) throw new Error(response.error || "El service worker rechazó la operación.");
    return response;
  }

  function classifyUrl(url, label = "") {
    const raw = String(url || "");
    const path = raw.split(/[?#]/)[0].toLowerCase();
    const name = String(label || "").toLowerCase();
    let queryName = "";
    try {
      const parsed = new URL(raw, location.href);
      queryName = parsed.searchParams.get("a") || "";
    } catch {}
    const both = `${path} ${name} ${queryName.toLowerCase()}`;
    if (/^data:image\//i.test(raw)) return "ui";
    if (/\/(?:avatars?|medals?)\//i.test(path) || /avatar|reaction|favicon|emoji|medal|medalla|distintivo/i.test(name)) return "ui";
    if (/(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)/i.test(raw)) return "embed";
    if (/(?:t\.me|telegram\.me|telegram\.dog)(?:\/|$)/i.test(raw)) return "telegram";
    if (/\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:$)/i.test(path) || /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:$|[\s"'])/i.test(name) || /-(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:[./?#\s]|$)/i.test(both)) return "image";
    if (/\.(?:mp4|webm|mov|m4v|ogv|ogg|mkv)(?:$)/i.test(path) || /-(?:mp4|webm|mov|m4v|ogv|ogg|mkv)(?:[./?#\s]|$)/i.test(both)) return "video";
    if (/\/attachments\//i.test(path)) return "attachment";
    return "link";
  }

  function addItem(map, item) {
    if (!item?.url) return;
    const key = item.url;
    const old = map.get(key);
    if (!old) { map.set(key, item); return; }
    const rank = { ui: 0, link: 1, attachment: 2, embed: 3, telegram: 3, image: 4, video: 5 };
    if ((rank[item.type] || 0) > (rank[old.type] || 0)) old.type = item.type;
    for (const field of ["title", "author", "sourcePage", "preview", "fallbackUrl", "attachmentPage", "playUrl", "mimeType", "quotedAuthor", "quotedPostUrl"]) {
      if ((!old[field] || old[field] === "Adjunto") && item[field]) old[field] = item[field];
    }
    if (item.isQuoted) old.isQuoted = true;
  }

  const activeThread = threadIdentity.getThreadIdentity(location.href);
  if (!activeThread) console.warn("Ext-Media: la pestaña activa no corresponde a un tema válido de PeruTops.");

  function threadPageUrl(raw, base) {
    if (!activeThread) return "";
    return threadIdentity.normalizeThreadPage(raw, activeThread.threadUrl, base || location.href);
  }

  function quoteContext(element, pageUrl) {
    const quote = element.closest(".bbCodeBlock--quote, blockquote.bbCodeBlock, blockquote");
    if (!quote) return { isQuoted: false, quotedAuthor: "", quotedPostUrl: "" };
    const source = quote.querySelector(".bbCodeBlock-source a[href], .bbCodeBlock-title a[href], a.bbCodeBlock-sourceJump[href]");
    const author = cleanText(source?.textContent || quote.querySelector(".bbCodeBlock-source")?.textContent);
    const quotedPostUrl = source ? absolute(source.getAttribute("href"), pageUrl) : "";
    return { isQuoted: true, quotedAuthor: author, quotedPostUrl };
  }

  function getImageUrl(img, pageUrl) {
    const wrapper = img.closest(".bbImageWrapper[data-src], .js-lbImage[data-src]");
    // XenForo suele poner la imagen de tamaño original en data-src del wrapper.
    const raw = wrapper?.getAttribute("data-src") ||
      img.getAttribute("data-src") || img.getAttribute("data-url") ||
      img.getAttribute("data-original") || img.getAttribute("src") ||
      (img.getAttribute("srcset") || "").split(",").map(x => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
    return absolute(raw, pageUrl);
  }

  function extractDocument(doc, pageUrl, items, discoveredPages) {
    // .message-cell--main is nested inside .message in XenForo 2.
    const messages = doc.querySelectorAll(".message");
    const roots = messages.length ? [...messages] : [...doc.querySelectorAll("article.message, .message-cell--main")];
    if (!roots.length) roots.push(doc.body);

    for (const root of roots) {
      const messageLink = root.querySelector(".message-attribution-main a[href*='/threads/'], .message-attribution a[href*='/threads/']")?.href || pageUrl;
      const author = cleanText(root.querySelector(".message-name, .username, [itemprop='author']")?.textContent);

      // Imágenes normales y las imágenes originales guardadas por XenForo en data-src.
      for (const img of root.querySelectorAll("img")) {
        const cls = `${img.className || ""} ${img.alt || ""} ${img.title || ""}`;
        const excluded = img.closest(".message-cell--user,.message-avatar,.avatar,.message-attribution,.message-user,.message-signature,.bdMedal_messageUserMedals,.bdMedal_userMedals,.bdMedal_medalImage,.reaction,.reactions,.reactionsBar,.reactionSummary,.message-actionBar,.shareButtons");
        if (excluded || /avatar|reaction|favicon|emoji|medal|medalla|distintivo/i.test(cls)) continue;
        const url = getImageUrl(img, pageUrl);
        if (!url || url.startsWith("data:")) continue;
        const wrapperTitle = img.closest(".bbImageWrapper")?.getAttribute("title");
        const title = cleanText(img.getAttribute("alt") || img.getAttribute("title") || wrapperTitle);
        const type = classifyUrl(url, `${title} ${wrapperTitle || ""}`);
        if (type === "ui" || !["image", "attachment"].includes(type)) continue;
        const attachment = img.closest("a[href*='/attachments/']") || img.closest(".bbImageWrapper")?.closest("a[href]");
        const quoteInfo = quoteContext(img, pageUrl);
        addItem(items, {
          type: "image", url, title: title || "Imagen", sourcePage: messageLink,
          author, preview: url,
          fallbackUrl: absolute(img.getAttribute("src") || img.getAttribute("data-src"), pageUrl),
          attachmentPage: attachment ? absolute(attachment.getAttribute("href"), pageUrl) : "",
          original: true, ...quoteInfo
        });
      }

      // Vídeos inline: el src real normalmente está dentro de <source>.
      for (const video of root.querySelectorAll("video")) {
        const sources = [...video.querySelectorAll("source")];
        const candidates = [video.getAttribute("src"), video.getAttribute("data-src"), ...sources.map(s => s.getAttribute("src") || s.getAttribute("data-src"))].filter(Boolean);
        for (const raw of candidates) {
          const url = absolute(raw, pageUrl);
          if (!url) continue;
          const quoteInfo = quoteContext(video, pageUrl);
          addItem(items, { type: "video", url, playUrl: url, title: cleanText(video.getAttribute("title") || video.getAttribute("data-filename")) || "Video", sourcePage: messageLink, author, preview: "", ...quoteInfo });
        }
      }

      for (const frame of root.querySelectorAll("iframe")) {
        const url = absolute(frame.getAttribute("src") || frame.getAttribute("data-src"), pageUrl);
        if (!url || !/^https?:/i.test(url)) continue;
        const quoteInfo = quoteContext(frame, pageUrl);
        addItem(items, { type: "embed", url, title: cleanText(frame.title) || "Contenido incrustado", sourcePage: messageLink, author, ...quoteInfo });
      }

      // Adjuntos XenForo: el nombre del archivo permite saber si una página de adjunto es vídeo.
      for (const a of root.querySelectorAll(".message-attachments .file-preview,.attachmentList a[href],a[href*='/attachments/']")) {
        if (a.closest(".message-editorWrapper,.message-editor,.fr-element,.formRow,.attachmentUpload")) continue;
        if (/\/attachments\/upload(?:\?|$)/i.test(a.getAttribute("href") || "")) continue;
        const img = a.querySelector("img");
        if (img && classifyUrl(getImageUrl(img, pageUrl), img.alt || img.title) === "image") continue;
        const url = absolute(a.getAttribute("href"), pageUrl);
        if (!url) continue;
        const filename = cleanText(a.closest(".file")?.querySelector(".file-name")?.textContent || a.getAttribute("title") || a.querySelector("svg title")?.textContent || a.textContent) || "Adjunto";
        let type = classifyUrl(url, filename);
        if (/\/attachments\/[^/?#]*(?:-mp4|-webm|-mov|-m4v)(?:[./?#]|$)/i.test(url) || /\.(?:mp4|webm|mov|m4v)$/i.test(filename)) type = "video";
        if (/\.(?:jpe?g|png|gif|webp|avif|bmp)$/i.test(filename)) type = "image";
        if (type === "ui") continue;
        const quoteInfo = quoteContext(a, pageUrl);
        addItem(items, { type: ["image", "video"].includes(type) ? type : "attachment", url, title: filename, sourcePage: messageLink, author, preview: "", attachmentPage: url, ...quoteInfo });
      }

      // Enlaces visibles, excluyendo controles internos de XenForo.
      for (const a of root.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href") || "";
        const image = a.querySelector("img");
        if (/\/attachments\//i.test(href) && image && classifyUrl(getImageUrl(image, pageUrl), image.alt || image.title) === "image") continue;
        const excluded = a.closest(".message-attribution,.message-cell--user,.message-user,.message-signature,.bdMedal_messageUserMedals,.bdMedal_userMedals,.bdMedal_medalImage,.reactionsBar,.reactionSummary,.reaction,.bbCodeBlock-sourceJump");
        if (excluded || href.startsWith("#") || a.closest(".message-editorWrapper,.message-editor,.fr-element,.formRow,.attachmentUpload") ||
          /\/attachments\/upload(?:\?|$)/i.test(href) || a.matches("[data-xf-click='attribution']") ||
          /\/content-removal\//i.test(href) || /\/goto\/post(?:\?|\/|$)/i.test(href) ||
          /\/members\//i.test(href) || /\/posts\/\d+\/(?:share|reactions|report)(?:\?|$)/i.test(href) ||
          /\/threads\/[^/]+\/reply\?quote=\d+/i.test(href)) continue;
        const url = absolute(href, pageUrl);
        if (!url || !/^https?:/i.test(url)) continue;
        const label = cleanText(a.textContent || a.getAttribute("title") || image?.alt || url);
        let type = classifyUrl(url, label);
        if (/\/attachments\/[^/?#]*(?:-mp4|-webm|-mov|-m4v)(?:[./?#]|$)/i.test(url)) type = "video";
        if (type === "ui") continue;
        const quoteInfo = quoteContext(a, pageUrl);
        addItem(items, { type, url, title: label.slice(0, 300), sourcePage: messageLink, author, preview: type === "image" ? url : "", attachmentPage: /\/attachments\//i.test(url) ? url : "", ...quoteInfo });
      }

      // URLs escritas como texto en los mensajes.
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (node.parentElement?.closest("a,script,style,textarea")) continue;
        for (let candidate of (node.nodeValue || "").match(/(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi) || []) {
          candidate = candidate.replace(/[.,;!?)\]}]+$/g, "");
          const url = absolute(candidate.startsWith("www.") ? `https://${candidate}` : candidate, pageUrl);
          if (!url || !/^https?:/i.test(url)) continue;
          const type = classifyUrl(url, candidate);
          if (type === "ui") continue;
          const quoteInfo = quoteContext(node.parentElement || root, pageUrl);
          addItem(items, { type, url, title: candidate, sourcePage: messageLink, author, preview: type === "image" ? url : "", ...quoteInfo });
        }
      }
    }

    for (const a of doc.querySelectorAll(".pageNav a[href], .pageNavWrapper a[href], .pagination a[href], a[rel='next'][href]")) {
      const next = threadPageUrl(a.href, pageUrl);
      if (next) discoveredPages.add(next);
    }
  }

  async function resolveAttachmentMedia(items) {
    const pending = [...items.values()].filter(item => {
      if (!/\/attachments\//i.test(item.url) || item.type === "image") return false;
      try { return new URL(item.url).origin === location.origin; } catch { return false; }
    });
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        try {
          const response = await fetch(item.url, { credentials: "include", redirect: "follow" });
          if (!response.ok) continue;
          const html = await response.text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          const video = doc.querySelector("video");
          const source = video?.querySelector("source");
          const videoUrl = source?.getAttribute("src") || video?.getAttribute("src") ||
            doc.querySelector('meta[property="og:video"],meta[property="og:video:url"],meta[name="twitter:player:stream"]')?.getAttribute("content");
          if (videoUrl) {
            const direct = absolute(videoUrl, response.url || item.url);
            if (direct) { item.type = "video"; item.playUrl = direct; }
          } else if (item.type === "attachment" && /\.(?:jpe?g|png|gif|webp|avif|bmp)/i.test(item.title)) {
            const image = doc.querySelector(".bbImageWrapper[data-src],img.bbImage[src],img.bbImage[data-src]");
            const raw = image?.closest(".bbImageWrapper")?.getAttribute("data-src") || image?.getAttribute("data-src") || image?.getAttribute("src");
            const direct = absolute(raw, response.url || item.url);
            if (direct) { item.type = "image"; item.url = direct; item.preview = direct; }
          }
        } catch (error) {
          console.debug("No se pudo resolver el adjunto:", item.url, error);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
  }

  async function scrapeAllPages() {
    if (!activeThread) throw new Error("Abre un tema de PeruTops antes de iniciar la extracción.");
    const items = new Map();
    const visited = new Set();
    const queue = [threadPageUrl(location.href, location.href) || location.href.split("#")[0]];
    const pageErrors = [];
    let pagesScanned = 0;
    const persistedItemKeys = new Set();

    while (queue.length) {
      const pageUrl = queue.shift();
      if (!pageUrl || visited.has(pageUrl)) continue;
      visited.add(pageUrl);
      try {
        if (!threadIdentity.isSameThread(pageUrl, activeThread.threadUrl)) throw new Error("La URL no pertenece al tema activo.");
        let doc;
        if (pageUrl === threadPageUrl(location.href, location.href)) {
          doc = document;
        } else {
          const response = await fetch(pageUrl, { credentials: "include", redirect: "follow" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (response.url && !threadIdentity.isSameThread(response.url, activeThread.threadUrl)) {
            throw new Error("El servidor redirigió fuera del tema activo.");
          }
          const finalPageUrl = response.url ? threadPageUrl(response.url, response.url) : pageUrl;
          if (finalPageUrl && finalPageUrl !== pageUrl) {
            throw new Error("El servidor redirigió a otra página del tema; se evita contarla como esta página.");
          }
          if (!(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) {
            throw new Error("La respuesta no es una página HTML.");
          }
          doc = new DOMParser().parseFromString(await response.text(), "text/html");
        }
        const discovered = new Set();
        extractDocument(doc, pageUrl, items, discovered);
        pagesScanned++;
        for (const next of discovered) if (!visited.has(next) && !queue.includes(next)) queue.push(next);

        // Guarda los nuevos recursos por página: si la pestaña o el service worker
        // desaparecen, los resultados parciales ya procesados sobreviven en IndexedDB.
        const newItems = [];
        for (const item of items.values()) {
          if (!persistedItemKeys.has(item.url)) {
            persistedItemKeys.add(item.url);
            newItems.push(item);
          }
        }
        for (let offset = 0; offset < newItems.length; offset += 100) {
          await sendToBackground({
            type: "EXTRACTOR_PAGE_BATCH", sessionId: activeSessionId,
            items: newItems.slice(offset, offset + 100), pagesScanned, itemsFound: items.size
          });
        }
        await sendToBackground({
          type: "EXTRACTOR_PROGRESS", sessionId: activeSessionId, threadId: activeThread.threadId,
          pagesScanned, pagesQueued: queue.length, itemsFound: items.size,
          pagesFailed: pageErrors.length, pageErrors: pageErrors.slice(-100), currentPageUrl: pageUrl
        });
      } catch (error) {
        pageErrors.push({ url: pageUrl, message: error?.message || "Error desconocido" });
        console.warn("Ext-Media: no se pudo procesar la página", pageUrl, error);
        await sendToBackground({
          type: "EXTRACTOR_PROGRESS", sessionId: activeSessionId, threadId: activeThread.threadId,
          pagesScanned, pagesQueued: queue.length, itemsFound: items.size,
          pagesFailed: pageErrors.length, pageErrors: pageErrors.slice(-100), currentPageUrl: pageUrl
        }).catch(() => {});
      }
    }

    await resolveAttachmentMedia(items);
    const finalItems = [...items.values()];
    // Se envía un snapshot final en lotes para actualizar URLs resueltas sin
    // depender de un mensaje gigante ni perder la posibilidad de guardar progreso.
    if (finalItems.length) {
      for (let offset = 0; offset < finalItems.length; offset += 100) {
        await sendToBackground({
          type: "EXTRACTOR_PAGE_BATCH", sessionId: activeSessionId,
          items: finalItems.slice(offset, offset + 100), itemsFound: finalItems.length,
          replaceExisting: offset === 0
        });
      }
    } else {
      await sendToBackground({
        type: "EXTRACTOR_PAGE_BATCH", sessionId: activeSessionId,
        items: [], itemsFound: 0, replaceExisting: true
      });
    }
    return {
      items: [], pagesScanned, pagesFailed: pageErrors.length,
      pageErrors, complete: pageErrors.length === 0, sessionId: activeSessionId, sourceUrl: location.href,
      threadId: activeThread.threadId, threadUrl: activeThread.threadUrl
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "START_EXTRACTOR") return;
    if (!activeThread) { sendResponse({ ok: false, error: "Abre un tema de PeruTops válido antes de iniciar." }); return; }
    if (running) { sendResponse({ ok: false, error: "Ya hay una extracción en curso." }); return; }
    running = true;
    activeSessionId = crypto.randomUUID();
    const sessionId = activeSessionId;
    (async () => {
      let responseSent = false;
      try {
        await sendToBackground({
          type: "EXTRACTOR_STARTED", sessionId, sourceUrl: location.href,
          threadId: activeThread.threadId, threadUrl: activeThread.threadUrl
        });
        sendResponse({ ok: true, sessionId });
        responseSent = true;
        const result = await scrapeAllPages();
        await sendToBackground({ type: "EXTRACTOR_RESULTS", ...result });
      } catch (error) {
        const messageText = error?.message || "La extracción falló.";
        if (!responseSent) sendResponse({ ok: false, error: messageText });
        // Si el trabajo ya comenzó, se conserva un registro fallido en el repositorio local.
        try {
          await sendToBackground({
            type: "EXTRACTOR_RESULTS", sessionId, items: [], pagesScanned: 0,
            sourceUrl: location.href, threadId: activeThread.threadId,
            threadUrl: activeThread.threadUrl, complete: false, error: messageText
          });
        } catch {}
      } finally {
        running = false;
        activeSessionId = "";
      }
    })();
    return true;
  });
})();
