(() => {
  if (window.__extractorMultimediaInstalled) return;
  window.__extractorMultimediaInstalled = true;

  const TYPES = ExtractorProtocol.TYPES;
  const PAGE_TIMEOUT_MS = 20000;
  let runId = null;
  let controller = null;

  function fetchPage(url, signal) {
    const local = new AbortController();
    const timer = setTimeout(() => local.abort(new Error("PAGE_TIMEOUT")), PAGE_TIMEOUT_MS);
    const abort = () => local.abort(signal.reason || new DOMException("Cancelado", "AbortError"));
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    return fetch(url, { credentials: "include", redirect: "follow", signal: local.signal })
      .finally(() => { clearTimeout(timer); signal.removeEventListener("abort", abort); });
  }
  async function progress(currentRunId, data) {
    try { await chrome.runtime.sendMessage({ type: TYPES.PROGRESS, runId: currentRunId, ...data }); } catch {}
  }
  function isLogin(response, doc) {
    const url = String(response.url || "").toLowerCase();
    return /\/(?:login|register)(?:[/?#]|$)/.test(url) ||
      (!!doc.querySelector('form[action*="login"], input[name="login"]') && /sign in|iniciar sesión|iniciar sesion/i.test(`${doc.title} ${doc.body?.textContent?.slice(0, 500)}`));
  }
  function validPage(raw, identity) {
    try {
      const url = new URL(raw, identity.origin);
      const parsed = ExtractorProtocol.parseThreadIdentity(url.href);
      if (!parsed || url.origin !== identity.origin || parsed.threadId !== identity.threadId) return "";
      url.hash = "";
      return url.href;
    } catch { return ""; }
  }
  function isLikelyThreadLink(raw, currentIdentity) {
    try {
      const url = new URL(raw, currentIdentity.origin);
      const identity = ExtractorProtocol.parseThreadIdentity(url.href);
      if (!identity || identity.origin !== currentIdentity.origin || identity.threadId === currentIdentity.threadId) return null;
      url.hash = "";
      return { url: url.href, identity };
    } catch { return null; }
  }

  async function scrape(signal, currentRunId, startIdentity, options) {
    const maxPages = Math.max(1, Math.min(5000, Number(options.maxPages) || 1000));
    const includeLinkedThreads = options.includeLinkedThreads === true;
    const maxLinkedThreads = Math.max(0, Math.min(100, Number(options.maxLinkedThreads) || 25));
    const items = new Map();
    const queue = ExtractorThreadCrawler.createQueue(location.href.split("#")[0], startIdentity);
    const visited = new Set();
    const failedPages = [];
    const linkedSeen = new Set();
    let pagesScanned = 0;
    let pagesAttempted = 0;
    let stopReason = "COMPLETED";

    while (queue.length && pagesAttempted < maxPages) {
      if (signal.aborted || currentRunId !== runId) throw new DOMException("Cancelado", "AbortError");
      const task = queue.shift();
      const pageUrl = validPage(task.url, task.identity);
      const visitKey = `${task.identity.threadId}|${pageUrl}`;
      if (!pageUrl || visited.has(visitKey)) continue;
      visited.add(visitKey);
      pagesAttempted++;
      try {
        let doc;
        if (pageUrl === location.href.split("#")[0]) doc = document;
        else {
          const response = await fetchPage(pageUrl, signal);
          if (response.status === 401 || response.status === 403) throw new Error(`ACCESS_DENIED_HTTP_${response.status}`);
          if (!response.ok) throw new Error(`HTTP_${response.status}`);
          if (!/text\/html/i.test(response.headers.get("content-type") || "")) throw new Error("INVALID_CONTENT_TYPE");
          doc = new DOMParser().parseFromString(await response.text(), "text/html");
          if (isLogin(response, doc)) throw new Error("AUTH_REQUIRED");
          const finalIdentity = ExtractorProtocol.parseThreadIdentity(response.url);
          if (!finalIdentity || finalIdentity.threadId !== task.identity.threadId || finalIdentity.origin !== task.identity.origin) throw new Error("REDIRECT_OUT_OF_THREAD");
        }
        const parsed = ExtractorXenForo.extractDocument(doc, pageUrl);
        if (!parsed.postsFound) throw new Error("NO_XENFORO_POSTS");
        for (const item of parsed.items) {
          item.threadId = task.identity.threadId;
          item.threadUrl = `${task.identity.origin}/threads/${task.identity.threadSlug}/`;
          const key = ExtractorMedia.normalize(item.url);
          const existing = items.get(key);
          if (!existing) items.set(key, item);
          else {
            const sources = item.sources || [];
            for (const source of sources) {
              if (!existing.sources.some(s => s.sourcePage === source.sourcePage && s.postId === source.postId && s.context === source.context)) existing.sources.push(source);
            }
            if (existing.context === "quoted" && item.context === "post") existing.context = "post";
            if (existing.type === "attachment" && ["image", "video"].includes(item.type)) existing.type = item.type;
          }
        }
        pagesScanned++;
        for (const raw of parsed.nextPages) {
          const next = validPage(raw, task.identity);
          if (next) ExtractorThreadCrawler.enqueueUnique(queue, visited, next, task.identity, task.depth);
        }
        for (const raw of parsed.linkedThreads) {
          const linked = isLikelyThreadLink(raw, task.identity);
          if (!linked) continue;
          linkedSeen.add(linked.identity.threadId);
          if (includeLinkedThreads && task.depth < 1 && linkedSeen.size <= maxLinkedThreads) {
            ExtractorThreadCrawler.enqueueUnique(queue, visited, linked.url, linked.identity, task.depth + 1);
          }
        }
      } catch (error) {
        if (signal.aborted) throw error;
        failedPages.push({ url: pageUrl, threadId: task.identity.threadId, reason: error?.message || "UNKNOWN_ERROR" });
      }
      await progress(currentRunId, {
        phase: "crawling", pagesScanned, pagesAttempted, pagesFailed: failedPages.length, itemsFound: items.size,
        pendingPages: queue.length, linkedThreadsFound: linkedSeen.size,
        ...(pagesScanned % 10 === 0 ? { checkpointItems: [...items.values()], failedPages: [...failedPages] } : {})
      });
    }
    if (queue.length && pagesAttempted >= maxPages) stopReason = "PAGE_LIMIT_REACHED";
    else if (failedPages.length) stopReason = "PAGES_FAILED";

    const attachmentItems = [...items.values()].filter(item => item.type === "attachment" || item.attachmentPage);
    await progress(currentRunId, { phase: "resolving_attachments", pagesScanned, pagesFailed: failedPages.length, itemsFound: items.size, attachmentsTotal: attachmentItems.length, attachmentsResolved: 0, checkpointItems: [...items.values()], failedPages: [...failedPages] });
    await ExtractorAttachmentResolver.resolveAll([...items.values()], {
      signal, concurrency: 4,
      onProgress: async ({ completed, total }) => {
        await progress(currentRunId, { phase: "resolving_attachments", pagesScanned, pagesFailed: failedPages.length, itemsFound: items.size, attachmentsTotal: total, attachmentsResolved: completed, ...(completed % 10 === 0 || completed === total ? { checkpointItems: [...items.values()], failedPages: [...failedPages] } : {}) });
      }
    });
    const complete = stopReason === "COMPLETED" && failedPages.length === 0 && queue.length === 0;
    return {
      items: [...items.values()], pagesScanned, pagesAttempted, pagesFailed: failedPages.length, failedPages,
      pendingPages: queue.length, stopReason, complete, status: complete ? "complete" : "partial",
      sourceUrl: location.href, threadId: startIdentity.threadId, runId: currentRunId,
      threadsScanned: new Set([...visited].map(k => k.split("|")[0])).size,
      linkedThreadsFound: linkedSeen.size, linkedThreadsScanned: includeLinkedThreads ? Math.max(0, new Set([...visited].map(k => k.split("|")[0])).size - 1) : 0,
      includeLinkedThreads, maxPages, concurrency: 4
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === TYPES.CANCEL) {
      controller?.abort(); runId = null; sendResponse({ ok: true }); return;
    }
    if (message?.type !== TYPES.START) return;
    const identity = ExtractorProtocol.parseThreadIdentity(location.href);
    if (!identity) { sendResponse({ ok: false, error: "La página actual no es un tema válido de XenForo." }); return; }
    if (String(message.threadId || identity.threadId) !== identity.threadId) { sendResponse({ ok: false, error: "El identificador del tema no coincide con la pestaña actual." }); return; }
    controller?.abort();
    runId = message.runId || String(Date.now());
    const currentRunId = runId;
    controller = new AbortController();
    const signal = controller.signal;
    sendResponse({ ok: true, runId: currentRunId, threadId: identity.threadId });
    scrape(signal, currentRunId, identity, message.options || {})
      .then(result => { if (!signal.aborted && runId === currentRunId) return chrome.runtime.sendMessage({ type: TYPES.RESULTS, ...result }); })
      .catch(error => {
        if (!signal.aborted && runId === currentRunId) chrome.runtime.sendMessage({ type: TYPES.RESULTS, items: [], pagesScanned: 0, pagesFailed: 1, failedPages: [{ url: location.href, reason: error?.message || "EXTRACTION_FAILED" }], pendingPages: 0, stopReason: "EXTRACTION_FAILED", complete: false, status: "failed", sourceUrl: location.href, threadId: identity.threadId, runId: currentRunId, error: error?.message || "La extracción falló." }).catch(() => {});
      })
      .finally(() => { if (runId === currentRunId) controller = null; });
  });
})();
