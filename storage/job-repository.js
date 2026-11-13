(function (root) {
  const dbApi = root.ExtMediaDatabase;
  const state = root.ExtMediaJobState;
  const lifecycle = root.ExtMediaSessionLifecycle;
  const validSessionId = value => /^[a-z0-9-]{20,80}$/i.test(String(value || ""));
  const safeNumber = value => Math.max(0, Number(value) || 0);
  const mediaKey = item => String(item?.dedupeKey || item?.url || item?.playUrl || "").trim().slice(0, 4096);

  async function deleteSessionInTransaction(tx, sessionId) {
    const jobs = tx.objectStore(dbApi.JOBS_STORE);
    const media = tx.objectStore(dbApi.MEDIA_STORE);
    const tabs = tx.objectStore(dbApi.GALLERY_TABS_STORE);
    const [mediaKeys, tabKeys] = await Promise.all([
      dbApi.value(media.index("bySession").getAllKeys(sessionId)),
      dbApi.value(tabs.index("bySession").getAllKeys(sessionId))
    ]);
    jobs.delete(sessionId);
    for (const key of mediaKeys) media.delete(key);
    for (const key of tabKeys) tabs.delete(key);
  }

  async function create(message, tabId) {
    const sessionId = String(message.sessionId || "");
    if (!validSessionId(sessionId)) throw new Error("La sesión de extracción no tiene un identificador válido.");
    const db = await dbApi.open();
    const tx = db.transaction(dbApi.JOBS_STORE, "readwrite");
    const completion = dbApi.done(tx);
    const store = tx.objectStore(dbApi.JOBS_STORE);
    const existing = await dbApi.value(store.get(sessionId));
    if (existing) {
      tx.abort();
      await completion.catch(() => {});
      throw new Error("El identificador de sesión ya existe; se rechazó sobrescribir otra extracción.");
    }
    const now = Date.now();
    store.add({
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

  async function persistBatch(message) {
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
      if (!key || (!/^https?:\/\//i.test(key) && !/^attachment:\d+$/i.test(key))) continue;
      const request = media.get([message.sessionId, key]);
      request.onsuccess = () => {
        const old = request.result || {};
        const merged = { ...old, ...item, sessionId: message.sessionId, mediaKey: key };
        delete merged.isQuoted; delete merged.quotedAuthor; delete merged.quotedPostUrl;
        merged.preview = item.preview || old.preview || "";
        merged.attachmentPage = item.attachmentPage || old.attachmentPage || "";
        merged.fallbackUrl = item.fallbackUrl || old.fallbackUrl || "";
        const origins = [...(old.origins || []), ...(item.origins || [])].map(origin => ({
          sourcePage: String(origin?.sourcePage || ""), author: String(origin?.author || "")
        }));
        merged.origins = origins.filter((origin, index, all) => all.findIndex(other =>
          other.sourcePage === origin.sourcePage && other.author === origin.author
        ) === index).slice(0, 50);
        media.put(merged);
      };
    }
    job.itemsFound = message.replaceExisting === true
      ? safeNumber(message.itemsFound)
      : Math.max(job.itemsFound || 0, safeNumber(message.itemsFound));
    job.pagesScanned = Math.max(job.pagesScanned || 0, safeNumber(message.pagesScanned));
    job.updatedAt = Date.now();
    jobs.put(job);
    await completion;
  }

  function isQuotaError(error) {
    return error?.name === "QuotaExceededError" || /quota|almacenamiento.*lleno|espacio.*insuficiente/i.test(String(error?.message || ""));
  }

  async function saveBatch(message) {
    try {
      await persistBatch(message);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      try { await cleanupOrphanedSessions(); } catch { /* El reintento determina si la cuota sigue agotada. */ }
      try { await persistBatch(message); }
      catch (retryError) {
        if (isQuotaError(retryError)) {
          const full = new Error("El almacenamiento local de Ext-Media está lleno. Se conservaron los resultados guardados hasta ahora; cierra galerías que ya no utilices o libera espacio del navegador.");
          full.name = "QuotaExceededError";
          throw full;
        }
        throw retryError;
      }
    }
  }

  async function finish(message) {
    if (!validSessionId(message.sessionId)) throw new Error("Sesión no válida al finalizar.");
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE], "readwrite");
    const completion = dbApi.done(tx);
    const jobs = tx.objectStore(dbApi.JOBS_STORE);
    const media = tx.objectStore(dbApi.MEDIA_STORE);
    const job = await dbApi.value(jobs.get(message.sessionId));
    if (!job) {
      tx.abort();
      await completion.catch(() => {});
      throw new Error("La sesión fue eliminada antes de finalizar; se descartaron los resultados tardíos.");
    }
    if (!state.ACTIVE.includes(job.status)) {
      tx.abort();
      await completion.catch(() => {});
      return { ok: true, status: job.status, alreadyFinished: true };
    }
    const items = Array.isArray(message.items) ? message.items : [];
    for (const item of items) {
      const key = mediaKey(item);
      if (!key || !/^https?:\/\//i.test(key)) continue;
      media.put({ ...item, sessionId: message.sessionId, mediaKey: key });
    }
    const errors = Array.isArray(message.pageErrors) ? message.pageErrors.slice(0, 500) : [];
    const failed = safeNumber(message.pagesFailed);
    const status = message.error && safeNumber(message.pagesScanned) === 0 ? "failed" : (message.error || message.complete === false || failed > 0 ? "partial" : "completed");
    jobs.put(state.transition(job, status, {
      pagesScanned: safeNumber(message.pagesScanned), pagesFailed: failed,
      itemsFound: safeNumber(message.itemsFound) || job.itemsFound || items.length || 0, pageErrors: errors,
      error: String(message.error || "").slice(0, 2000), complete: status === "completed",
      finishedAt: Date.now(), updatedAt: Date.now(),
      sourceUrl: String(message.sourceUrl || job.sourceUrl || ""),
      threadId: String(message.threadId || job.threadId || ""),
      threadUrl: String(message.threadUrl || job.threadUrl || "")
    }));
    await completion;
    return { ok: true, status };
  }

  async function getPage(sessionId, offset = 0, limit = 100) {
    if (!validSessionId(sessionId)) return null;
    const safeOffset = Math.max(0, Math.min(10000000, Number(offset) || 0));
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE], "readonly");
    const completion = dbApi.done(tx);
    const jobRequest = tx.objectStore(dbApi.JOBS_STORE).get(sessionId);
    const index = tx.objectStore(dbApi.MEDIA_STORE).index("bySession");
    const countRequest = index.count(sessionId);
    const records = [];
    const cursorRequest = index.openCursor(IDBKeyRange.only(sessionId));
    let skipped = 0;
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || records.length >= safeLimit) return;
      const value = cursor.value;
      if (value.sessionId === sessionId && typeof value.mediaKey === "string" && value.mediaKey) {
        if (skipped < safeOffset) skipped++;
        else {
          const { sessionId: _sid, mediaKey: _key, isQuoted: _quoted, quotedAuthor: _quotedAuthor, quotedPostUrl: _quotedPostUrl, ...item } = value;
          records.push(item);
        }
      }
      cursor.continue();
    };
    const [job, totalItems] = await Promise.all([dbApi.value(jobRequest), dbApi.value(countRequest)]);
    await completion;
    if (!job) return null;
    return { ...job, items: records, totalItems, offset: safeOffset, limit: safeLimit, hasMore: safeOffset + records.length < totalItems };
  }

  async function recordPreviewDiagnostic(message) {
    if (!validSessionId(message.sessionId) || !message.mediaKey) return { ok: false, error: "Referencia de recurso no válida." };
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE], "readwrite");
    const completion = dbApi.done(tx);
    const jobs = tx.objectStore(dbApi.JOBS_STORE);
    const media = tx.objectStore(dbApi.MEDIA_STORE);
    const [job, item] = await Promise.all([
      dbApi.value(jobs.get(message.sessionId)),
      dbApi.value(media.get([message.sessionId, String(message.mediaKey).slice(0, 4096)]))
    ]);
    if (!job || !item) {
      tx.abort(); await completion.catch(() => {});
      return { ok: false, error: "La sesión o el recurso ya no existe." };
    }
    if (message.category === "resolved") {
      delete item.previewDiagnostic;
      delete item.resolveError;
      delete item.resolveStatus;
    }
    else item.previewDiagnostic = {
      category: String(message.category || "unknown").slice(0, 60),
      message: String(message.detail || "No se pudo cargar la vista previa.").slice(0, 300),
      url: (() => { try { const u = new URL(String(message.url || "")); return `${u.origin}${u.pathname}`.slice(0, 4096); } catch { return ""; } })(),
      status: safeNumber(message.status),
      checkedAt: Date.now()
    };
    media.put(item);
    await completion;
    return { ok: true };
  }

  async function get(sessionId) { return getPage(sessionId, 0, 100); }

  async function remove(sessionId) {
    if (!validSessionId(sessionId)) return { ok: false, error: "Sesión no válida." };
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE, dbApi.GALLERY_TABS_STORE], "readwrite");
    const completion = dbApi.done(tx);
    const job = await dbApi.value(tx.objectStore(dbApi.JOBS_STORE).get(sessionId));
    if (job && state.ACTIVE.includes(job.status)) {
      tx.abort();
      await completion.catch(() => {});
      return { ok: false, error: "No se puede limpiar una extracción que sigue activa." };
    }
    await deleteSessionInTransaction(tx, sessionId);
    await completion;
    return { ok: true };
  }

  async function registerGalleryTab(sessionId, tabId) {
    if (!validSessionId(sessionId) || !Number.isInteger(tabId)) throw new Error("No se pudo asociar la galería con una sesión válida.");
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.GALLERY_TABS_STORE], "readwrite");
    const completion = dbApi.done(tx);
    const jobs = tx.objectStore(dbApi.JOBS_STORE);
    const job = await dbApi.value(jobs.get(sessionId));
    if (!job) {
      tx.abort();
      await completion.catch(() => {});
      throw new Error("La sesión ya no existe; no se puede abrir su galería.");
    }
    tx.objectStore(dbApi.GALLERY_TABS_STORE).put({ tabId, sessionId, openedAt: Date.now() });
    jobs.put({ ...job, lastGalleryOpenedAt: Date.now() });
    await completion;
    return { ok: true };
  }

  async function unregisterGalleryTab(tabId) {
    if (!Number.isInteger(tabId)) return { ok: false, cleaned: false };
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE, dbApi.GALLERY_TABS_STORE], "readwrite");
    const completion = dbApi.done(tx);
    const tabs = tx.objectStore(dbApi.GALLERY_TABS_STORE);
    const record = await dbApi.value(tabs.get(tabId));
    if (!record) { await completion; return { ok: true, cleaned: false }; }
    tabs.delete(tabId);
    const remaining = await dbApi.value(tabs.index("bySession").count(record.sessionId));
    const job = await dbApi.value(tx.objectStore(dbApi.JOBS_STORE).get(record.sessionId));
    let cleaned = false;
    if (lifecycle.shouldCleanupAfterGalleryClose(job, remaining)) {
      await deleteSessionInTransaction(tx, record.sessionId);
      cleaned = true;
    }
    await completion;
    return { ok: true, cleaned, sessionId: record.sessionId };
  }

  async function listGalleryTabs() {
    const db = await dbApi.open();
    const tx = db.transaction(dbApi.GALLERY_TABS_STORE, "readonly");
    const completion = dbApi.done(tx);
    const tabs = await dbApi.value(tx.objectStore(dbApi.GALLERY_TABS_STORE).getAll());
    await completion;
    return tabs;
  }

  async function reconcileGalleryTabs(openTabs = [], staleTabIds = []) {
    const validOpenTabs = openTabs.filter(tab => Number.isInteger(tab.tabId) && validSessionId(tab.sessionId));
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.GALLERY_TABS_STORE], "readwrite");
    const completion = dbApi.done(tx);
    const jobs = tx.objectStore(dbApi.JOBS_STORE);
    const tabs = tx.objectStore(dbApi.GALLERY_TABS_STORE);
    const [allJobs, allTabs] = await Promise.all([dbApi.value(jobs.getAll()), dbApi.value(tabs.getAll())]);
    const plan = lifecycle.planTabReconciliation(allTabs, validOpenTabs, allJobs, staleTabIds);
    for (const tabId of plan.removeTabIds) tabs.delete(tabId);
    for (const record of plan.upsert) tabs.put({ tabId: record.tabId, sessionId: record.sessionId, openedAt: Date.now(), recovered: true });
    await completion;
    return cleanupOrphanedSessions();
  }

  async function cleanupOrphanedSessions() {
    const db = await dbApi.open();
    const tx = db.transaction([dbApi.JOBS_STORE, dbApi.MEDIA_STORE, dbApi.GALLERY_TABS_STORE], "readwrite");
    const completion = dbApi.done(tx);
    const jobsStore = tx.objectStore(dbApi.JOBS_STORE);
    const mediaStore = tx.objectStore(dbApi.MEDIA_STORE);
    const tabsStore = tx.objectStore(dbApi.GALLERY_TABS_STORE);
    const [jobs, tabs] = await Promise.all([dbApi.value(jobsStore.getAll()), dbApi.value(tabsStore.getAll())]);
    const jobsById = new Map(jobs.map(job => [job.sessionId, job]));
    const orphaned = lifecycle.orphanedTerminalSessions(jobs, tabs);
    for (const sessionId of orphaned) await deleteSessionInTransaction(tx, sessionId);
    for (const tab of tabs) if (!jobsById.has(tab.sessionId)) tabsStore.delete(tab.tabId);
    // Elimina registros multimedia sin trabajo propietario, y claves internas mal formadas.
    await new Promise((resolve, reject) => {
      const request = mediaStore.openCursor();
      request.onerror = () => reject(request.error || new Error("No se pudo verificar la integridad del catálogo."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        const record = cursor.value;
        const valid = jobsById.has(record.sessionId) && typeof record.mediaKey === "string" && record.mediaKey.length > 0;
        if (!valid) cursor.delete();
        cursor.continue();
      };
    });
    await completion;
    return { ok: true, removedSessions: orphaned.length };
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
        store.put(state.transition(job, "interrupted", { error: reason, finishedAt: Date.now(), updatedAt: Date.now() }));
      }
    }
    await completion;
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

  root.ExtMediaJobRepository = {
    create, updateProgress, saveBatch, finish, get, getPage, listRecent, remove, recordPreviewDiagnostic,
    registerGalleryTab, unregisterGalleryTab, listGalleryTabs, reconcileGalleryTabs,
    cleanup: cleanupOrphanedSessions, cleanupOrphanedSessions, markInterrupted, interruptTab
  };
})(globalThis);
