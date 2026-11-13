const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("el rastreo no contiene un tope fijo de 200 páginas y autentica fetch del tema", () => {
  const source = read("content.js");
  assert.match(source, /while\s*\(queue\.length/);
  assert.match(source, /credentials:\s*["']include["']/);
  assert.doesNotMatch(source, /MAX_PAGES\s*=\s*200|pagesScanned\s*>=\s*200/);
});

test("los lotes persistidos están acotados y la página libera el Map temporal", () => {
  const source = read("content.js");
  assert.match(source, /batch\.slice\(offset,\s*offset\s*\+\s*100\)/);
  assert.match(source, /pageItems\.clear\(\)/);
});

test("la galería pagina el catálogo y procesa tarjetas progresivamente", () => {
  const gallery = read("gallery.js");
  assert.match(gallery, /limit:\s*100/);
  assert.match(gallery, /RENDER_BATCH_SIZE\s*=\s*30/);
  assert.match(gallery, /IntersectionObserver/);
  assert.match(gallery, /forEachExportPage/);
});

test("los fetch de páginas y adjuntos mantienen la sesión autenticada", () => {
  const source = read("content.js");
  assert.match(source, /fetch\(pageUrl,\s*\{\s*credentials:\s*["']include["']/);
  const background = read("background.js");
  assert.match(background, /fetch\(target\.href,\s*\{\s*credentials:\s*["']include["']/);
  assert.match(background, /RESOLVE_ATTACHMENT_PAGE/);
});

test("la galería tiene un solo diálogo y no conserva el visor heredado", () => {
  const html = read("gallery.html");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter(id => id === "mediaViewer").length, 1);
  assert.doesNotMatch(html + read("gallery.js"), /fancyboxViewer|id=["']lightbox["']/);
});

test("la cuota se trata sin expulsar sesiones activas", () => {
  const repo = read("storage/job-repository.js");
  assert.match(repo, /QuotaExceededError/);
  assert.match(repo, /await cleanupOrphanedSessions\(\)/);
  assert.doesNotMatch(repo, /MAX_JOBS|MAX_AGE_MS/);
  assert.match(repo, /state\.ACTIVE\.includes\(job\.status\)/);
});

test("el visor y la galería no cargan bibliotecas remotas", () => {
  const html = read("gallery.html");
  const viewer = read("viewers/media-viewer.js");
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(viewer, /https?:\/\//i);
});

test("las tarjetas de video no crean reproductores en la cuadrícula", () => {
  const gallery = read("gallery.js");
  assert.doesNotMatch(gallery, /createElement\(["']video["']\)/);
  assert.match(gallery, /▶ Reproducir video/);
});
