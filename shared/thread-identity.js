(() => {
  "use strict";

  const SUPPORTED_HOSTS = new Set(["perutops.com", "www.perutops.com"]);

  function parse(raw, base) {
    try {
      const url = new URL(raw, base);
      if (url.protocol !== "https:" || !SUPPORTED_HOSTS.has(url.hostname.toLowerCase())) return null;
      const match = url.pathname.match(/^(.*\/threads\/[^/]*?)\.(\d+)(?:\/|$)/i);
      if (!match) return null;
      const threadPath = `${match[1]}.${match[2]}/`;
      const threadId = match[2];
      const pageMatch = url.pathname.match(/\/page-(\d+)\/?$/i);
      const queryPage = Number(url.searchParams.get("page") || 1);
      const page = pageMatch ? Number(pageMatch[1]) : (Number.isFinite(queryPage) && queryPage > 0 ? queryPage : 1);
      return {
        origin: url.origin,
        hostname: url.hostname.toLowerCase(),
        threadId,
        threadPath,
        threadUrl: `${url.origin}${threadPath}`,
        page
      };
    } catch {
      return null;
    }
  }

  function getThreadIdentity(raw, base) {
    const parsed = parse(raw, base);
    return parsed ? { threadId: parsed.threadId, threadUrl: parsed.threadUrl, origin: parsed.origin } : null;
  }

  function isSameThread(raw, reference, base) {
    const candidate = parse(raw, base);
    const expected = parse(reference, base);
    return Boolean(candidate && expected &&
      candidate.origin === expected.origin &&
      candidate.threadId === expected.threadId);
  }

  function normalizeThreadPage(raw, reference, base) {
    if (!isSameThread(raw, reference, base)) return "";
    try {
      const url = new URL(raw, base);
      url.hash = "";
      // Keep only pagination state; discard tracking and post anchors.
      const pageMatch = url.pathname.match(/\/page-(\d+)\/?$/i);
      const page = pageMatch ? Number(pageMatch[1]) : Number(url.searchParams.get("page") || 1);
      const expected = parse(reference, base);
      url.pathname = expected.threadPath;
      url.search = "";
      if (page > 1) url.pathname += `page-${page}/`;
      return url.href;
    } catch {
      return "";
    }
  }

  globalThis.ExtMediaThreadIdentity = Object.freeze({
    getThreadIdentity,
    isSameThread,
    normalizeThreadPage
  });
})();
