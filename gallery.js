const gallery = document.getElementById("gallery");
const summary = document.getElementById("summary");
const status = document.getElementById("status");
let data = { items: [], pagesScanned: 0, sourceUrl: "", errors: [] };
let activeFilter = "all";
let viewerItems = [];
let viewerIndex = 0;
let renderObserver = null;
let renderedCount = 0;
const BATCH_SIZE = 70;
const labels = { image: "Imagen", video: "Video", embed: "Embed", telegram: "Telegram", link: "Enlace", attachment: "Adjunto" };
const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
function safeUrl(raw) { try { const u = new URL(raw); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } }
function isImage(item) { return item.type === "image"; }
function isVideo(item) { return item.type === "video"; }
function resourceUrl(item) { return safeUrl(item.playUrl) || safeUrl(item.url); }
function previewUrl(item) { return safeUrl(item.preview) || safeUrl(item.fallbackUrl) || safeUrl(item.url); }
function externalLink(url, label) { const a = make("a", "", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }

function ensureTopButton() {
  if (document.getElementById("backToTop")) return;
  const button = make("button", "back-to-top", "↑");
  button.id = "backToTop";
  button.type = "button";
  button.title = "Volver al inicio de la galería";
  button.setAttribute("aria-label", "Volver al inicio de la galería");
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.body.append(button);
  const update = () => button.classList.toggle("visible", window.scrollY > 500);
  window.addEventListener("scroll", update, { passive: true });
  update();
}

function ensureViewer() {
  let dialog = document.getElementById("fancyboxViewer");
  if (dialog) return dialog;
  dialog = make("dialog", "fancybox-viewer");
  dialog.id = "fancyboxViewer";
  dialog.innerHTML = `<div class="fb-toolbar"><div class="fb-counter" id="fbCounter"></div><button type="button" class="fb-close" id="fbClose" aria-label="Cerrar">×</button></div><button type="button" class="fb-arrow fb-prev" id="fbPrev" aria-label="Anterior">‹</button><div class="fb-stage" id="fbStage"></div><button type="button" class="fb-arrow fb-next" id="fbNext" aria-label="Siguiente">›</button><div class="fb-caption" id="fbCaption"></div><div class="fb-thumbs" id="fbThumbs"></div>`;
  document.body.append(dialog);
  dialog.addEventListener("click", event => {
    const protectedArea = event.target.closest(".fb-stage img,.fb-stage video,.fb-thumbs,.fb-toolbar button,.fb-arrow");
    if (!protectedArea) closeViewer();
  });
  dialog.querySelector("#fbClose").addEventListener("click", closeViewer);
  dialog.querySelector("#fbPrev").addEventListener("click", () => moveViewer(-1));
  dialog.querySelector("#fbNext").addEventListener("click", () => moveViewer(1));
  dialog.addEventListener("close", () => { document.body.classList.remove("viewer-open"); stopViewerMedia(); });
  return dialog;
}
function stopViewerMedia() {
  const stage = document.getElementById("fbStage");
  const video = stage?.querySelector("video");
  if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
  stage?.replaceChildren();
}
function openViewer(item) {
  const mediaType = activeFilter === "image" || activeFilter === "video" ? activeFilter : null;
  viewerItems = data.items.filter(x => (isImage(x) || isVideo(x)) && (!mediaType || x.type === mediaType));
  viewerIndex = Math.max(0, viewerItems.findIndex(x => x.url === item.url));
  ensureViewer();
  renderViewerItem();
  const dialog = document.getElementById("fancyboxViewer");
  if (!dialog.open) dialog.showModal();
  document.body.classList.add("viewer-open");
}
function closeViewer() {
  const dialog = document.getElementById("fancyboxViewer");
  if (dialog?.open) dialog.close();
  stopViewerMedia();
  viewerItems = [];
}
function moveViewer(delta) {
  if (!viewerItems.length) return;
  viewerIndex = (viewerIndex + delta + viewerItems.length) % viewerItems.length;
  renderViewerItem();
}
function addImageErrorFallback(img, item, failedMessage) {
  img.addEventListener("error", () => {
    const fallback = safeUrl(item.fallbackUrl);
    if (fallback && img.src !== fallback && !img.dataset.fallbackTried) {
      img.dataset.fallbackTried = "1";
      img.src = fallback;
      return;
    }
    const placeholder = make("div", "placeholder", `${failedMessage}\n${item.resolveError || "El servidor no entregó una vista previa."}`);
    img.replaceWith(placeholder);
  });
}
function renderViewerItem() {
  const item = viewerItems[viewerIndex];
  if (!item) return;
  const stage = document.getElementById("fbStage");
  const thumbs = document.getElementById("fbThumbs");
  const oldVideo = stage.querySelector("video");
  if (oldVideo) { oldVideo.pause(); oldVideo.removeAttribute("src"); oldVideo.load(); }
  stage.replaceChildren();
  if (isVideo(item)) {
    const video = document.createElement("video");
    video.src = resourceUrl(item); video.controls = true; video.autoplay = false; video.playsInline = true; video.preload = "metadata";
    video.addEventListener("error", () => stage.append(make("div", "placeholder", "No se pudo reproducir este video. Puedes abrir el recurso original.")), { once: true });
    stage.append(video);
  } else {
    const img = document.createElement("img");
    img.src = resourceUrl(item); img.alt = item.title || "Imagen"; img.draggable = false; img.decoding = "async"; img.loading = "eager";
    addImageErrorFallback(img, item, "Vista previa no disponible");
    stage.append(img);
  }
  document.getElementById("fbCounter").textContent = `${viewerIndex + 1} / ${viewerItems.length}`;
  document.getElementById("fbCaption").textContent = `${item.title || labels[item.type]}${item.author ? ` · ${item.author}` : ""}`;
  document.getElementById("fbPrev").disabled = viewerItems.length < 2;
  document.getElementById("fbNext").disabled = viewerItems.length < 2;
  thumbs.replaceChildren();
  // Ventana acotada de miniaturas: evita crear miles de nodos al abrir un tema enorme.
  const start = Math.max(0, Math.min(viewerIndex - 35, viewerItems.length - 70));
  const end = Math.min(viewerItems.length, start + 70);
  for (let index = start; index < end; index++) {
    const entry = viewerItems[index];
    const button = make("button", `fb-thumb${index === viewerIndex ? " active" : ""}`);
    button.type = "button"; button.title = entry.title || labels[entry.type];
    if (isImage(entry)) {
      const img = document.createElement("img"); img.src = previewUrl(entry); img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      button.append(img);
    } else button.append(make("span", "fb-video-thumb", "▶"));
    button.addEventListener("click", () => { viewerIndex = index; renderViewerItem(); });
    thumbs.append(button);
  }
  thumbs.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "center" });
}
document.addEventListener("keydown", event => {
  const dialog = document.getElementById("fancyboxViewer");
  if (!dialog?.open) return;
  if (event.key === "Escape") closeViewer();
  if (event.key === "ArrowLeft") moveViewer(-1);
  if (event.key === "ArrowRight") moveViewer(1);
});

