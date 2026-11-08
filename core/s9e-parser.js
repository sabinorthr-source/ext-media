(() => {
  function decodeEntities(value) {
    return String(value || "").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  function parsePayload(raw) {
    if (!raw) return null;
    const decoded = decodeEntities(raw).trim();
    try {
      const value = JSON.parse(decoded);
      if (Array.isArray(value)) {
        const result = {};
        for (let i = 0; i + 1 < value.length; i += 2) result[String(value[i])] = value[i + 1];
        return result;
      }
      return value && typeof value === "object" ? value : null;
    } catch { return null; }
  }
  function parseElement(element, baseUrl) {
    const raw = element.getAttribute("data-s9e-mediaembed-iframe") || element.getAttribute("data-s9e-mediaembed-src") || "";
    const payload = parsePayload(raw);
    const direct = element.getAttribute("data-s9e-mediaembed-src") || payload?.src || element.querySelector("iframe")?.getAttribute("src") || "";
    if (!direct) return null;
    try {
      const url = new URL(direct, baseUrl);
      if (!/^https?:$/.test(url.protocol)) return null;
      const provider = String(payload?.["data-s9e-mediaembed"] || element.getAttribute("data-s9e-mediaembed") || "").toLowerCase();
      return { url: url.href, provider, payload: payload || {}, source: "s9e" };
    } catch { return null; }
  }
  globalThis.ExtractorS9e = Object.freeze({ parsePayload, parseElement, decodeEntities });
})();
