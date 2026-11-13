const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("../shared/perutops-parser.js");
const parser = globalThis.ExtMediaPeruTopsParser;
const source = fs.readFileSync(path.join(__dirname, "../shared/perutops-parser.js"), "utf8");
const gallery = fs.readFileSync(path.join(__dirname, "../gallery.js"), "utf8");

test("clasifica los enlaces HTTP normales como link", () => {
  assert.equal(parser.classifyUrl("https://example.test/perfil/recurso"), "link");
});

test("el parser incorpora enlaces normales y URLs escritas como texto", () => {
  assert.match(source, /Recupera enlaces normales/);
  assert.match(source, /rootElement\.querySelectorAll\(["']a\[href\]["']\)/);
  assert.match(source, /URLs escritas como texto/);
  assert.match(source, /https\?:\\\/\\\//);
});

test("el contenido multimedia y los enlaces dentro de citas se excluyen", () => {
  assert.match(source, /QUOTE_SELECTOR/);
  assert.match(source, /isQuotedElement\(img\)/);
  assert.match(source, /isQuotedElement\(anchor\)/);
  assert.doesNotMatch(source, /quotedPostUrl|quotedAuthor|isQuoted:/);
});

test("la galería no muestra metadatos ni navegación de citas", () => {
  assert.doesNotMatch(gallery, /Ir al mensaje citado|También aparece en una cita|quotedPostUrl|quotedAuthor/);
});

test("la galería registra diagnósticos de vista previa y clasifica errores HTTP", () => {
  assert.match(gallery, /PREVIEW_LOAD_DIAGNOSTIC/);
  assert.match(gallery, /access-denied/);
  assert.match(gallery, /resource-unavailable/);
  assert.match(gallery, /network-or-permission/);
  assert.match(gallery, /unverified-external/);
});
