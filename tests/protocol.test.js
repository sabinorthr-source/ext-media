const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { URL, globalThis: null };
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname, "../shared/protocol.js"), "utf8"), context);
const api = context.ExtractorProtocol;

const peru = api.parseThreadIdentity("https://perutops.com/foro-relax/threads/angelica-ramirez-mexicana.438901/");
assert.equal(peru.threadId, "438901");
assert.equal(peru.pageNumber, 1);
const postRoute = api.parseThreadIdentity("https://perutops.com/foro-relax/threads/angelica-ramirez-mexicana.438901/post-4173402");
assert.equal(postRoute.threadId, "438901");
const page2 = api.parseThreadIdentity("https://forosperu.club/foro-relax/threads/tema.123/page-2");
assert.equal(page2.threadId, "123");
assert.equal(page2.pageNumber, 2);
assert.equal(api.parseThreadIdentity("https://perutops.com/"), null);
assert.equal(api.parseThreadIdentity("https://perutops.com/members/example.12/"), null);
assert.equal(api.parseThreadIdentity("https://example.com/threads/tema.123/"), null);

const expected = api.parseThreadIdentity("https://perutops.com/foro-relax/threads/tema.123/");
assert.ok(api.normalizeThreadPage("/foro-relax/threads/tema.123/page-2", "https://perutops.com/foro-relax/threads/tema.123/", expected));
assert.equal(api.normalizeThreadPage("/foro-relax/threads/otro-tema.124/page-2", "https://perutops.com/foro-relax/threads/tema.123/", expected), "");
assert.equal(api.normalizeThreadPage("https://forosperu.club/foro-relax/threads/tema.123/page-2", "https://perutops.com/foro-relax/threads/tema.123/", expected), "");
console.log("protocol.test.js: OK");
