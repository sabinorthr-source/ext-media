(function (root) {
  const DB_NAME = "ext-media-local";
  const DB_VERSION = 1;
  const JOBS_STORE = "jobs";
  const MEDIA_STORE = "media";
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(JOBS_STORE)) db.createObjectStore(JOBS_STORE, { keyPath: "sessionId" });
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          const media = db.createObjectStore(MEDIA_STORE, { keyPath: ["sessionId", "mediaKey"] });
          media.createIndex("bySession", "sessionId", { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => { dbPromise = null; reject(request.error || new Error("No se pudo abrir IndexedDB.")); };
      request.onblocked = () => { dbPromise = null; reject(new Error("IndexedDB está bloqueada por otra versión de Ext-Media.")); };
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

  root.ExtMediaDatabase = { open, done, value, JOBS_STORE, MEDIA_STORE };
})(globalThis);
