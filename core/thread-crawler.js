(() => {
  function createQueue(startUrl, identity) {
    return [{ url: startUrl, identity, depth: 0 }];
  }
  function enqueueUnique(queue, seen, url, identity, depth) {
    const key = `${identity.threadId}|${url}`;
    if (seen.has(key) || queue.some(task => `${task.identity.threadId}|${task.url}` === key)) return false;
    queue.push({ url, identity, depth });
    return true;
  }
  function pageLimitReached(scanned, maxPages) { return scanned >= maxPages; }
  globalThis.ExtractorThreadCrawler = Object.freeze({ createQueue, enqueueUnique, pageLimitReached });
})();
