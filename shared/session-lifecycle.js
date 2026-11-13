(function (root) {
  const state = root.ExtMediaJobState;
  const isTerminal = job => Boolean(job && !state.ACTIVE.includes(job.status));
  const shouldCleanupAfterGalleryClose = (job, remainingGalleryTabs) =>
    isTerminal(job) && Number(remainingGalleryTabs) === 0;

  function orphanedTerminalSessions(jobs, galleryTabs) {
    const referenced = new Set((galleryTabs || []).map(tab => tab.sessionId));
    return (jobs || []).filter(job => isTerminal(job) && !referenced.has(job.sessionId)).map(job => job.sessionId);
  }

  function planTabReconciliation(existingTabs, openTabs, jobs, staleTabIds = []) {
    const actual = new Map((openTabs || []).map(tab => [tab.tabId, tab.sessionId]));
    const knownJobs = new Set((jobs || []).map(job => job.sessionId));
    const stale = new Set(staleTabIds || []);
    const removeTabIds = (existingTabs || [])
      .filter(record => stale.has(record.tabId) || !knownJobs.has(record.sessionId))
      .map(record => record.tabId);
    const upsert = (openTabs || []).filter(tab => knownJobs.has(tab.sessionId));
    return { removeTabIds, upsert };
  }

  root.ExtMediaSessionLifecycle = {
    isTerminal,
    shouldCleanupAfterGalleryClose,
    orphanedTerminalSessions,
    planTabReconciliation
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.ExtMediaSessionLifecycle;
})(globalThis);
