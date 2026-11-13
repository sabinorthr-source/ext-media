const test = require("node:test");
const assert = require("node:assert/strict");
require("../shared/job-state.js");
const lifecycle = require("../shared/session-lifecycle.js");

test("cerrar una de dos galerías no elimina la sesión", () => {
  const job = { sessionId: "session-12345678901234567890", status: "completed" };
  assert.equal(lifecycle.shouldCleanupAfterGalleryClose(job, 1), false);
});

test("cerrar la última galería elimina una sesión terminal", () => {
  const job = { sessionId: "session-12345678901234567890", status: "completed" };
  assert.equal(lifecycle.shouldCleanupAfterGalleryClose(job, 0), true);
});

test("una galería que se cierra no elimina una sesión todavía activa", () => {
  const job = { sessionId: "session-12345678901234567890", status: "running" };
  assert.equal(lifecycle.shouldCleanupAfterGalleryClose(job, 0), false);
});

test("la recuperación conserva galerías existentes y elimina asociaciones de pestañas cerradas", () => {
  const existing = [
    { tabId: 10, sessionId: "session-aaaaaaaaaaaaaaaaaaaa" },
    { tabId: 11, sessionId: "session-bbbbbbbbbbbbbbbbbbbb" }
  ];
  const open = [{ tabId: 10, sessionId: "session-aaaaaaaaaaaaaaaaaaaa" }];
  const jobs = existing.map(tab => ({ sessionId: tab.sessionId, status: "completed" }));
  const plan = lifecycle.planTabReconciliation(existing, open, jobs, [11]);
  assert.deepEqual(plan.removeTabIds, [11]);
  assert.deepEqual(plan.upsert, open);
});

test("la recuperación identifica sesiones terminales huérfanas pero conserva las activas", () => {
  const jobs = [
    { sessionId: "session-aaaaaaaaaaaaaaaaaaaa", status: "completed" },
    { sessionId: "session-bbbbbbbbbbbbbbbbbbbb", status: "interrupted" },
    { sessionId: "session-cccccccccccccccccccc", status: "running" }
  ];
  const tabs = [{ tabId: 10, sessionId: "session-bbbbbbbbbbbbbbbbbbbb" }];
  assert.deepEqual(lifecycle.orphanedTerminalSessions(jobs, tabs), ["session-aaaaaaaaaaaaaaaaaaaa"]);
});

test("la reconciliación no elimina una asociación ausente de la instantánea sin verificar que la pestaña cerró", () => {
  const existing = [{ tabId: 12, sessionId: "session-cccccccccccccccccccc" }];
  const plan = lifecycle.planTabReconciliation(existing, [], [
    { sessionId: "session-cccccccccccccccccccc", status: "completed" }
  ], []);
  assert.deepEqual(plan.removeTabIds, []);
});
