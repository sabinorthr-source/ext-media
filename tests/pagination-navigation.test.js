const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const gallery = fs.readFileSync(path.join(root, "gallery.js"), "utf8");

test("la paginación conserva bloques de 100 sin desplazar automáticamente la galería", () => {
  const loadPage = gallery.match(/async function loadPage\(offset\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(loadPage, "debe existir loadPage");
  assert.match(loadPage, /limit: 100/);
  assert.match(gallery, /data\.offset \+ data\.limit/);
  assert.doesNotMatch(loadPage, /scrollIntoView|scrollTo/);
});
