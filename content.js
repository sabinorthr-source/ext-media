(() => {
  if (window.__extractorMultimediaInstalled) return;
  window.__extractorMultimediaInstalled = true;

  const threadIdentity = globalThis.ExtMediaThreadIdentity;
  const parser = globalThis.ExtMediaPeruTopsParser;
  if (!parser) throw new Error("No se cargó el parser de PeruTops.");
  if (!threadIdentity) throw new Error("No se cargó el módulo de identidad de tema.");
  let running = false;
  let activeSessionId = "";

  const absolute = (value, base) => {
    if (!value) return "";
    try { return new URL(value, base).href; } catch { return ""; }
  };

  async function sendToBackground(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (response?.ok === false) throw new Error(response.error || "El service worker rechazó la operación.");
    return response;
  }

  const activeThread = threadIdentity.getThreadIdentity(location.href);
  if (!activeThread) console.warn("Ext-Media: la pestaña activa no corresponde a un tema válido de PeruTops.");

  function threadPageUrl(raw, base) {
    if (!activeThread) return "";
    return threadIdentity.normalizeThreadPage(raw, activeThread.threadUrl, base || location.href);
  }

  function extractDocument(doc, pageUrl, items, discoveredPages) {
    const result = parser.extractPage(doc, pageUrl);
    for (const item of result.items) {
      const key = item.attachmentId ? `attachment:${item.attachmentId}` : item.url;
      item.dedupeKey = key;
      const previous = items.get(key);
      if (!previous) items.set(key, item);
      else {
        previous.preview ||= item.preview;
        previous.attachmentPage ||= item.attachmentPage;
      }
    }
    for (const raw of result.discoveredPages) {
      const next = threadPageUrl(raw, pageUrl);
      if (next) discoveredPages.add(next);
    }
  }
 
  async function resolveAttachmentMedia(items) {
    const pending = [...items.values()].filter(item => {
      const page = item.attachmentPage ||
        (parser.isForumAttachmentPage(item.url, location.href)
          ? item.url
          : "");

      if (!page) return false;

      try {
        return new URL(page).origin === location.origin;
      } catch {
        return false;
      }
    });

    let cursor = 0;

    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];

        const attachmentPage = item.attachmentPage || item.url;

        // Guardamos la miniatura antes de resolver el original.
        const thumbnail = item.preview || item.fallbackUrl || "";

        try {
          const resolved = await chrome.runtime.sendMessage({
            type: "RESOLVE_ATTACHMENT_PAGE",
            url: attachmentPage
          });

          if (!resolved?.ok) {
            item.resolveError =
              resolved?.error || "No se pudo resolver el adjunto.";

            item.resolveStatus = Number(resolved?.status) || 0;
            continue;
          }

          // Respuesta directa: imagen original.
          if (resolved.kind === "image") {
            item.url = resolved.url || attachmentPage;
            item.type = "image";
            item.original = true;

            // Nunca reemplazar una miniatura existente por el original.
            item.preview = thumbnail || item.url;
            item.fallbackUrl = thumbnail || item.url;

            item.attachmentPage = attachmentPage;
            item.resolveError = "";
            item.resolveStatus = 0;

            continue;
          }

          // Respuesta directa: video original.
          if (resolved.kind === "video") {
            item.url = resolved.url || attachmentPage;
            item.playUrl = item.url;
            item.type = "video";

            item.attachmentPage = attachmentPage;
            item.resolveError = "";
            item.resolveStatus = 0;

            continue;
          }

          if (resolved.kind !== "html" || !resolved.html) {
            item.resolveError =
              `Tipo de respuesta no compatible${
                resolved.contentType
                  ? ` (${resolved.contentType})`
                  : ""
              }.`;

            item.resolveStatus = 0;
            continue;
          }

          const doc = new DOMParser().parseFromString(
            resolved.html,
            "text/html"
          );

          const video = doc.querySelector("video");
          const source = video?.querySelector("source");

          const videoUrl =
            source?.getAttribute("src") ||
            video?.getAttribute("src") ||
            doc.querySelector(
              'meta[property="og:video"],' +
              'meta[property="og:video:url"],' +
              'meta[name="twitter:player:stream"]'
            )?.getAttribute("content");

          const image =
            doc.querySelector(
              ".bbImageWrapper[data-src] img," +
              "img.bbImage[data-src]," +
              "img.bbImage[src]," +
              ".attachment-content img[src]," +
              "img[data-attachment]"
            );

          const imageUrl =
            image?.closest(".bbImageWrapper")?.getAttribute("data-src") ||
            image?.getAttribute("data-original") ||
            image?.getAttribute("data-url") ||
            image?.getAttribute("data-src") ||
            image?.getAttribute("src") ||
            doc.querySelector('meta[property="og:image"]')
              ?.getAttribute("content");

          if (videoUrl) {
            const direct = absolute(
              videoUrl,
              resolved.url || attachmentPage
            );

            if (direct) {
              item.type = "video";
              item.url = direct;
              item.playUrl = direct;
              item.resolveError = "";
            }
          } else if (imageUrl) {
            const direct = absolute(
              imageUrl,
              resolved.url || attachmentPage
            );

            if (direct) {
              item.type = "image";
              item.url = direct;
              item.original = true;

              // La miniatura sigue siendo independiente del original.
              item.preview = thumbnail || direct;
              item.fallbackUrl = thumbnail || direct;

              item.resolveError = "";
            }
          } else {
            item.resolveError =
              "La página del adjunto no contiene una imagen o un video accesible.";

            item.resolveStatus = 200;
          }

          item.attachmentPage = attachmentPage;
        } catch (error) {
          item.resolveError =
            error?.message || "No se pudo resolver el adjunto.";

          item.resolveStatus = 0;

          console.debug(
            "No se pudo resolver el adjunto:",
            attachmentPage,
            error
          );
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(4, pending.length) },
        worker
      )
    );
  }

  async function scrapeAllPages() {
    if (!activeThread) throw new Error("Abre un tema de PeruTops antes de iniciar la extracción.");
    const visited = new Set();
    const queued = new Set();
    const queue = [threadPageUrl(location.href, location.href) || location.href.split("#")[0]];
    queued.add(queue[0]);
    const pageErrors = [];
    const persistedKeys = new Set();
    let fatalStorageError = "";
    let pagesScanned = 0;
    let itemsFound = 0;

    while (queue.length && !fatalStorageError) {
      const pageUrl = queue.shift();
      if (!pageUrl || visited.has(pageUrl)) continue;
      visited.add(pageUrl);
      try {
        if (!threadIdentity.isSameThread(pageUrl, activeThread.threadUrl)) throw new Error("La URL no pertenece al tema activo.");
        let doc;
        if (pageUrl === threadPageUrl(location.href, location.href)) doc = document;
        else {
          const response = await fetch(pageUrl, { credentials: "include", redirect: "follow" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (response.url && !threadIdentity.isSameThread(response.url, activeThread.threadUrl)) throw new Error("El servidor redirigió fuera del tema activo.");
          const finalPageUrl = response.url ? threadPageUrl(response.url, response.url) : pageUrl;
          if (finalPageUrl && finalPageUrl !== pageUrl) throw new Error("El servidor redirigió a otra página del tema.");
          if (!(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) throw new Error("La respuesta no es una página HTML.");
          doc = new DOMParser().parseFromString(await response.text(), "text/html");
        }

        // Cada página vive en memoria solo durante su procesamiento. No mantenemos
        // un Map global con todos los recursos del tema.
        const pageItems = new Map();
        const discovered = new Set();
        extractDocument(doc, pageUrl, pageItems, discovered);
        for (const next of discovered) {
          if (!visited.has(next) && !queued.has(next)) { queue.push(next); queued.add(next); }
        }
        await resolveAttachmentMedia(pageItems);

        const batch = [];
        for (const [key, item] of pageItems) {
          if (!persistedKeys.has(key)) { persistedKeys.add(key); itemsFound++; }
          // Se envían también duplicados encontrados en otras páginas para que el
          // repositorio fusione la atribución cuando un recurso aparece en varias publicaciones.
          batch.push(item);
        }
        for (let offset = 0; offset < batch.length; offset += 100) {
          await sendToBackground({
            type: "EXTRACTOR_PAGE_BATCH", sessionId: activeSessionId,
            items: batch.slice(offset, offset + 100), pagesScanned: pagesScanned + 1,
            itemsFound
          });
        }
        pagesScanned++;
        await sendToBackground({
          type: "EXTRACTOR_PROGRESS", sessionId: activeSessionId, threadId: activeThread.threadId,
          pagesScanned, pagesQueued: queue.length, itemsFound,
          pagesFailed: pageErrors.length, pageErrors: pageErrors.slice(-100), currentPageUrl: pageUrl
        });
        pageItems.clear();
      } catch (error) {
        const message = error?.message || "Error desconocido";
        pageErrors.push({ url: pageUrl, message });
        if (error?.name === "QuotaExceededError" || /almacenamiento local.*lleno|cuota/i.test(message)) fatalStorageError = message;
        console.warn("Ext-Media: no se pudo procesar la página", pageUrl, error);
        await sendToBackground({
          type: "EXTRACTOR_PROGRESS", sessionId: activeSessionId, threadId: activeThread.threadId,
          pagesScanned, pagesQueued: queue.length, itemsFound,
          pagesFailed: pageErrors.length, pageErrors: pageErrors.slice(-100), currentPageUrl: pageUrl
        }).catch(() => {});
      }
    }

    return {
      items: [], pagesScanned, pagesFailed: pageErrors.length, pageErrors,
      complete: pageErrors.length === 0 && !fatalStorageError, error: fatalStorageError,
      sessionId: activeSessionId, sourceUrl: location.href,
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
