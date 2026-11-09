const STORAGE_PREFIX = "extractorResults:";
const STORAGE_INDEX = "extractorResultSessions";
const MAX_STORED_SESSIONS = 5;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "EXTRACTOR_PROGRESS") return;

  if (message?.type === "EXTRACTOR_RESULTS") {
    (async () => {
      const sessionId = String(message.sessionId || "");
      if (!/^[a-z0-9-]{20,80}$/i.test(sessionId)) {
        throw new Error("La sesión de extracción no tiene un identificador válido.");
      }

      const key = STORAGE_PREFIX + sessionId;
      const result = {
        items: Array.isArray(message.items) ? message.items : [],
        pagesScanned: Number(message.pagesScanned || 0),
        sourceUrl: message.sourceUrl || "",
        threadId: message.threadId || "",
        threadUrl: message.threadUrl || "",
        complete: message.complete !== false,
        pagesFailed: Number(message.pagesFailed || 0),
        pageErrors: Array.isArray(message.pageErrors) ? message.pageErrors : [],
        error: message.error || "",
        finishedAt: Date.now()
      };

      const stored = await chrome.storage.session.get(STORAGE_INDEX);
      const previous = Array.isArray(stored[STORAGE_INDEX]) ? stored[STORAGE_INDEX] : [];
      const sessions = [sessionId, ...previous.filter(id => id !== sessionId)];
      const retained = sessions.slice(0, MAX_STORED_SESSIONS);
      const staleKeys = sessions.slice(MAX_STORED_SESSIONS).map(id => STORAGE_PREFIX + id);

      try {
        await chrome.storage.session.set({ [key]: result, [STORAGE_INDEX]: retained });
        if (staleKeys.length) await chrome.storage.session.remove(staleKeys);
      } catch (storageError) {
        // If previous sessions consumed the session quota, keep the newest
        // extraction and discard older result snapshots before retrying.
        const all = await chrome.storage.session.get(null);
        const oldKeys = Object.keys(all).filter(name =>
          name.startsWith(STORAGE_PREFIX) && name !== key
        );
        if (oldKeys.length) await chrome.storage.session.remove(oldKeys);
        await chrome.storage.session.set({ [key]: result, [STORAGE_INDEX]: [sessionId] });
      }

      await chrome.tabs.create({
        url: `${chrome.runtime.getURL("gallery.html")}?sessionId=${encodeURIComponent(sessionId)}`
      });
      sendResponse({ ok: true });
    })().catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_EXTRACTOR_RESULTS") {
    const sessionId = String(message.sessionId || "");
    if (!/^[a-z0-9-]{20,80}$/i.test(sessionId)) {
      sendResponse(null);
      return;
    }
    chrome.storage.session.get(STORAGE_PREFIX + sessionId)
      .then(data => sendResponse(data[STORAGE_PREFIX + sessionId] || null))
      .catch(error => sendResponse({ items: [], error: error.message }));
    return true;
  }

  if (message?.type === "CLEAR_EXTRACTOR_RESULTS") {
    const sessionId = String(message.sessionId || "");
    if (!/^[a-z0-9-]{20,80}$/i.test(sessionId)) {
      sendResponse({ ok: false, error: "Sesión no válida." });
      return;
    }
    (async () => {
      await chrome.storage.session.remove(STORAGE_PREFIX + sessionId);
      const stored = await chrome.storage.session.get(STORAGE_INDEX);
      const sessions = Array.isArray(stored[STORAGE_INDEX]) ? stored[STORAGE_INDEX] : [];
      await chrome.storage.session.set({ [STORAGE_INDEX]: sessions.filter(id => id !== sessionId) });
      sendResponse({ ok: true });
    })().catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
