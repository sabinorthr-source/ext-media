(() => {
  const absolute = (raw, base) => { try { return raw ? new URL(raw, base).href : ""; } catch { return ""; } };
  async function resolveOne(item, { signal, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
    if (!item.attachmentPage && !/\/attachments\//i.test(item.url)) return item;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Timeout resolviendo adjunto")), timeoutMs);
    const abort = () => controller.abort(signal?.reason || new DOMException("Cancelado", "AbortError"));
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetchImpl(item.attachmentPage || item.url, { credentials: "include", redirect: "follow", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const mime = response.headers.get("content-type") || "";
      const directType = ExtractorMedia.classify(response.url, item.title, mime);
      if (["image", "video"].includes(directType) && !/text\/html/i.test(mime)) {
        item.url = response.url;
        item.type = directType;
        if (directType === "video") item.playUrl = response.url;
        item.mimeType = mime;
        item.resolutionStatus = "resolved";
        return item;
      }
      if (!/text\/html/i.test(mime)) throw new Error(`MIME_NO_RECONOCIDO_${mime || "desconocido"}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const metaVideo = doc.querySelector('meta[property="og:video"], meta[property="og:video:url"], meta[name="twitter:player:stream"]')?.content;
      const metaImage = doc.querySelector('meta[property="og:image"]')?.content;
      const video = doc.querySelector("video");
      const image = doc.querySelector(".bbImageWrapper[data-src], img.bbImage[src], img.bbImage[data-src], img[data-src]");
      const rawVideo = video?.getAttribute("src") || video?.getAttribute("data-src") || video?.querySelector("source")?.getAttribute("src") || metaVideo;
      const rawImage = image?.closest(".bbImageWrapper")?.getAttribute("data-src") || image?.getAttribute("data-src") || image?.getAttribute("src") || metaImage;
      const direct = absolute(rawVideo || rawImage, response.url);
      if (!direct) throw new Error("NO_SE_ENCONTRO_RECURSO_DIRECTO");
      const type = rawVideo ? "video" : "image";
      item.url = direct;
      item.type = type;
      if (type === "video") item.playUrl = direct;
      else item.preview = direct;
      item.resolutionStatus = "resolved";
      return item;
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      item.resolutionStatus = "failed";
      item.resolveError = error?.message || String(error);
      return item;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  async function resolveAll(items, options = {}) {
    const candidates = items.filter(item => item.type === "attachment" || item.attachmentPage);
    return ExtractorConcurrency.mapLimit(candidates, options.concurrency || 4, item => resolveOne(item, options), options.onProgress);
  }
  globalThis.ExtractorAttachmentResolver = Object.freeze({ resolveOne, resolveAll });
})();
