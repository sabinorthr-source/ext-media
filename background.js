importScripts("shared/job-state.js", "shared/session-lifecycle.js", "storage/indexed-db.js", "storage/job-repository.js");

const repository = globalThis.ExtMediaJobRepository;
const galleryBaseUrl = chrome.runtime.getURL("gallery.html");

async function updateBadge(text) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    await chrome.action.setBadgeText({ text: String(text || "") });
    await chrome.action.setTitle({ title: text ? `Ext-Media · ${text} páginas procesadas` : "Ext-Media" });
  } catch { /* API no disponible en contextos de prueba. */ }
}

function parseGallerySession(url) {
  try {
    const candidate = new URL(url);
    const base = new URL(galleryBaseUrl);
    if (candidate.origin !== base.origin || candidate.pathname !== base.pathname) return null;
    const sessionId = candidate.searchParams.get("sessionId") || "";
    return /^[a-z0-9-]{20,80}$/i.test(sessionId) ? sessionId : null;
  } catch { return null; }
}

const PERUTOPS_ALLOWED_HOSTS = new Set(["perutops.com", "www.perutops.com", "media.perutops.com"]);

async function resolveAttachmentPage(rawUrl, sender) {
  let target;
  try { target = new URL(rawUrl); } catch { return { ok: false, error: "URL del adjunto inválida." }; }
  const senderHost = (() => { try { return new URL(sender.url || "").hostname; } catch { return ""; } })();
  if (!sender.tab || !PERUTOPS_ALLOWED_HOSTS.has(senderHost) || target.protocol !== "https:" || !PERUTOPS_ALLOWED_HOSTS.has(target.hostname)) {
    return { ok: false, error: "La resolución del adjunto no está autorizada para este origen." };
  }
  try {
    const response = await fetch(target.href, { credentials: "include", redirect: "follow", cache: "no-store" });
    if (!response.ok) return { ok: false, status: response.status, error: `El servidor rechazó el adjunto (HTTP ${response.status}).` };
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.startsWith("image/")) {
      const url = response.url || target.href;
      try { await response.body?.cancel(); } catch {}
      return { ok: true, kind: "image", url, contentType };
    }
    if (contentType.startsWith("video/")) {
      const url = response.url || target.href;
      try { await response.body?.cancel(); } catch {}
      return { ok: true, kind: "video", url, contentType };
    }
    if (contentType.includes("text/html")) return { ok: true, kind: "html", url: response.url || target.href, contentType, html: await response.text() };
    const url = response.url || target.href;
    try { await response.body?.cancel(); } catch {}
    return { ok: true, kind: "other", url, contentType };
  } catch (error) {
    return { ok: false, status: 0, error: error?.message || "No se pudo consultar el adjunto por un error de red o permisos." };
  }
}

async function reconcileOpenGalleries() {
  const [browserTabs, registeredTabs] = await Promise.all([
    chrome.tabs.query({}), repository.listGalleryTabs()
  ]);
  const openById = new Map(browserTabs
    .map(tab => ({ tabId: tab.id, sessionId: parseGallerySession(tab.url || "") }))
    .filter(tab => Number.isInteger(tab.tabId) && tab.sessionId)
    .map(tab => [tab.tabId, tab.sessionId]));
  const staleTabIds = [];
  // Verifica los registros que no aparecieron en la primera instantánea. Así una
  // pestaña creada concurrentemente no pierde su asociación durante la recuperación.
  for (const record of registeredTabs) {
    if (openById.has(record.tabId)) continue;
    try {
      const tab = await chrome.tabs.get(record.tabId);
      const sessionId = parseGallerySession(tab.url || "");
      if (sessionId === record.sessionId) openById.set(record.tabId, sessionId);
      else staleTabIds.push(record.tabId);
    } catch { staleTabIds.push(record.tabId); }
  }
  const open = [...openById].map(([tabId, sessionId]) => ({ tabId, sessionId }));
  return repository.reconcileGalleryTabs(open, staleTabIds);
}

