const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("el popup ya no expone eliminación manual de datos", () => {
  const popup = read("popup.js") + read("popup.html");
  assert.doesNotMatch(popup, /Eliminar datos|CLEAR_EXTRACTOR_RESULTS|Eliminar todos los recursos/);
  assert.match(popup, /OPEN_EXTRACTOR_GALLERY/);
});

test("la galería registra su sesión y conserva la limpieza manual", () => {
  const gallery = read("gallery.js");
  assert.match(gallery, /GALLERY_SESSION_OPENED/);
  assert.match(gallery, /CLEAR_EXTRACTOR_RESULTS/);
});

test("la base de datos versiona y crea el registro de pestañas de galería", () => {
  const db = read("storage/indexed-db.js");
  assert.match(db, /DB_VERSION = 3/);
  assert.match(db, /GALLERY_TABS_STORE = "galleryTabs"/);
  assert.match(db, /createIndex\("bySession"/);
});

test("el cierre de pestañas desregistra la galería y dispara limpieza huérfana", () => {
  const background = read("background.js");
  assert.match(background, /chrome\.tabs\.onRemoved\.addListener/);
  assert.match(background, /repository\.unregisterGalleryTab\(tabId\)/);
  assert.match(background, /repository\.cleanupOrphanedSessions\(\)/);
  assert.match(background, /repository\.listGalleryTabs\(\)/);
  assert.match(background, /chrome\.tabs\.onUpdated\.addListener/);
});

test("la eliminación es atómica sobre jobs, media y asociaciones de pestañas", () => {
  const repo = read("storage/job-repository.js");
  assert.match(repo, /transaction\(\[dbApi\.JOBS_STORE, dbApi\.MEDIA_STORE, dbApi\.GALLERY_TABS_STORE\], "readwrite"\)/);
  assert.match(repo, /deleteSessionInTransaction/);
  assert.match(repo, /getAllKeys\(sessionId\)/);
});

test("lotes y finalización tardíos no recrean una sesión eliminada", () => {
  const repo = read("storage/job-repository.js");
  assert.match(repo, /if \(!job \|\| !state\.ACTIVE\.includes\(job\.status\)\)/);
  assert.match(repo, /La sesión fue eliminada antes de finalizar/);
  assert.match(repo, /La sesión ya no está activa/);
});

test("la recuperación limpia recursos sin propietario y asociaciones sin sesión", () => {
  const repo = read("storage/job-repository.js");
  assert.match(repo, /cleanupOrphanedSessions/);
  assert.match(repo, /jobsById\.has\(record\.sessionId\)/);
  assert.match(repo, /!jobsById\.has\(tab\.sessionId\)/);
});
