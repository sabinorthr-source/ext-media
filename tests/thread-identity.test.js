const test = require("node:test");
const assert = require("node:assert/strict");
require("../shared/thread-identity.js");

const api = globalThis.ExtMediaThreadIdentity;
const base = "https://perutops.com/foro-relax/threads/tema-de-prueba.524392/";

test("identifica el ID estable del tema aunque cambie el número de página", () => {
  assert.deepEqual(api.getThreadIdentity(`${base}page-7/`), {
    threadId: "524392",
    threadUrl: base,
    origin: "https://perutops.com"
  });
});

test("acepta páginas del mismo tema y rechaza otro tema", () => {
  assert.equal(api.isSameThread(`${base}page-2/`, base), true);
  assert.equal(api.isSameThread("https://perutops.com/foro-relax/threads/otro-tema.524393/", base), false);
});

test("rechaza otros dominios y esquemas inseguros", () => {
  assert.equal(api.getThreadIdentity("https://forosperu.club/foro/threads/tema.12/"), null);
  assert.equal(api.getThreadIdentity("http://perutops.com/foro-relax/threads/tema.12/"), null);
});

test("normaliza enlaces de paginación sin conservar fragmentos ni tracking", () => {
  assert.equal(
    api.normalizeThreadPage(`${base}page-4/?utm_source=foo#post-123`, base),
    `${base}page-4/`
  );
});

test("no permite que la paginación cambie a un hilo enlazado", () => {
  assert.equal(
    api.normalizeThreadPage("https://perutops.com/foro-relax/threads/otro.9001/page-2/", base),
    ""
  );
});

test("acepta el alias www de PeruTops", () => {
  assert.equal(
    api.getThreadIdentity("https://www.perutops.com/foro-relax/threads/tema.524392/").threadId,
    "524392"
  );
});

test("normaliza la paginación expresada en query string", () => {
  assert.equal(
    api.normalizeThreadPage(`${base}?page=3`, base),
    `${base}page-3/`
  );
});