async function recoverAfterBrowserRestart(reason) {
  await repository.markInterrupted(reason);
  await reconcileOpenGalleries();
  await updateBadge("");
}

async function registerGalleryTabSafely(sessionId, tabId) {
  await chrome.tabs.get(tabId);
  await repository.registerGalleryTab(sessionId, tabId);
  try {
    await chrome.tabs.get(tabId);
  } catch (error) {
    await repository.unregisterGalleryTab(tabId);
    throw error;
  }
  return { ok: true };
}

async function openGalleryTab(sessionId) {
  const url = `${galleryBaseUrl}?sessionId=${encodeURIComponent(sessionId)}`;
  const tab = await chrome.tabs.create({ url });
  try {
    await registerGalleryTabSafely(sessionId, tab.id);
    return { ok: true, tabId: tab.id };
  } catch (error) {
    try { await chrome.tabs.remove(tab.id); } catch { /* La pestaña pudo cerrarse antes del registro. */ }
    throw error;
  }
}

async function finishAndOpenGallery(message) {
  const result = await repository.finish(message);
  await updateBadge("");
  try {
    const opened = await openGalleryTab(message.sessionId);
    return { ...result, galleryOpened: true, galleryTabId: opened.tabId };
  } catch (error) {
    return { ...result, galleryOpened: false, warning: error?.message || "No se pudo abrir la galería automáticamente." };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;
  let task;
  switch (message.type) {
    case "EXTRACTOR_STARTED": task = repository.create(message, sender.tab?.id); break;
    case "EXTRACTOR_PROGRESS":
      task = repository.updateProgress(message)
        .then(() => updateBadge(message.pagesScanned > 99 ? "99+" : String(Math.max(0, Number(message.pagesScanned) || 0))))
        .then(() => ({ ok: true }));
      break;
    case "EXTRACTOR_PAGE_BATCH": task = repository.saveBatch(message).then(() => ({ ok: true })); break;
    case "EXTRACTOR_RESULTS": task = finishAndOpenGallery(message); break;
    case "GET_EXTRACTOR_RESULTS": task = repository.getPage(message.sessionId, message.offset, message.limit); break;
    case "GET_EXTRACTOR_SESSIONS": task = repository.listRecent(message.limit); break;
    case "PREVIEW_LOAD_DIAGNOSTIC": task = repository.recordPreviewDiagnostic(message); break;
    case "RESOLVE_ATTACHMENT_PAGE": task = resolveAttachmentPage(message.url, sender); break;
    case "CLEAR_EXTRACTOR_RESULTS": task = repository.remove(message.sessionId); break;
    case "OPEN_EXTRACTOR_GALLERY": task = openGalleryTab(message.sessionId); break;
    case "GALLERY_SESSION_OPENED":
      task = registerGalleryTabSafely(message.sessionId, sender.tab?.id);
      break;
    default: return;
  }
  Promise.resolve(task).then(sendResponse).catch(error => sendResponse({ ok: false, error: error?.message || "Error interno de Ext-Media." }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => {
  (async () => {
    await repository.unregisterGalleryTab(tabId);
    await repository.interruptTab(tabId, "La pestaña de origen se cerró antes de terminar la extracción.");
    await repository.cleanupOrphanedSessions();
    await updateBadge("");
  })().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const sessionId = parseGallerySession(changeInfo.url);
    const task = sessionId
      ? registerGalleryTabSafely(sessionId, tabId)
      : repository.unregisterGalleryTab(tabId).then(() => repository.cleanupOrphanedSessions());
    task.catch(() => {});
  }
  if (changeInfo.status === "loading") {
    repository.interruptTab(tabId, "La pestaña de origen navegó o se recargó antes de terminar la extracción.")
      .then(() => updateBadge("")).catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(() => {
  recoverAfterBrowserRestart("Chrome se reinició antes de finalizar la extracción.").catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  recoverAfterBrowserRestart("Ext-Media se actualizó o reinstaló antes de finalizar la extracción.").catch(() => {});
});

