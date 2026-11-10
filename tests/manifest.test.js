const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("el manifiesto sigue siendo MV3 y apunta al service worker clásico", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(fs.existsSync(path.join(root, manifest.background.service_worker)), true);
});

test("los módulos importados por el service worker existen", () => {
  const source = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const imports = [...source.matchAll(/importScripts\(([^)]*)\)/g)].flatMap(match => [...match[1].matchAll(/["']([^"']+)["']/g)].map(x => x[1]));
  assert.deepEqual(imports.sort(), ["shared/job-state.js", "storage/indexed-db.js", "storage/job-repository.js"].sort());
  for (const file of imports) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} debe existir`);
});

test("la extensión limita el acceso de host a PeruTops y no solicita storage", () => {
  assert.deepEqual(manifest.host_permissions, ["https://perutops.com/*", "https://www.perutops.com/*"]);
  assert.equal(manifest.permissions.includes("storage"), false);
});

test("carga el parser PeruTops antes del content script", () => {
  assert.deepEqual(manifest.content_scripts[0].js, ["shared/thread-identity.js", "shared/perutops-parser.js", "content.js"]);
  for (const file of manifest.content_scripts[0].js) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} debe existir`);
});


test("la galería carga los helpers locales antes de gallery.js", () => {
  const html = fs.readFileSync(path.join(root, "gallery.html"), "utf8");
  assert.ok(html.indexOf('src="shared/csv-export.js"') < html.indexOf('src="gallery.js"'));
  assert.ok(html.indexOf('src="viewers/media-viewer.js"') < html.indexOf('src="gallery.js"'));
  assert.equal(fs.existsSync(path.join(root, "viewers/media-viewer.css")), true);
});
