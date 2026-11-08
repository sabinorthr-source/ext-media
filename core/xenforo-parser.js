(() => {
  const EXCLUDED = [
    ".message-cell--user", ".message-avatar", ".avatar", ".message-attribution", ".message-user",
    ".message-signature", ".bdMedal_messageUserMedals", ".bdMedal_userMedals", ".bdMedal_medalImage",
    ".reaction", ".reactions", ".reactionsBar", ".reactionSummary", ".message-actionBar", ".shareButtons",
    ".message-editorWrapper", ".message-editor", ".fr-element", ".attachmentUpload", ".bbCodeBlock-sourceJump"
  ].join(",");
  const QUOTES = ["blockquote", ".bbCodeBlock--quote", ".quoteContainer", ".message-quote"].join(",");
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const absolute = (raw, base) => { try { return raw ? new URL(raw, base).href : ""; } catch { return ""; } };

  function messageRoots(doc) {
    let roots = [...doc.querySelectorAll("article.message")];
    if (!roots.length) roots = [...doc.querySelectorAll(".message")].filter(n => !n.parentElement?.closest(".message"));
    if (!roots.length) roots = [...doc.querySelectorAll(".message-cell--main")].filter(n => !n.parentElement?.closest(".message-cell--main"));
    return roots;
  }
  function metadata(root, pageUrl) {
    const postLink = root.querySelector('.message-attribution-main a[href*="/posts/"], .message-attribution a[href*="/posts/"], a[href*="/post-"]');
    const href = postLink?.getAttribute("href") || root.id || "";
    const match = href.match(/(?:post-|posts\/)(\d+)/i) || String(root.id || "").match(/post-(\d+)/i);
    return {
      sourcePage: pageUrl,
      postUrl: absolute(postLink?.getAttribute("href"), pageUrl),
      postId: match?.[1] || "",
      author: clean(root.querySelector(".message-name, .username, [itemprop='author']")?.textContent),
      publishedAt: root.querySelector("time[datetime]")?.getAttribute("datetime") || ""
    };
  }
  function addItem(out, item) {
    if (!item.url) return;
    const key = ExtractorMedia.normalize(item.url);
    const existing = out.get(key);
    if (!existing) {
      item.sources = [{ sourcePage: item.sourcePage, postId: item.postId, context: item.context || "post", author: item.author || "" }];
      out.set(key, item);
      return;
    }
    const rank = { link: 1, attachment: 2, embed: 3, image: 4, video: 5 };
    if ((rank[item.type] || 0) > (rank[existing.type] || 0)) existing.type = item.type;
    if (item.context === "post" && existing.context === "quoted") existing.context = "post";
    if (!existing.title && item.title) existing.title = item.title;
    if (!existing.preview && item.preview) existing.preview = item.preview;
    if (!existing.attachmentPage && item.attachmentPage) existing.attachmentPage = item.attachmentPage;
    if (!existing.playUrl && item.playUrl) existing.playUrl = item.playUrl;
    if (!existing.mimeType && item.mimeType) existing.mimeType = item.mimeType;
    const sourceKey = `${item.sourcePage}|${item.postId}|${item.context}`;
    if (!existing.sources.some(s => `${s.sourcePage}|${s.postId}|${s.context}` === sourceKey)) {
      existing.sources.push({ sourcePage: item.sourcePage, postId: item.postId, context: item.context || "post", author: item.author || "" });
    }
  }
  function extractScope(scope, pageUrl, meta, context, out) {
    const imgs = scope.querySelectorAll("img");
    for (const img of imgs) {
      const wrapper = img.closest(".bbImageWrapper[data-src], .js-lbImage[data-src]");
      const raw = wrapper?.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-url") || img.getAttribute("data-src") || img.getAttribute("src") || "";
      const url = absolute(raw, pageUrl);
      const preview = absolute(img.getAttribute("srcset")?.split(",")[0]?.trim().split(/\s+/)[0] || img.getAttribute("src") || raw, pageUrl);
      const title = clean(img.getAttribute("alt") || img.getAttribute("title") || wrapper?.getAttribute("title")) || "Imagen";
      if (!url || ExtractorMedia.classify(url, title) !== "image") continue;
      const attachment = img.closest("a[href*='/attachments/']") || wrapper?.closest("a[href]");
      addItem(out, { type: "image", url, title, ...meta, context, preview: preview || url, fallbackUrl: preview && preview !== url ? preview : "", attachmentPage: attachment ? absolute(attachment.getAttribute("href"), pageUrl) : "" });
    }
    for (const video of scope.querySelectorAll("video")) {
      const candidates = [video.getAttribute("src"), video.getAttribute("data-src"), ...[...video.querySelectorAll("source")].flatMap(s => [s.getAttribute("src"), s.getAttribute("data-src")])].filter(Boolean);
      for (const raw of candidates) {
        const url = absolute(raw, pageUrl);
        if (url) addItem(out, { type: "video", url, playUrl: url, title: clean(video.getAttribute("title") || video.getAttribute("data-filename")) || "Video", ...meta, context });
      }
    }
    for (const node of scope.querySelectorAll("[data-s9e-mediaembed-iframe], [data-s9e-mediaembed-src]")) {
      const parsed = ExtractorS9e.parseElement(node, pageUrl);
      if (parsed) addItem(out, { type: "embed", url: parsed.url, title: parsed.provider || "Embed S9e", provider: parsed.provider, embedPayload: parsed.payload, ...meta, context });
    }
    for (const frame of scope.querySelectorAll("iframe")) {
      const url = absolute(frame.getAttribute("src") || frame.getAttribute("data-src"), pageUrl);
      if (url && /^https?:/i.test(url)) addItem(out, { type: "embed", url, title: clean(frame.title) || "Contenido incrustado", ...meta, context });
    }
    for (const anchor of scope.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href") || "";
      if (/^javascript:|^mailto:|^tel:/i.test(href) || href.startsWith("#")) continue;
      if (/\/attachments\/upload(?:\?|$)|\/content-removal\/|\/goto\/post(?:\?|\/|$)|\/members\/|\/posts\/\d+\/(?:share|reactions|report)(?:\?|$)|\/threads\/[^/]+\/reply\?quote=\d+/i.test(href)) continue;
      const url = absolute(href, pageUrl);
      if (!url || !/^https?:/i.test(url)) continue;
      const image = anchor.querySelector("img");
      const label = clean(anchor.textContent || anchor.getAttribute("title") || image?.alt || url);
      const type = ExtractorMedia.classify(url, label);
      if (type === "ui" || type === "unknown") continue;
      if (type === "attachment" && image && ExtractorMedia.classify(image.getAttribute("src") || image.getAttribute("data-src"), image.alt || image.title) === "image") continue;
      addItem(out, { type, url, title: label.slice(0, 300) || "Recurso", ...meta, context, attachmentPage: type === "attachment" ? url : "" });
    }
    const walker = scope.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest("a,script,style,textarea")) continue;
      for (let candidate of (node.nodeValue || "").match(/(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi) || []) {
        candidate = candidate.replace(/[.,;!?)\]}]+$/g, "");
        const url = absolute(candidate.startsWith("www.") ? `https://${candidate}` : candidate, pageUrl);
        const type = ExtractorMedia.classify(url, candidate);
        if (url && ["image", "video", "embed", "attachment", "link"].includes(type)) addItem(out, { type, url, title: candidate, ...meta, context });
      }
    }
  }
  function extractDocument(doc, pageUrl) {
    const items = new Map();
    const linkedThreads = new Set();
    const roots = messageRoots(doc);
    for (const root of roots) {
      const meta = metadata(root, pageUrl);
      const body = root.querySelector(".message-body") || root.querySelector(".message-cell--main") || root;
      const main = body.cloneNode(true);
      main.querySelectorAll(`${EXCLUDED}, ${QUOTES}`).forEach(n => n.remove());
      extractScope(main, pageUrl, meta, "post", items);

      // Quotes are parsed independently; nested quote blocks are not re-counted.
      const quoteNodes = [...body.querySelectorAll(QUOTES)].filter(q => !q.parentElement?.closest(QUOTES));
      for (const quote of quoteNodes) {
        const clone = quote.cloneNode(true);
        clone.querySelectorAll(QUOTES).forEach(n => n.remove());
        clone.querySelectorAll(EXCLUDED).forEach(n => n.remove());
        const quoteMeta = { ...meta, quotedAuthor: clean(quote.querySelector(".bbCodeBlock-title, .quoteContainer-title, .username")?.textContent) };
        extractScope(clone, pageUrl, quoteMeta, "quoted", items);
      }
      // Attachments are outside .message-body on standard XenForo layouts.
      const attachments = root.querySelector(".message-attachments");
      if (attachments) extractScope(attachments.cloneNode(true), pageUrl, meta, "post", items);

      for (const a of root.querySelectorAll('a[href*="/threads/"]')) {
        const url = absolute(a.getAttribute("href"), pageUrl);
        if (url) linkedThreads.add(url.split("#")[0]);
      }
    }
    const nextPages = new Set();
    for (const a of doc.querySelectorAll(".pageNav a[href], .pageNavWrapper a[href], .pagination a[href], a[href*='/page-']")) {
      const url = absolute(a.getAttribute("href"), pageUrl);
      if (url) nextPages.add(url.split("#")[0]);
    }
    return { items: [...items.values()], linkedThreads: [...linkedThreads], nextPages: [...nextPages], postsFound: roots.length };
  }
  globalThis.ExtractorXenForo = Object.freeze({ messageRoots, extractDocument, metadata, addItem });
})();
