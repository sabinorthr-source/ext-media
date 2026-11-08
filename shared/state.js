/* Shared storage keys and state constructors. */
(() => {
  const KEYS = Object.freeze({ state: "extractorRunState", results: "extractorResults" });
  const now = () => Date.now();
  function createRunState({ runId, sourceTabId, sourceUrl, threadId }) {
    return {
      runId,
      sourceTabId,
      galleryTabId: null,
      sourceUrl,
      threadId: String(threadId),
      status: "starting",
      phase: "starting",
      pagesScanned: 0,
      pagesFailed: 0,
      itemsFound: 0,
      attachmentsResolved: 0,
      attachmentsTotal: 0,
      startedAt: now(),
      updatedAt: now(),
      finishedAt: null,
      error: null
    };
  }
  globalThis.ExtractorState = Object.freeze({ KEYS, createRunState });
})();
