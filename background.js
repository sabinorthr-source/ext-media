
const STORAGE_KEY = "extractorResults";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "EXTRACTOR_PROGRESS") {
    // Content scripts broadcast progress to extension pages. Do not rebroadcast
    // from the service worker; it can cause duplicate progress notifications.
    return;
  }

  if (message?.type === "EXTRACTOR_RESULTS") {
    (async () => {
      await chrome.storage.session.set({
        [STORAGE_KEY]: {
          items: message.items || [],
          pagesScanned: message.pagesScanned || 0,
          sourceUrl: message.sourceUrl || "",
          error: message.error || "",
          finishedAt: Date.now()
        }
      });

      await chrome.tabs.create({
        url: chrome.runtime.getURL("gallery.html")
      });

      sendResponse({ ok: true });
    })().catch(error => {
      sendResponse({ ok: false, error: error.message });
    });

    return true;
  }

  if (message?.type === "GET_EXTRACTOR_RESULTS") {
    chrome.storage.session.get(STORAGE_KEY)
      .then(data => sendResponse(data[STORAGE_KEY] || null))
      .catch(error => sendResponse({
        items: [],
        error: error.message
      }));

    return true;
  }

  if (message?.type === "CLEAR_EXTRACTOR_RESULTS") {
    chrome.storage.session.remove(STORAGE_KEY)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({
        ok: false,
        error: error.message
      }));

    return true;
  }
});
