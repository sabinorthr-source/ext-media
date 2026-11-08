(() => {
  const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:$|[?#])/i;
  const VIDEO_EXT = /\.(?:mp4|webm|mov|m4v|ogv|ogg|mkv|m3u8|mpd)(?:$|[?#])/i;
  function classify(rawUrl, label = "", mime = "") {
    const raw = String(rawUrl || "");
    const path = raw.split(/[?#]/)[0];
    const hint = `${path} ${label}`.toLowerCase();
    const type = String(mime || "").toLowerCase().split(";")[0].trim();
    if (/^data:image\//i.test(raw)) return "ui";
    if (/avatar|medal|medalla|distintivo|reaction|emoji|favicon/i.test(hint) || /\/(?:avatars?|medals?)\//i.test(path)) return "ui";
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/") || type === "application/vnd.apple.mpegurl" || type === "application/dash+xml") return "video";
    if (IMAGE_EXT.test(path) || /-(?:jpe?g|png|gif|webp|avif|bmp)(?:$|[?#\s])/i.test(hint)) return "image";
    if (VIDEO_EXT.test(path) || /-(?:mp4|webm|mov|m4v|ogv|ogg|mkv)(?:$|[?#\s])/i.test(hint)) return "video";
    if (/(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|tiktok\.com|instagram\.com|reddit\.com|imgur\.com)/i.test(raw)) return "embed";
    if (/\/attachments\//i.test(path)) return "attachment";
    if (/^https?:/i.test(raw)) return "link";
    return "unknown";
  }
  function normalize(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      ["width", "height", "thumbnail", "thumb", "quality", "resize", "fit"].forEach(k => url.searchParams.delete(k));
      return url.href;
    } catch { return String(rawUrl || ""); }
  }
  globalThis.ExtractorMedia = Object.freeze({ classify, normalize, IMAGE_EXT: IMAGE_EXT.source, VIDEO_EXT: VIDEO_EXT.source });
})();
