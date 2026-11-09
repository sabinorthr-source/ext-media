importScripts("shared/job-state.js", "storage/indexed-db.js", "storage/job-repository.js");

const repository = globalThis.ExtMediaJobRepository;

async function updateBadge(text) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    await chrome.action.setBadgeText({ text: String(text || "") });
    await chrome.action.setTitle({ title: text ? `Ext-Media · ${text} páginas procesadas` : "Ext-Media" });
  } catch { /* La API de action puede no estar disponible en contextos de prueba. */ }
}

async function finishAndOpenGallery(message) {
  const result = await repository.finish(message);
  await updateBadge("");
  await repository.cleanup();
  try {
    await chrome.tabs.create({ url: `${chrome.runtime.getURL("gallery.html")}?sessionId=${encodeURIComponent(message.sessionId)}` });
    return { ...result, galleryOpened: true };
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
      task = repository.updateProgress(message).then(() => updateBadge(message.pagesScanned > 99 ? "99+" : String(Math.max(0, Number(message.pagesScanned) || 0)))).then(() => ({ ok: true }));
      break;
    case "EXTRACTOR_PAGE_BATCH": task = repository.saveBatch(message).then(() => ({ ok: true })); break;
    case "EXTRACTOR_RESULTS": task = finishAndOpenGallery(message); break;
    case "GET_EXTRACTOR_RESULTS": task = repository.get(message.sessionId); break;
    case "GET_EXTRACTOR_SESSIONS": task = repository.listRecent(message.limit); break;
    case "CLEAR_EXTRACTOR_RESULTS": task = repository.remove(message.sessionId).then(result => repository.cleanup().then(() => result)); break;
    default: return;
  }
  Promise.resolve(task).then(sendResponse).catch(error => sendResponse({ ok: false, error: error?.message || "Error interno de Ext-Media." }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => {
  repository.interruptTab(tabId, "La pestaña de origen se cerró antes de terminar la extracción. Los resultados parciales se conservaron.")
    .then(() => updateBadge("")).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    repository.interruptTab(tabId, "La pestaña de origen navegó o se recargó antes de terminar la extracción. Los resultados parciales se conservaron.")
      .then(() => updateBadge("")).catch(() => {});
  }
});
chrome.runtime.onStartup.addListener(() => {
  repository.markInterrupted("Chrome se reinició antes de finalizar la extracción. Los resultados parciales se conservaron.")
    .then(() => repository.cleanup()).then(() => updateBadge("")).catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  repository.markInterrupted("Ext-Media se actualizó o reinstaló antes de finalizar la extracción. Los resultados parciales se conservaron.")
    .then(() => repository.cleanup()).then(() => updateBadge("")).catch(() => {});
});
