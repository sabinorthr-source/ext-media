(function (root) {
  const dbApi = root.ExtMediaDatabase;
  const state = root.ExtMediaJobState;
  const MAX_JOBS = 20;
  const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
  const validSessionId = value => /^[a-z0-9-]{20,80}$/i.test(String(value || ""));
  const safeNumber = value => Math.max(0, Number(value) || 0);
  const mediaKey = item => String(item?.url || item?.playUrl || "").trim().slice(0, 4096);

  async function create(message, tabId) {
    const sessionId = String(message.sessionId || "");
    if (!validSessionId(sessionId)) throw new Error("La sesión de extracción no tiene un identificador válido.");
    const db = await dbApi.open();
    const tx = db.transaction(dbApi.JOBS_STORE, "readwrite");
    const completion = dbApi.done(tx);
    const now = Date.now();
    tx.objectStore(dbApi.JOBS_STORE).put({
      sessionId, status: "running", tabId: Number.isInteger(tabId) ? tabId : null,
      sourceUrl: String(message.sourceUrl || ""), threadId: String(message.threadId || ""),
      threadUrl: String(message.threadUrl || ""), pagesScanned: 0, pagesQueued: 0,
      pagesFailed: 0, itemsFound: 0, pageErrors: [], error: "",
      startedAt: now, updatedAt: now, finishedAt: null
    });
    await completion;
    return { ok: true };
  }

  async function updateProgress(message) {
    if (!validSessionId(message.sessionId)) return;
    const db = await dbApi.open();
    const tx = db.transaction(dbApi.JOBS_STORE, "readwrite");
    const completion = dbApi.done(tx);
    const store = tx.objectStore(dbApi.JOBS_STORE);
    const job = await dbApi.value(store.get(message.sessionId));
    if (job && state.ACTIVE.includes(job.status)) {
      store.put(state.transition(job, "running", {
        pagesScanned: safeNumber(message.pagesScanned), pagesQueued: safeNumber(message.pagesQueued),
        itemsFound: safeNumber(message.itemsFound), pagesFailed: safeNumber(message.pagesFailed),
        pageErrors: Array.isArray(message.pageErrors) ? message.pageErrors.slice(-100) : (job.pageErrors || []),
        currentPageUrl: String(message.currentPageUrl || "").slice(0, 4096)
      }));
    }
    await completion;
  }

  async function saveBatch(message) {
    if (!validSessionId(message.sessionId) || !Array.isArray(message.items)) return;
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE], "readwrite");
    const completion = dbApi.done(tx);
    const jobs = tx.objectStore(dbApi.JOBS_STORE);
    const media = tx.objectStore(dbApi.MEDIA_STORE);
    const job = await dbApi.value(jobs.get(message.sessionId));
    if (!job || !state.ACTIVE.includes(job.status)) {
      tx.abort();
      await completion.catch(() => {});
      throw new Error("La sesión ya no está activa; se descartó un lote tardío.");
    }
    if (message.replaceExisting === true) {
      const oldKeys = await dbApi.value(media.index("bySession").getAllKeys(message.sessionId));
      for (const primaryKey of oldKeys) media.delete(primaryKey);
      job.itemsFound = 0;
    }
    for (const item of message.items.slice(0, 100)) {
      const key = mediaKey(item);
      if (!key || !/^https?:\/\//i.test(key)) continue;
      media.put({ ...item, sessionId: message.sessionId, mediaKey: key });
    }
    job.itemsFound = message.replaceExisting === true
      ? safeNumber(message.itemsFound)
      : Math.max(job.itemsFound || 0, safeNumber(message.itemsFound));
    job.pagesScanned = Math.max(job.pagesScanned || 0, safeNumber(message.pagesScanned));
    job.updatedAt = Date.now();
    jobs.put(job);
    await completion;
  }

  async function finish(message) {
    if (!validSessionId(message.sessionId)) throw new Error("Sesión no válida al finalizar.");
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE], "readwrite");
    const completion = dbApi.done(tx);
    const jobs = tx.objectStore(dbApi.JOBS_STORE);
    const media = tx.objectStore(dbApi.MEDIA_STORE);
    const job = await dbApi.value(jobs.get(message.sessionId));
    if (!job) throw new Error("No se encontró la sesión que se intenta finalizar.");
    const items = Array.isArray(message.items) ? message.items : [];
    // Los lotes finales se guardan antes de este mensaje de cierre. Aquí solo
    // se actualiza el estado del trabajo y se admiten resultados pequeños heredados.
    for (const item of items) {
      const key = mediaKey(item);
      if (!key || !/^https?:\/\//i.test(key)) continue;
      media.put({ ...item, sessionId: message.sessionId, mediaKey: key });
    }
    const errors = Array.isArray(message.pageErrors) ? message.pageErrors.slice(0, 500) : [];
    const failed = safeNumber(message.pagesFailed);
    const status = message.error ? "failed" : (message.complete === false || failed > 0 ? "partial" : "completed");
    jobs.put(state.transition(job, status, {
      pagesScanned: safeNumber(message.pagesScanned), pagesFailed: failed,
      itemsFound: items.length || job.itemsFound || 0, pageErrors: errors,
      error: String(message.error || "").slice(0, 2000), complete: status === "completed",
      finishedAt: Date.now(), updatedAt: Date.now(),
      sourceUrl: String(message.sourceUrl || job.sourceUrl || ""),
      threadId: String(message.threadId || job.threadId || ""),
      threadUrl: String(message.threadUrl || job.threadUrl || "")
    }));
    await completion;
    return { ok: true, status };
  }

  async function get(sessionId) {
    if (!validSessionId(sessionId)) return null;
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE], "readonly");
    const completion = dbApi.done(tx);
    const jobRequest = tx.objectStore(dbApi.JOBS_STORE).get(sessionId);
    const recordsRequest = tx.objectStore(dbApi.MEDIA_STORE).index("bySession").getAll(sessionId);
    const [job, records] = await Promise.all([dbApi.value(jobRequest), dbApi.value(recordsRequest)]);
    await completion;
    if (!job) return null;
    return { ...job, items: records.map(({ sessionId: _sid, mediaKey: _key, ...item }) => item) };
  }

  async function remove(sessionId) {
    if (!validSessionId(sessionId)) return { ok: false, error: "Sesión no válida." };
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE], "readwrite");
    const completion = dbApi.done(tx);
    tx.objectStore(dbApi.JOBS_STORE).delete(sessionId);
    const index = tx.objectStore(dbApi.MEDIA_STORE).index("bySession");
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(sessionId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) { tx.objectStore(dbApi.MEDIA_STORE).delete(cursor.primaryKey); cursor.continue(); }
    };
    await completion;
    return { ok: true };
  }


  async function listRecent(limit = 6) {
    const db = await dbApi.open();
    const tx = db.transaction(dbApi.JOBS_STORE, "readonly");
    const completion = dbApi.done(tx);
    const jobs = await dbApi.value(tx.objectStore(dbApi.JOBS_STORE).getAll());
    await completion;
    return jobs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, Math.max(1, Math.min(20, Number(limit) || 6)))
      .map(({ sessionId, status, sourceUrl, threadId, pagesScanned, pagesFailed, itemsFound, error, updatedAt, finishedAt }) => ({
        sessionId, status, sourceUrl, threadId, pagesScanned, pagesFailed, itemsFound, error, updatedAt, finishedAt
      }));
  }

  async function cleanup() {
    const db = await dbApi.open();
    const tx = db.transaction(dbApi.JOBS_STORE, "readonly");
    const completion = dbApi.done(tx);
    const jobs = await dbApi.value(tx.objectStore(dbApi.JOBS_STORE).getAll());
    await completion;
    const now = Date.now();
    const stale = jobs.filter(job => !state.ACTIVE.includes(job.status) && now - (job.finishedAt || job.updatedAt || now) > MAX_AGE_MS);
    const keepable = jobs.filter(job => !stale.includes(job)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    for (const job of [...stale, ...keepable.slice(MAX_JOBS)]) await remove(job.sessionId);
  }

  async function markInterrupted(reason) {
    const db = await dbApi.open();
    const tx = db.transaction(dbApi.JOBS_STORE, "readwrite");
    const completion = dbApi.done(tx);
    const store = tx.objectStore(dbApi.JOBS_STORE);
    const jobs = await dbApi.value(store.getAll());
    for (const job of jobs) {
      if (state.ACTIVE.includes(job.status)) store.put(state.transition(job, "interrupted", { error: reason, finishedAt: Date.now(), updatedAt: Date.now() }));
    }
    await completion;
  }

  async function interruptTab(tabId, reason = "La pestaña de origen se cerró o navegó antes de terminar la extracción.") {
    const db = await dbApi.open();
    const tx = db.transaction(dbApi.JOBS_STORE, "readwrite");
    const completion = dbApi.done(tx);
    const store = tx.objectStore(dbApi.JOBS_STORE);
    const jobs = await dbApi.value(store.getAll());
    for (const job of jobs) {
      if (job.tabId === tabId && state.ACTIVE.includes(job.status)) {
        store.put(state.transition(job, "interrupted", {
          error: reason,
          finishedAt: Date.now(), updatedAt: Date.now()
        }));
      }
    }
    await completion;
  }

  root.ExtMediaJobRepository = { create, updateProgress, saveBatch, finish, get, listRecent, remove, cleanup, markInterrupted, interruptTab };
})(globalThis);
