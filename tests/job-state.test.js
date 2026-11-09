const test = require("node:test");
const assert = require("node:assert/strict");
const jobs = require("../shared/job-state.js");

test("normaliza estados conocidos y rechaza estados desconocidos", () => {
  assert.equal(jobs.normalizeStatus("running"), "running");
  assert.equal(jobs.normalizeStatus("interrupted"), "interrupted");
  assert.equal(jobs.normalizeStatus("whatever"), "failed");
});

test("no permite que un trabajo terminal vuelva a running", () => {
  const job = { status: "completed", pagesScanned: 4 };
  const next = jobs.transition(job, "running", { pagesScanned: 5 });
  assert.equal(next.status, "completed");
  assert.equal(next.pagesScanned, 5);
});

test("resume métricas de ejecución sin valores negativos", () => {
  assert.deepEqual(jobs.summarize({ status: "partial", pagesScanned: -2, pagesQueued: "3", pagesFailed: 1, itemsFound: 12 }), {
    status: "partial", pagesScanned: 0, pagesQueued: 3, pagesFailed: 1, itemsFound: 12, terminal: true
  });
});
