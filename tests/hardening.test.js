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

test("todas las solicitudes del extractor conservan la sesión y respetan 2 segundos", () => {
  const source = read("content.js");
  assert.match(source, /REQUEST_GAP_MS\s*=\s*2000/);
  assert.match(source, /async function pacedFetch/);
  assert.match(source, /credentials:\s*["']include["']/);
  assert.match(source, /await pacedFetch\(pageUrl\)/);
  assert.match(source, /await pacedFetch\(attachmentPage\)/);
  assert.match(source, /lastRequestStartedAt\s*\+\s*REQUEST_GAP_MS/);
  assert.match(source, /lastRequestStartedAt\s*=\s*Date\.now\(\)/);
  assert.doesNotMatch(source, /lastRequestFinishedAt/);
  assert.doesNotMatch(source, /Promise\.all\(Array\.from\(\{\s*length:\s*Math\.min\(4/);
});

test("401, 403, 429 y pantallas de acceso detienen sin reintento", () => {
  const source = read("content.js");
  assert.match(source, /\[401,\s*403,\s*429\]/);
  assert.match(source, /detectLoginOrVerification/);
  assert.match(source, /AUTH_OR_VERIFICATION_GATE/);
  assert.match(source, /stopError\s*=\s*error/);
  assert.match(source, /while\s*\(queue\.length\s*&&\s*!stopError\)/);
  assert.match(source, /complete:\s*pageErrors\.length\s*===\s*0\s*&&\s*!stopError/);
});

test("el repositorio conserva el motivo de detención en el registro de extracción", () => {
  const repo = read("storage/job-repository.js");
  assert.match(repo, /stopReason:\s*String\(message\.stopReason/);
  assert.match(repo, /stopReason:\s*String\(message\.stopReason \|\| job\.stopReason/);
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
  assert.match(repo, /await cleanup\(\)/);
  assert.match(repo, /MAX_JOBS/);
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