function createCard(item) {
  const card = make("article", "card");
  const preview = make("div", "preview");
  const url = resourceUrl(item);
  if (!url) return card;
  if (isImage(item)) {
    const img = document.createElement("img");
    img.src = previewUrl(item); img.alt = item.title || "Imagen"; img.loading = "lazy"; img.decoding = "async";
    addImageErrorFallback(img, item, "Vista previa no disponible");
    img.addEventListener("click", () => openViewer(item)); preview.append(img);
  } else if (isVideo(item)) {
    const poster = item.preview ? document.createElement("img") : null;
    if (poster) { poster.src = previewUrl(item); poster.alt = "Vista previa del video"; poster.loading = "lazy"; poster.decoding = "async"; preview.append(poster); }
    const expand = make("button", "expand-media", "▶ Ver video"); expand.addEventListener("click", () => openViewer(item)); preview.append(expand);
  } else preview.append(make("div", "placeholder", `${labels[item.type] || "Recurso"}\n${item.title || ""}`));
  const details = make("div", "details");
  details.append(make("h3", "", item.title || labels[item.type] || "Recurso"));
  details.append(make("div", "meta", `Tipo: ${labels[item.type] || item.type || "Recurso"}`));
  if (item.author) details.append(make("div", "meta", `Autor: ${item.author}`));
  if (item.resolveError) details.append(make("div", "meta error-note", `No se pudo resolver automáticamente: ${item.resolveError}`));
  const actions = make("div", "card-actions");
  actions.append(externalLink(url, "Abrir recurso"));
  if (item.sourcePage && safeUrl(item.sourcePage)) actions.append(externalLink(safeUrl(item.sourcePage), "Ir al mensaje"));
  const copy = make("button", "", "Copiar URL");
  copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); status.textContent = "URL copiada."; } catch { status.textContent = "No se pudo copiar la URL."; } });
  actions.append(copy); details.append(actions); card.append(preview, details); return card;
}
function stopProgressiveRender() {
  if (renderObserver) renderObserver.disconnect();
  renderObserver = null;
  renderedCount = 0;
}
function appendNextBatch(filtered, sentinel) {
  const fragment = document.createDocumentFragment();
  const end = Math.min(renderedCount + BATCH_SIZE, filtered.length);
  for (; renderedCount < end; renderedCount++) fragment.append(createCard(filtered[renderedCount]));
  sentinel.before(fragment);
  if (renderedCount >= filtered.length) { sentinel.remove(); renderObserver?.disconnect(); renderObserver = null; }
}
function render() {
  stopProgressiveRender();
  const filtered = data.items.filter(item => activeFilter === "all" || item.type === activeFilter);
  gallery.replaceChildren();
  if (!filtered.length) {
    const msg = data.error ? `La extracción no pudo completarse: ${data.error}` : data.items.length ? "No hay recursos en esta categoría." : "No se encontraron recursos. Comprueba que el tema esté cargado y que la extensión tenga acceso.";
    gallery.append(make("div", "empty", msg));
  } else {
    const sentinel = make("div", "render-sentinel", "Desplázate para cargar más recursos…");
    gallery.append(sentinel);
    appendNextBatch(filtered, sentinel);
    if (sentinel.isConnected) {
      renderObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) appendNextBatch(filtered, sentinel); }, { rootMargin: "900px" });
      renderObserver.observe(sentinel);
    }
  }
  const counts = { all: data.items.length };
  Object.keys(labels).forEach(type => counts[type] = data.items.filter(item => item.type === type).length);
  document.querySelectorAll("[data-count]").forEach(el => el.textContent = String(counts[el.dataset.count] ?? 0));
  document.querySelectorAll("#filters button[data-filter]").forEach(button => { button.disabled = button.dataset.filter !== "all" && !counts[button.dataset.filter]; });
  summary.textContent = `${data.items.length} recursos · ${data.pagesScanned} páginas recorridas${data.truncated ? " · límite de páginas alcanzado" : ""}`;
  const errorCount = (data.errors || []).length;
  status.textContent = data.error ? `La extracción terminó con un error: ${data.error}` : `${activeFilter === "all" ? "Resultados del tema actual" : `${filtered.length} resultados en ${labels[activeFilter] || activeFilter}`}.${errorCount ? ` Páginas con errores: ${errorCount}; la extracción continuó.` : ""}`;
}
document.getElementById("filters")?.addEventListener("click", event => {
  const button = event.target.closest("button[data-filter]"); if (!button || button.disabled) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll("#filters button[data-filter]").forEach(el => el.classList.toggle("active", el === button));
  render();
});
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
document.getElementById("exportJson")?.addEventListener("click", () => downloadFile("extractor-multimedia.json", JSON.stringify(data, null, 2), "application/json;charset=utf-8"));
document.getElementById("exportCsv")?.addEventListener("click", () => {
  const fields = ["type", "title", "url", "playUrl", "preview", "sourcePage", "author", "resolveError"];
  const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [fields.join(","), ...data.items.map(item => fields.map(field => quote(item[field])).join(","))].join("\r\n");
  downloadFile("extractor-multimedia.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
});
document.getElementById("copyUrls")?.addEventListener("click", async () => {
  const urls = [...new Set(data.items.map(item => item.playUrl || item.url).filter(Boolean))];
  try { await navigator.clipboard.writeText(urls.join("\n")); status.textContent = `${urls.length} URL copiadas.`; } catch { status.textContent = "No se pudo copiar al portapapeles."; }
});
document.getElementById("clear")?.addEventListener("click", async () => {
  if (!confirm("¿Eliminar los resultados temporales de esta sesión?")) return;
  await chrome.runtime.sendMessage({ type: "CLEAR_EXTRACTOR_RESULTS" });
  closeViewer(); data = { items: [], pagesScanned: 0, sourceUrl: "", errors: [] }; render(); status.textContent = "Resultados temporales eliminados.";
});
window.addEventListener("pagehide", () => {
  stopProgressiveRender();
  closeViewer();
  chrome.runtime.sendMessage({ type: "CLEAR_EXTRACTOR_RESULTS" }).catch(() => {});
});
async function init() {
  try {
    const result = await chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_RESULTS" });
    if (result) data = result;
    render(); ensureTopButton();
  } catch (error) { status.textContent = `Error cargando resultados: ${error.message}`; }
}
init();
