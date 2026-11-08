(() => {
  if (window.__extractorMultimediaInstalled) return;
  window.__extractorMultimediaInstalled = true;

  const MAX_PAGES = 200;
  let running = false;

  const absolute = (value, base) => {
    if (!value) return "";
    try { return new URL(value, base).href; } catch { return ""; }
  };
  const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();

  function classifyUrl(url, label = "") {
    const raw = String(url || "");
    const path = raw.split(/[?#]/)[0].toLowerCase();
    const name = String(label || "").toLowerCase();
    let queryName = "";
    try {
      const parsed = new URL(raw, location.href);
      queryName = parsed.searchParams.get("a") || "";
    } catch {}
    const both = `${path} ${name} ${queryName.toLowerCase()}`;
    if (/^data:image\//i.test(raw)) return "ui";
    if (/\/(?:avatars?|medals?)\//i.test(path) || /avatar|reaction|favicon|emoji|medal|medalla|distintivo/i.test(name)) return "ui";
    if (/(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)/i.test(raw)) return "embed";
    if (/(?:t\.me|telegram\.me|telegram\.dog)(?:\/|$)/i.test(raw)) return "telegram";
    if (/\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:$)/i.test(path) || /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:$|[\s"'])/i.test(name) || /-(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:[./?#\s]|$)/i.test(both)) return "image";
    if (/\.(?:mp4|webm|mov|m4v|ogv|ogg|mkv)(?:$)/i.test(path) || /-(?:mp4|webm|mov|m4v|ogv|ogg|mkv)(?:[./?#\s]|$)/i.test(both)) return "video";
    if (/\/attachments\//i.test(path)) return "attachment";
    return "link";
  }

  function addItem(map, item) {
    if (!item?.url) return;
    const key = item.url;
    const old = map.get(key);
    if (!old) { map.set(key, item); return; }
    const rank = { ui: 0, link: 1, attachment: 2, embed: 3, telegram: 3, image: 4, video: 5 };
    if ((rank[item.type] || 0) > (rank[old.type] || 0)) old.type = item.type;
    for (const field of ["title", "author", "sourcePage", "preview", "fallbackUrl", "attachmentPage", "playUrl", "mimeType"]) {
      if ((!old[field] || old[field] === "Adjunto") && item[field]) old[field] = item[field];
    }
  }

  function threadPageUrl(raw, base) {
    const full = absolute(raw, base);
    if (!full) return "";
    try {
      const u = new URL(full);
      if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return "";
      if (!/\/threads\//i.test(u.pathname) || /\/posts\/|\/attachments\//i.test(u.pathname)) return "";
      u.hash = "";
      return u.href;
    } catch { return ""; }
  }

  function getImageUrl(img, pageUrl) {
    const wrapper = img.closest(".bbImageWrapper[data-src], .js-lbImage[data-src]");
    // XenForo suele poner la imagen de tamaño original en data-src del wrapper.
    const raw = wrapper?.getAttribute("data-src") ||
      img.getAttribute("data-src") || img.getAttribute("data-url") ||
      img.getAttribute("data-original") || img.getAttribute("src") ||
      (img.getAttribute("srcset") || "").split(",").map(x => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
    return absolute(raw, pageUrl);
  }

  function extractDocument(doc, pageUrl, items, discoveredPages) {
    const messages = doc.querySelectorAll(".message-cell--main, article.message, .message");
    const roots = messages.length ? [...messages] : [doc.body];

    for (const root of roots) {
      const messageLink = root.querySelector(".message-attribution-main a[href*='/threads/'], .message-attribution a[href*='/threads/']")?.href || pageUrl;
      const author = cleanText(root.querySelector(".message-name, .username, [itemprop='author']")?.textContent);

      // Imágenes normales y las imágenes originales guardadas por XenForo en data-src.
      for (const img of root.querySelectorAll("img")) {
        const cls = `${img.className || ""} ${img.alt || ""} ${img.title || ""}`;
        const excluded = img.closest(".message-cell--user,.message-avatar,.avatar,.message-attribution,.message-user,.message-signature,.bdMedal_messageUserMedals,.bdMedal_userMedals,.bdMedal_medalImage,.reaction,.reactions,.reactionsBar,.reactionSummary,.message-actionBar,.shareButtons");
        if (excluded || /avatar|reaction|favicon|emoji|medal|medalla|distintivo/i.test(cls)) continue;
        const url = getImageUrl(img, pageUrl);
        if (!url || url.startsWith("data:")) continue;
        const wrapperTitle = img.closest(".bbImageWrapper")?.getAttribute("title");
        const title = cleanText(img.getAttribute("alt") || img.getAttribute("title") || wrapperTitle);
        const type = classifyUrl(url, `${title} ${wrapperTitle || ""}`);
        if (type === "ui" || !["image", "attachment"].includes(type)) continue;
        const attachment = img.closest("a[href*='/attachments/']") || img.closest(".bbImageWrapper")?.closest("a[href]");
        addItem(items, {
          type: "image", url, title: title || "Imagen", sourcePage: messageLink,
          author, preview: url,
          fallbackUrl: absolute(img.getAttribute("src") || img.getAttribute("data-src"), pageUrl),
          attachmentPage: attachment ? absolute(attachment.getAttribute("href"), pageUrl) : "",
          original: true
        });
      }

      // Vídeos inline: el src real normalmente está dentro de <source>.
      for (const video of root.querySelectorAll("video")) {
        const sources = [...video.querySelectorAll("source")];
        const candidates = [video.getAttribute("src"), video.getAttribute("data-src"), ...sources.map(s => s.getAttribute("src") || s.getAttribute("data-src"))].filter(Boolean);
        for (const raw of candidates) {
          const url = absolute(raw, pageUrl);
          if (!url) continue;
          addItem(items, { type: "video", url, playUrl: url, title: cleanText(video.getAttribute("title") || video.getAttribute("data-filename")) || "Video", sourcePage: messageLink, author, preview: "" });
        }
      }

      for (const frame of root.querySelectorAll("iframe")) {
        const url = absolute(frame.getAttribute("src") || frame.getAttribute("data-src"), pageUrl);
        if (!url || !/^https?:/i.test(url)) continue;
        addItem(items, { type: "embed", url, title: cleanText(frame.title) || "Contenido incrustado", sourcePage: messageLink, author });
      }

      // Adjuntos XenForo: el nombre del archivo permite saber si una página de adjunto es vídeo.
      for (const a of root.querySelectorAll(".message-attachments .file-preview,.attachmentList a[href],a[href*='/attachments/']")) {
        if (a.closest(".message-editorWrapper,.message-editor,.fr-element,.formRow,.attachmentUpload")) continue;
        if (/\/attachments\/upload(?:\?|$)/i.test(a.getAttribute("href") || "")) continue;
        const img = a.querySelector("img");
        if (img && classifyUrl(getImageUrl(img, pageUrl), img.alt || img.title) === "image") continue;
        const url = absolute(a.getAttribute("href"), pageUrl);
        if (!url) continue;
        const filename = cleanText(a.closest(".file")?.querySelector(".file-name")?.textContent || a.getAttribute("title") || a.querySelector("svg title")?.textContent || a.textContent) || "Adjunto";
        let type = classifyUrl(url, filename);
        if (/\/attachments\/[^/?#]*(?:-mp4|-webm|-mov|-m4v)(?:[./?#]|$)/i.test(url) || /\.(?:mp4|webm|mov|m4v)$/i.test(filename)) type = "video";
        if (/\.(?:jpe?g|png|gif|webp|avif|bmp)$/i.test(filename)) type = "image";
        if (type === "ui") continue;
        addItem(items, { type: ["image", "video"].includes(type) ? type : "attachment", url, title: filename, sourcePage: messageLink, author, preview: "", attachmentPage: url });
      }

      // Enlaces visibles, excluyendo controles internos de XenForo.
      for (const a of root.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href") || "";
        const image = a.querySelector("img");
        if (/\/attachments\//i.test(href) && image && classifyUrl(getImageUrl(image, pageUrl), image.alt || image.title) === "image") continue;
        const excluded = a.closest(".message-attribution,.message-cell--user,.message-user,.message-signature,.bdMedal_messageUserMedals,.bdMedal_userMedals,.bdMedal_medalImage,.reactionsBar,.reactionSummary,.reaction,.bbCodeBlock-sourceJump");
        if (excluded || href.startsWith("#") || a.closest(".message-editorWrapper,.message-editor,.fr-element,.formRow,.attachmentUpload") ||
          /\/attachments\/upload(?:\?|$)/i.test(href) || a.matches("[data-xf-click='attribution']") ||
          /\/content-removal\//i.test(href) || /\/goto\/post(?:\?|\/|$)/i.test(href) ||
          /\/members\//i.test(href) || /\/posts\/\d+\/(?:share|reactions|report)(?:\?|$)/i.test(href) ||
          /\/threads\/[^/]+\/reply\?quote=\d+/i.test(href)) continue;
        const url = absolute(href, pageUrl);
        if (!url || !/^https?:/i.test(url)) continue;
        const label = cleanText(a.textContent || a.getAttribute("title") || image?.alt || url);
        let type = classifyUrl(url, label);
        if (/\/attachments\/[^/?#]*(?:-mp4|-webm|-mov|-m4v)(?:[./?#]|$)/i.test(url)) type = "video";
        if (type === "ui") continue;
        addItem(items, { type, url, title: label.slice(0, 300), sourcePage: messageLink, author, preview: type === "image" ? url : "", attachmentPage: /\/attachments\//i.test(url) ? url : "" });
      }

      // URLs escritas como texto en los mensajes.
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (node.parentElement?.closest("a,script,style,textarea")) continue;
        for (let candidate of (node.nodeValue || "").match(/(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi) || []) {
          candidate = candidate.replace(/[.,;!?)\]}]+$/g, "");
          const url = absolute(candidate.startsWith("www.") ? `https://${candidate}` : candidate, pageUrl);
          if (!url || !/^https?:/i.test(url)) continue;
          const type = classifyUrl(url, candidate);
          if (type === "ui") continue;
          addItem(items, { type, url, title: candidate, sourcePage: messageLink, author, preview: type === "image" ? url : "" });
        }
      }
    }

    for (const a of doc.querySelectorAll(".pageNav a[href],.pageNavWrapper a[href],.pagination a[href],a[href*='/page-']")) {
      const next = threadPageUrl(a.href, pageUrl);
      if (next) discoveredPages.add(next);
    }
  }

  async function resolveAttachmentMedia(items) {
    for (const item of items.values()) {
      if (!/\/attachments\//i.test(item.url)) continue;
      if (item.type === "image") continue;
      try {
        const response = await fetch(item.url, { credentials: "include", redirect: "follow" });
        if (!response.ok) continue;
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const video = doc.querySelector("video");
        const source = video?.querySelector("source");
        const videoUrl = source?.getAttribute("src") || video?.getAttribute("src") ||
          doc.querySelector('meta[property="og:video"],meta[property="og:video:url"],meta[name="twitter:player:stream"]')?.getAttribute("content");
        if (videoUrl) {
          const direct = absolute(videoUrl, response.url || item.url);
          if (direct) { item.type = "video"; item.playUrl = direct; }
        } else if (item.type === "attachment" && /\.(?:jpe?g|png|gif|webp|avif|bmp)/i.test(item.title)) {
          const image = doc.querySelector(".bbImageWrapper[data-src],img.bbImage[src],img.bbImage[data-src]");
          const raw = image?.closest(".bbImageWrapper")?.getAttribute("data-src") || image?.getAttribute("data-src") || image?.getAttribute("src");
          const direct = absolute(raw, response.url || item.url);
          if (direct) { item.type = "image"; item.url = direct; item.preview = direct; }
        }
      } catch (error) { console.debug("No se pudo resolver el adjunto:", item.url, error); }
    }
  }

  async function scrapeAllPages() {
    const items = new Map();
    const visited = new Set();
    const queue = [location.href.split("#")[0]];
    let pagesScanned = 0;
    while (queue.length && pagesScanned < MAX_PAGES) {
      const pageUrl = queue.shift();
      if (!pageUrl || visited.has(pageUrl)) continue;
      visited.add(pageUrl);
      let doc;
      try {
        if (pageUrl === location.href.split("#")[0]) doc = document;
        else {
          const response = await fetch(pageUrl, { credentials: "include", redirect: "follow" });
          if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) continue;
          doc = new DOMParser().parseFromString(await response.text(), "text/html");
        }
      } catch (error) { console.warn("Error leyendo página:", pageUrl, error); continue; }
      const discovered = new Set();
      extractDocument(doc, pageUrl, items, discovered);
      pagesScanned++;
      for (const next of discovered) if (!visited.has(next) && !queue.includes(next)) queue.push(next);
      chrome.runtime.sendMessage({ type: "EXTRACTOR_PROGRESS", pagesScanned, itemsFound: items.size }).catch(() => {});
    }
    await resolveAttachmentMedia(items);
    return { items: [...items.values()], pagesScanned, sourceUrl: location.href };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "START_EXTRACTOR") return;
    if (running) { sendResponse({ ok: false, error: "Ya hay una extracción en curso." }); return; }
    running = true;
    sendResponse({ ok: true });
    scrapeAllPages().then(result => chrome.runtime.sendMessage({ type: "EXTRACTOR_RESULTS", ...result }))
      .catch(error => chrome.runtime.sendMessage({ type: "EXTRACTOR_RESULTS", items: [], pagesScanned: 0, sourceUrl: location.href, error: error?.message || "La extracción falló." }).catch(() => {}))
      .finally(() => { running = false; });
  });
})();
