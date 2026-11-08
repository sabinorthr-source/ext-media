importScripts("shared/protocol.js", "shared/state.js");

const { TYPES } = ExtractorProtocol;
const { KEYS, createRunState } = ExtractorState;
const STORAGE_KEYS = [KEYS.state, KEYS.results];

async function readState() {
  const stored = await chrome.storage.session.get(KEYS.state);
  return stored[KEYS.state] || null;
}
async function writeState(state) {
  state.updatedAt = Date.now();
  await chrome.storage.session.set({ [KEYS.state]: state });
  return state;
}
async function clearSession() {
  await chrome.storage.session.remove(STORAGE_KEYS);
}
async function closeGallery(state) {
  if (state?.galleryTabId != null) {
    try { await chrome.tabs.remove(state.galleryTabId); } catch {}
  }
}
async function getResults() {
  const stored = await chrome.storage.session.get(KEYS.results);
  return stored[KEYS.results] || null;
}
async function openGallery(state) {
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("gallery.html") });
  state.galleryTabId = tab.id;
  state.phase = "finished";
  state.finishedAt = Date.now();
  await writeState(state);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === TYPES.RESET) {
      const sourceTabId = Number(message.sourceTabId);
      const runId = String(message.runId || "");
      const tab = await chrome.tabs.get(sourceTabId);
      const identity = ExtractorProtocol.parseThreadIdentity(tab.url || "");
      if (!identity) throw new Error("La pestaña seleccionada no corresponde a un tema válido de PeruTops o Foros Perú.");
      if (!runId) throw new Error("Falta el identificador de ejecución.");
      const previous = await readState();
      if (previous?.status === "running" && previous.sourceTabId != null) {
        try { await chrome.tabs.sendMessage(previous.sourceTabId, { type: TYPES.CANCEL, runId: previous.runId }); } catch {}
      }
      await closeGallery(previous);
      await clearSession();
      await writeState(createRunState({ runId, sourceTabId, sourceUrl: tab.url, threadId: identity.threadId }));
      sendResponse({ ok: true, threadId: identity.threadId });
      return;
    }

    if (message?.type === TYPES.PROGRESS) {
      const state = await readState();
      if (!state || sender.tab?.id !== state.sourceTabId || message.runId !== state.runId) {
        sendResponse({ ok: false, ignored: true });
        return;
      }
      Object.assign(state, {
        status: "running",
        phase: message.phase || state.phase,
        pagesScanned: Number(message.pagesScanned ?? state.pagesScanned),
        pagesFailed: Number(message.pagesFailed ?? state.pagesFailed),
        itemsFound: Number(message.itemsFound ?? state.itemsFound),
        attachmentsResolved: Number(message.attachmentsResolved ?? state.attachmentsResolved),
        attachmentsTotal: Number(message.attachmentsTotal ?? state.attachmentsTotal),
        pendingPages: Number(message.pendingPages ?? state.pendingPages ?? 0),
        pagesAttempted: Number(message.pagesAttempted ?? state.pagesAttempted ?? 0),
        linkedThreadsFound: Number(message.linkedThreadsFound ?? state.linkedThreadsFound ?? 0)
      });
      await writeState(state);
      if (Array.isArray(message.checkpointItems)) {
        const checkpoint = {
          runId: state.runId,
          threadId: state.threadId,
          items: message.checkpointItems,
          pagesScanned: state.pagesScanned,
          pagesFailed: state.pagesFailed,
          failedPages: Array.isArray(message.failedPages) ? message.failedPages : [],
          pendingPages: state.pendingPages || 0,
          stopReason: "IN_PROGRESS",
          complete: false,
          status: "running",
          sourceUrl: state.sourceUrl,
          finishedAt: null
        };
        try { await chrome.storage.session.set({ [KEYS.results]: checkpoint }); }
        catch (storageError) { state.checkpointWarning = storageError?.message || "No se pudo guardar el punto de recuperación."; await writeState(state); }
      }
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === TYPES.RESULTS) {
      const state = await readState();
      if (!state || sender.tab?.id !== state.sourceTabId || message.runId !== state.runId || String(message.threadId) !== String(state.threadId)) {
        sendResponse({ ok: false, ignored: true });
        return;
      }
      const results = {
        runId: state.runId,
        threadId: state.threadId,
        items: Array.isArray(message.items) ? message.items : [],
        pagesScanned: Number(message.pagesScanned || 0),
        pagesFailed: Number(message.pagesFailed || 0),
        failedPages: Array.isArray(message.failedPages) ? message.failedPages : [],
        pendingPages: Number(message.pendingPages || 0),
        stopReason: message.stopReason || "UNKNOWN",
        complete: message.complete === true,
        status: message.status || "partial",
        sourceUrl: message.sourceUrl || state.sourceUrl,
        error: message.error || "",
        threadsScanned: Number(message.threadsScanned || 1),
        linkedThreadsFound: Number(message.linkedThreadsFound || 0),
        linkedThreadsScanned: Number(message.linkedThreadsScanned || 0),
        includeLinkedThreads: message.includeLinkedThreads === true,
        maxPages: Number(message.maxPages || 1000),
        pagesAttempted: Number(message.pagesAttempted || message.pagesScanned || 0),
        concurrency: Number(message.concurrency || 4),
        finishedAt: Date.now()
      };
      await chrome.storage.session.set({ [KEYS.results]: results });
      state.pagesScanned = results.pagesScanned;
      state.pagesFailed = results.pagesFailed;
      state.itemsFound = results.items.length;
      state.status = results.status;
      state.phase = "finished";
      state.finishedAt = Date.now();
      await writeState(state);
      await openGallery(state);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === TYPES.GET_STATE) {
      sendResponse(await readState());
      return;
    }
    if (message?.type === TYPES.GET_RESULTS) {
      sendResponse(await getResults());
      return;
    }
    if (message?.type === TYPES.CLEAR) {
      const state = await readState();
      // A gallery page may clear its own results. Do not let an unrelated tab erase another run.
      if (sender.tab?.id != null && state?.galleryTabId != null && sender.tab.id !== state.galleryTabId) {
        sendResponse({ ok: false, ignored: true });
        return;
      }
      await clearSession();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: "Mensaje no reconocido." });
  })().catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => {
  (async () => {
    const state = await readState();
    if (!state) return;
    if (tabId === state.galleryTabId) {
      await clearSession();
      return;
    }
    if (tabId === state.sourceTabId && ["starting", "running"].includes(state.status)) {
      state.status = "cancelled";
      state.phase = "source_tab_closed";
      state.error = "La pestaña del tema se cerró durante la extracción.";
      state.finishedAt = Date.now();
      await writeState(state);
      // Preserve any already collected results so the user can inspect partial work if a gallery exists.
    }
  })().catch(() => {});
});
