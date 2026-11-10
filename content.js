(() => {
  if (window.__extractorMultimediaInstalled) return;
  window.__extractorMultimediaInstalled = true;

  const threadIdentity = globalThis.ExtMediaThreadIdentity;
  const parser = globalThis.ExtMediaPeruTopsParser;
  if (!parser) throw new Error("No se cargó el parser de PeruTops.");
  if (!threadIdentity) throw new Error("No se cargó el módulo de identidad de tema.");

  const REQUEST_GAP_MS = 2000;
  let lastRequestStartedAt = 0;
  let running = false;
  let activeSessionId = "";

  class ExtractionStopError extends Error {
    constructor(message, code) { super(message); this.name = "ExtractionStopError"; this.code = code; }
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function pacedFetch(url, options = {}) {
    const remaining = lastRequestStartedAt + REQUEST_GAP_MS - Date.now();
    if (lastRequestStartedAt && remaining > 0) await sleep(remaining);
    // El intervalo se mide entre inicios de request. Si la respuesta tarda más
    // de 2 s, no se añade una espera artificial adicional.
    lastRequestStartedAt = Date.now();
    return fetch(url, { credentials: "include", redirect: "follow", ...options });
  }

  function stopForHttpStatus(response, context) {
    if ([401, 403, 429].includes(response.status)) {
      const label = response.status === 429 ? "El foro limitó temporalmente las solicitudes (HTTP 429)." :
        response.status === 403 ? "El foro denegó el acceso (HTTP 403)." : "La sesión ya no está autorizada (HTTP 401).";
      throw new ExtractionStopError(`${label} La extracción se detuvo sin reintentos automáticos.`, `HTTP_${response.status}`);
    }
  }

  function detectLoginOrVerification(doc, url) {
    let pathname = "";
    try { pathname = new URL(url, location.href).pathname; } catch {}
    if (/\/(?:login|signin|sign-in|captcha|challenge|verification|verify)(?:\/|$)/i.test(pathname)) {
      return "Se detectó una redirección a inicio de sesión o verificación.";
    }
    const hasForumPosts = Boolean(doc.querySelector('.message, article.message, .message-cell--main, .js-post, [data-content="post"]'));
    if (!hasForumPosts && doc.querySelector('form[action*="login" i], form[action*="signin" i], input[type="password"]')) {
      return "Se detectó un formulario de inicio de sesión.";
    }
    if (!hasForumPosts && doc.querySelector('#captcha, [id*="captcha" i], [class*="captcha" i], .g-recaptcha, .h-captcha, iframe[src*="captcha" i], input[name*="verification" i]')) {
      return "Se detectó una pantalla de CAPTCHA o verificación.";
    }
    if (!hasForumPosts) {
      const text = `${doc.title || ""} ${doc.querySelector("h1")?.textContent || ""} ${doc.body?.innerText?.slice(0, 1800) || ""}`.toLowerCase();
      if (/(verify you are human|checking your browser|security check|unusual traffic|captcha|inicia sesión para continuar|debes iniciar sesión|verifica que eres humano|actividad inusual)/i.test(text)) {
        return "Se detectó una pantalla de seguridad o verificación.";
      }
    }
    return "";
  }

  function stopForGate(doc, url) {
    const reason = detectLoginOrVerification(doc, url);
    if (reason) throw new ExtractionStopError(`${reason} La extracción se detuvo sin reintentos automáticos.`, "AUTH_OR_VERIFICATION_GATE");
  }

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
        if (item.isQuoted) {
          previous.isQuoted = true;
          previous.quotedAuthor ||= item.quotedAuthor;
          previous.quotedPostUrl ||= item.quotedPostUrl;
        }
        previous.preview ||= item.preview;
        previous.attachmentPage ||= item.attachmentPage;
      }
    }
    for (const raw of result.discoveredPages) {
      const next = threadPageUrl(raw, pageUrl);
      if (next) discoveredPages.add(next);
    }
  }

  // Se resuelve de forma secuencial: evita ráfagas de solicitudes al foro.
  async function resolveAttachmentMedia(items) {
    const pending = [...items.values()].filter(item => {
      const page = item.attachmentPage || (parser.isForumAttachmentPage(item.url, location.href) ? item.url : "");
      if (!page) return false;
      try { return new URL(page).origin === location.origin; } catch { return false; }
    });
    for (const item of pending) {
      const attachmentPage = item.attachmentPage || item.url;
      try {
        const response = await pacedFetch(attachmentPage);
        stopForHttpStatus(response, "adjunto");
        if (response.url) stopForGate(new DOMParser().parseFromString("", "text/html"), response.url);
        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (contentType.startsWith("image/")) {
          item.url = response.url || attachmentPage;
          item.type = "image";
          item.original = true;
          continue;
        }
        if (!contentType.includes("text/html")) continue;
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        stopForGate(doc, response.url || attachmentPage);
        const video = doc.querySelector("video");
        const source = video?.querySelector("source");
        const videoUrl = source?.getAttribute("src") || video?.getAttribute("src") ||
          doc.querySelector('meta[property="og:video"],meta[property="og:video:url"],meta[name="twitter:player:stream"]')?.getAttribute("content");
        const image = doc.querySelector(".bbImageWrapper[data-src] img, img.bbImage[data-src], img.bbImage[src], .attachment-content img[src], img[data-attachment]");
        const imageUrl = image?.closest(".bbImageWrapper")?.getAttribute("data-src") ||
          image?.getAttribute("data-url") || image?.getAttribute("data-src") || image?.getAttribute("src") ||
          doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
        if (videoUrl) {
          const direct = new URL(videoUrl, response.url || attachmentPage).href;
          if (["http:", "https:"].includes(new URL(direct).protocol)) { item.type = "video"; item.playUrl = direct; item.url = direct; }
        } else if (imageUrl) {
          const direct = new URL(imageUrl, response.url || attachmentPage).href;
          if (["http:", "https:"].includes(new URL(direct).protocol)) { item.type = "image"; item.url = direct; item.original = true; }
        }
      } catch (error) {
        if (error instanceof ExtractionStopError) return error;
        item.resolveError = error?.message || "No se pudo resolver el adjunto";
        console.debug("No se pudo resolver el adjunto:", attachmentPage, error);
      }
    }
    return null;
  }

  async function scrapeAllPages() {
    if (!activeThread) throw new Error("Abre un tema de PeruTops antes de iniciar la extracción.");
    stopForGate(document, location.href);
    const visited = new Set();
    const queued = new Set();
    const queue = [threadPageUrl(location.href, location.href) || location.href.split("#")[0]];
    queued.add(queue[0]);
    const pageErrors = [];
    const persistedKeys = new Set();
    let stopError = null;
    let pagesScanned = 0;
    let itemsFound = 0;

    while (queue.length && !stopError) {
      const pageUrl = queue.shift();
      if (!pageUrl || visited.has(pageUrl)) continue;
      visited.add(pageUrl);
      let pageItems = new Map();
      try {
        if (!threadIdentity.isSameThread(pageUrl, activeThread.threadUrl)) throw new Error("La URL no pertenece al tema activo.");
        let doc;
        if (pageUrl === threadPageUrl(location.href, location.href)) doc = document;
        else {
          const response = await pacedFetch(pageUrl);
          stopForHttpStatus(response, "página");
          if (response.url) {
            const responsePath = new URL(response.url).pathname;
            if (/\/(?:login|signin|sign-in|captcha|challenge|verification|verify)(?:\/|$)/i.test(responsePath)) {
              throw new ExtractionStopError("El foro redirigió a inicio de sesión o verificación. La extracción se detuvo sin reintentos automáticos.", "AUTH_OR_VERIFICATION_GATE");
            }
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (response.url && !threadIdentity.isSameThread(response.url, activeThread.threadUrl)) throw new ExtractionStopError("El foro redirigió fuera del tema activo. La extracción se detuvo por seguridad.", "UNEXPECTED_REDIRECT");
          const finalPageUrl = response.url ? threadPageUrl(response.url, response.url) : pageUrl;
          if (finalPageUrl && finalPageUrl !== pageUrl) throw new Error("El servidor redirigió a otra página del tema.");
          if (!(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) throw new Error("La respuesta no es una página HTML.");
          doc = new DOMParser().parseFromString(await response.text(), "text/html");
          stopForGate(doc, response.url || pageUrl);
        }

        const discovered = new Set();
        extractDocument(doc, pageUrl, pageItems, discovered);
        for (const next of discovered) {
          if (!visited.has(next) && !queued.has(next)) { queue.push(next); queued.add(next); }
        }
        // La página cuenta como procesada antes de resolver adjuntos: así una
        // barrera de seguridad durante esa fase produce un resultado parcial.
        pagesScanned++;
        const attachmentStop = await resolveAttachmentMedia(pageItems);

        const batch = [];
        for (const [key, item] of pageItems) {
          if (!persistedKeys.has(key)) { persistedKeys.add(key); itemsFound++; }
          batch.push(item);
        }
        for (let offset = 0; offset < batch.length; offset += 100) {
          await sendToBackground({
            type: "EXTRACTOR_PAGE_BATCH", sessionId: activeSessionId,
            items: batch.slice(offset, offset + 100), pagesScanned, itemsFound
          });
        }
        pageItems.clear();
        await sendToBackground({
          type: "EXTRACTOR_PROGRESS", sessionId: activeSessionId, threadId: activeThread.threadId,
          pagesScanned, pagesQueued: queue.length, itemsFound,
          pagesFailed: pageErrors.length, pageErrors: pageErrors.slice(-100), currentPageUrl: pageUrl,
          stopReason: attachmentStop?.code || ""
        });
        if (attachmentStop) {
          stopError = attachmentStop;
          pageErrors.push({ url: pageUrl, message: attachmentStop.message, code: attachmentStop.code });
        }
      } catch (error) {
        const message = error?.message || "Error desconocido";
        pageErrors.push({ url: pageUrl, message, code: error?.code || "PAGE_ERROR" });
        if (error instanceof ExtractionStopError) stopError = error;
        console.warn("Ext-Media: extracción detenida o página no procesada", pageUrl, error);
        await sendToBackground({
          type: "EXTRACTOR_PROGRESS", sessionId: activeSessionId, threadId: activeThread.threadId,
          pagesScanned, pagesQueued: queue.length, itemsFound,
          pagesFailed: pageErrors.length, pageErrors: pageErrors.slice(-100), currentPageUrl: pageUrl,
          stopReason: stopError?.code || ""
        }).catch(() => {});
      }
    }

    const stopMessage = stopError?.message || "";
    return {
      items: [], pagesScanned, pagesFailed: pageErrors.length, pageErrors,
      complete: pageErrors.length === 0 && !stopError,
      error: stopMessage, stopReason: stopError?.code || "",
      sessionId: activeSessionId, sourceUrl: location.href,
      threadId: activeThread.threadId, threadUrl: activeThread.threadUrl
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "START_EXTRACTOR") return;
    if (!activeThread) { sendResponse({ ok: false, error: "Abre un tema de PeruTops válido antes de iniciar." }); return; }
    if (running) { sendResponse({ ok: false, error: "Ya hay una extracción en curso." }); return; }
    running = true;
    // El primer request de la extensión también espera 2 s desde el inicio.
    lastRequestStartedAt = Date.now();
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
        try {
          await sendToBackground({
            type: "EXTRACTOR_RESULTS", sessionId, items: [], pagesScanned: 0,
            sourceUrl: location.href, threadId: activeThread.threadId,
            threadUrl: activeThread.threadUrl, complete: false, error: messageText,
            stopReason: error?.code || "UNEXPECTED_ERROR"
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
