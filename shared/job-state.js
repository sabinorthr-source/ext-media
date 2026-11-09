(function (root) {
  const TERMINAL = new Set(["completed", "partial", "failed", "interrupted", "cancelled"]);
  const ACTIVE = new Set(["queued", "running", "finalizing"]);
  function normalizeStatus(status) {
    const value = String(status || "").toLowerCase();
    return ACTIVE.has(value) || TERMINAL.has(value) ? value : "failed";
  }
  function summarize(job) {
    const status = normalizeStatus(job?.status);
    const pagesScanned = Math.max(0, Number(job?.pagesScanned) || 0);
    const pagesQueued = Math.max(0, Number(job?.pagesQueued) || 0);
    const pagesFailed = Math.max(0, Number(job?.pagesFailed) || 0);
    const itemsFound = Math.max(0, Number(job?.itemsFound) || 0);
    return { status, pagesScanned, pagesQueued, pagesFailed, itemsFound, terminal: TERMINAL.has(status) };
  }
  function transition(job, nextStatus, patch = {}) {
    const current = normalizeStatus(job?.status);
    const next = normalizeStatus(nextStatus);
    if (TERMINAL.has(current) && current !== next) return { ...job, ...patch, status: current };
    return { ...job, ...patch, status: next, updatedAt: Date.now() };
  }
  const api = { TERMINAL: [...TERMINAL], ACTIVE: [...ACTIVE], normalizeStatus, summarize, transition };
  root.ExtMediaJobState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
