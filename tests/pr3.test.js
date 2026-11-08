const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = { URL, URLSearchParams, console, setTimeout, clearTimeout, AbortController, DOMException };
context.globalThis = context;
vm.createContext(context);
for (const file of ["core/media-classifier.js", "core/s9e-parser.js", "core/concurrency.js", "core/thread-crawler.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const media = context.ExtractorMedia;
assert.equal(media.classify("https://cdn.test/a.jpg?token=1"), "image");
assert.equal(media.classify("https://cdn.test/a.mp4?token=1"), "video");
assert.equal(media.classify("https://cdn.test/attachments/123/"), "attachment");
assert.equal(media.classify("https://cdn.test/avatar/123.png"), "ui");
assert.equal(media.classify("https://youtu.be/abc"), "embed");

const s9e = context.ExtractorS9e;
assert.deepEqual(JSON.parse(JSON.stringify(s9e.parsePayload('{"src":"https://www.youtube.com/embed/abc","data-s9e-mediaembed":"youtube"}'))), { src: "https://www.youtube.com/embed/abc", "data-s9e-mediaembed": "youtube" });
assert.deepEqual(JSON.parse(JSON.stringify(s9e.parsePayload('["src","https://www.tiktok.com/embed/v2/123","data-s9e-mediaembed","tiktok"]'))), { src: "https://www.tiktok.com/embed/v2/123", "data-s9e-mediaembed": "tiktok" });

const crawler = context.ExtractorThreadCrawler;
const queue = crawler.createQueue("https://perutops.com/threads/demo.10/", { threadId: "10" });
const seen = new Set();
assert.equal(crawler.enqueueUnique(queue, seen, "https://perutops.com/threads/demo.10/page-2", { threadId: "10" }, 0), true);
assert.equal(crawler.enqueueUnique(queue, seen, "https://perutops.com/threads/demo.10/page-2", { threadId: "10" }, 0), false);
assert.equal(crawler.pageLimitReached(500, 500), true);

(async () => {
  const values = await context.ExtractorConcurrency.mapLimit([1,2,3,4,5,6], 2, async n => n * 2);
  assert.deepEqual(Array.from(values), [2,4,6,8,10,12]);
  for (const name of ["post-with-quoted-media.html", "post-with-s9e.html", "post-with-nested-message.html"]) {
    const fixture = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
    assert.match(fixture, /<article class="message"/);
  }
  const quoted = fs.readFileSync(path.join(__dirname, "fixtures/post-with-quoted-media.html"), "utf8");
  assert.match(quoted, /quoted\.webp/);
  assert.match(quoted, /clip\.mp4/);
  const s9eFixture = fs.readFileSync(path.join(__dirname, "fixtures/post-with-s9e.html"), "utf8");
  assert.match(s9eFixture, /data-s9e-mediaembed-iframe/);
  console.log("pr3.test.js: OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
