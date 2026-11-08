/* Shared protocol and XenForo thread identity helpers. Classic-script compatible. */
(() => {
  const ROOTS = ["perutops.com", "forosperu.club"];
  const TYPES = Object.freeze({
    RESET: "RESET_EXTRACTION",
    START: "START_EXTRACTOR",
    CANCEL: "CANCEL_EXTRACTOR",
    PROGRESS: "EXTRACTOR_PROGRESS",
    RESULTS: "EXTRACTOR_RESULTS",
    GET_STATE: "GET_EXTRACTION_STATE",
    GET_RESULTS: "GET_EXTRACTOR_RESULTS",
    CLEAR: "CLEAR_EXTRACTOR_RESULTS"
  });

  function isSupportedHost(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
    return ROOTS.some(root => host === root || host.endsWith(`.${root}`));
  }

  function parseThreadIdentity(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (!/^https?:$/.test(url.protocol) || !isSupportedHost(url.hostname)) return null;
      // XenForo canonical thread routes use /threads/<slug>.<numeric-id>/.
      const match = url.pathname.match(/\/threads\/([^/?#]+?\.(\d+))(?:\/page-(\d+)|\/post-\d+)?\/?$/i);
      if (!match) return null;
      return {
        origin: url.origin,
        host: url.hostname.toLowerCase(),
        threadId: match[2],
        threadSlug: match[1],
        pageNumber: Number(match[3] || 1),
        canonicalPath: `/threads/${match[1]}/`
      };
    } catch {
      return null;
    }
  }

  function normalizeThreadPage(rawUrl, baseUrl, expected) {
    try {
      const url = new URL(rawUrl, baseUrl);
      if (!/^https?:$/.test(url.protocol) || url.origin !== expected.origin) return "";
      const identity = parseThreadIdentity(url.href);
      if (!identity || identity.threadId !== String(expected.threadId)) return "";
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  }

  globalThis.ExtractorProtocol = Object.freeze({ TYPES, isSupportedHost, parseThreadIdentity, normalizeThreadPage });
})();
