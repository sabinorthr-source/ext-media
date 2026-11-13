(function (root) {
  const DB_NAME = "ext-media-local";
  const DB_VERSION = 3;
  const JOBS_STORE = "jobs";
  const MEDIA_STORE = "media";
  const GALLERY_TABS_STORE = "galleryTabs";
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = request.result;
        if (!db.objectStoreNames.contains(JOBS_STORE)) db.createObjectStore(JOBS_STORE, { keyPath: "sessionId" });
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          const media = db.createObjectStore(MEDIA_STORE, { keyPath: ["sessionId", "mediaKey"] });
          media.createIndex("bySession", "sessionId", { unique: false });
        }
        if (!db.objectStoreNames.contains(GALLERY_TABS_STORE)) {
          const tabs = db.createObjectStore(GALLERY_TABS_STORE, { keyPath: "tabId" });
          tabs.createIndex("bySession", "sessionId", { unique: false });
        }
        // Migra registros previos: elimina metadatos de citas y conserva solo
        // el origen/autor útil para atribución. La migración es local y transaccional.
        if (request.transaction && db.objectStoreNames.contains(MEDIA_STORE) && event.oldVersion < 3) {
          const media = request.transaction.objectStore(MEDIA_STORE);
          const cursorRequest = media.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const record = cursor.value;
            delete record.isQuoted;
            delete record.quotedAuthor;
            delete record.quotedPostUrl;
            if (Array.isArray(record.origins)) {
              record.origins = record.origins.map(origin => ({
                sourcePage: String(origin?.sourcePage || ""),
                author: String(origin?.author || "")
              }));
            }
            cursor.update(record);
            cursor.continue();
          };
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => { dbPromise = null; reject(request.error || new Error("No se pudo abrir IndexedDB.")); };
      request.onblocked = () => { dbPromise = null; reject(new Error("IndexedDB está bloqueada por otra pestaña. Cierra las galerías antiguas y vuelve a intentarlo.")); };
    });
    return dbPromise;
  }

  function done(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Falló una transacción de IndexedDB."));
      tx.onabort = () => reject(tx.error || new Error("La transacción de IndexedDB fue cancelada."));
    });
  }

  function value(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falló una operación de IndexedDB."));
    });
  }

  root.ExtMediaDatabase = { open, done, value, JOBS_STORE, MEDIA_STORE, GALLERY_TABS_STORE };
})(globalThis);
