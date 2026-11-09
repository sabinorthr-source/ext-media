const test = require("node:test");
const assert = require("node:assert/strict");
require("../shared/job-state.js");
globalThis.ExtMediaDatabase = {};
require("../storage/job-repository.js");
const repository = globalThis.ExtMediaJobRepository;

test("la limpieza conserva todas las sesiones activas aunque superen el máximo del historial", () => {
  const now = Date.now();
  const jobs = Array.from({ length: 25 }, (_, i) => ({ sessionId: `active-${i}`, status: "running", updatedAt: now - i }));
  const remove = repository.selectCleanupSessions(jobs, now);
  assert.equal(remove.length, 0);
});

test("la limpieza conserva las 20 extracciones terminadas más recientes y elimina las antiguas", () => {
  const now = Date.now();
  const jobs = Array.from({ length: 25 }, (_, i) => ({ sessionId: `done-${i}`, status: "completed", updatedAt: now - i, finishedAt: now - i }));
  const remove = repository.selectCleanupSessions(jobs, now);
  assert.equal(remove.length, 5);
  assert.deepEqual(remove.map(job => job.sessionId).sort(), ["done-20", "done-21", "done-22", "done-23", "done-24"]);
});

test("la limpieza elimina registros terminados de más de 14 días", () => {
  const now = Date.now();
  const jobs = [
    { sessionId: "old", status: "completed", finishedAt: now - 15 * 86400000 },
    { sessionId: "recent", status: "completed", finishedAt: now - 86400000 },
    { sessionId: "active", status: "running", updatedAt: now - 30 * 86400000 }
  ];
  assert.deepEqual(repository.selectCleanupSessions(jobs, now).map(job => job.sessionId), ["old"]);
});
