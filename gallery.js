const gallery = document.getElementById("gallery");
const summary = document.getElementById("summary");
const status = document.getElementById("status");
let data = { items: [], pagesScanned: 0, sourceUrl: "", totalItems: 0, offset: 0, limit: 100, hasMore: false };
const sessionId = new URLSearchParams(location.search).get("sessionId") || "";
let activeFilter = "all";
let viewerItems = [];
let viewerIndex = 0;

const labels = { image: "Imagen", video: "Video", embed: "Embed", telegram: "Telegram", link: "Enlace", attachment: "Adjunto" };
const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
function safeUrl(raw) { try { const u = new URL(raw); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } }
function isImage(item) { return item.type === "image"; }
function isVideo(item) { return item.type === "video"; }
function resourceUrl(item) { return safeUrl(item.playUrl) || safeUrl(item.url); }
function externalLink(url, label) { const a = make("a", "", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }

function ensureViewer() {
  let dialog = document.getElementById("fancyboxViewer");
  if (dialog) return dialog;
  dialog = make("dialog", "fancybox-viewer");
  dialog.id = "fancyboxViewer";
  dialog.innerHTML = `
    <div class="fb-toolbar"><div class="fb-counter" id="fbCounter"></div><button type="button" class="fb-close" id="fbClose" aria-label="Cerrar">×</button></div>
    <button type="button" class="fb-arrow fb-prev" id="fbPrev" aria-label="Anterior">‹</button>
    <div class="fb-stage" id="fbStage"></div>
    <button type="button" class="fb-arrow fb-next" id="fbNext" aria-label="Siguiente">›</button>
    <div class="fb-caption" id="fbCaption"></div>
    <div class="fb-thumbs" id="fbThumbs"></div>`;
  document.body.append(dialog);
  dialog.addEventListener("click", event => {
    // Cierra al pulsar cualquier zona vacía del fondo oscuro; los medios,
    // miniaturas y controles conservan su propia interacción.
    const protectedArea = event.target.closest(".fb-stage img,.fb-stage video,.fb-thumbs,.fb-toolbar button,.fb-arrow");
    if (!protectedArea) closeViewer();
  });
  dialog.querySelector("#fbClose").addEventListener("click", closeViewer);
  dialog.querySelector("#fbPrev").addEventListener("click", () => moveViewer(-1));
  dialog.querySelector("#fbNext").addEventListener("click", () => moveViewer(1));
  return dialog;
}
function openViewer(item) {
  // En las categorías Imagen y Video el visor navega solo por ese tipo.
  // En "Todos" se mantiene la navegación combinada.
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
  document.body.classList.remove("viewer-open");
  document.getElementById("fbStage")?.replaceChildren();
}
function moveViewer(delta) {
  if (!viewerItems.length) return;
  viewerIndex = (viewerIndex + delta + viewerItems.length) % viewerItems.length;
  renderViewerItem();
}
function renderViewerItem() {
  const item = viewerItems[viewerIndex];
  if (!item) return;
  const stage = document.getElementById("fbStage");
  const thumbs = document.getElementById("fbThumbs");
  stage.replaceChildren();
  if (isVideo(item)) {
    const video = document.createElement("video");
    video.src = resourceUrl(item);
    video.controls = true;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = "metadata";
    stage.append(video);
  } else {
    const img = document.createElement("img");
    // El visor abre primero el recurso original; la miniatura solo es fallback.
    img.src = safeUrl(item.url) || safeUrl(item.preview);
    img.alt = item.title || "Imagen";
    img.decoding = "async";
    img.draggable = false;
    if (item.fallbackUrl && item.fallbackUrl !== img.src) {
      img.addEventListener("error", () => {
        if (img.dataset.fallbackTried) return;
        img.dataset.fallbackTried = "1";
        img.src = safeUrl(item.fallbackUrl || item.preview);
      }, { once: true });
    }
    stage.append(img);
  }
  document.getElementById("fbCounter").textContent = `${viewerIndex + 1} / ${viewerItems.length}`;
  document.getElementById("fbCaption").textContent = `${item.title || labels[item.type]}${item.author ? ` · ${item.author}` : ""}`;
  document.getElementById("fbPrev").disabled = viewerItems.length < 2;
  document.getElementById("fbNext").disabled = viewerItems.length < 2;
  thumbs.replaceChildren();
  viewerItems.forEach((entry, index) => {
    const button = make("button", `fb-thumb${index === viewerIndex ? " active" : ""}`);
    button.type = "button";
    button.title = entry.title || labels[entry.type];
    if (isImage(entry)) {
      const img = document.createElement("img"); img.src = safeUrl(entry.preview) || safeUrl(entry.url); img.alt = "";
      if (entry.fallbackUrl && entry.fallbackUrl !== img.src) img.addEventListener("error", () => { if (!img.dataset.fallbackTried) { img.dataset.fallbackTried = "1"; img.src = safeUrl(entry.fallbackUrl); } }, { once: true });
      button.append(img);
    } else button.append(make("span", "fb-video-thumb", "▶"));
    button.addEventListener("click", () => { viewerIndex = index; renderViewerItem(); });
    thumbs.append(button);
  });
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
    img.src = safeUrl(item.preview) || safeUrl(item.url); img.alt = item.title || "Imagen"; img.loading = "lazy"; img.decoding = "async"; img.fetchPriority = "low";
    img.addEventListener("error", () => {
      const fallback = safeUrl(item.fallbackUrl) || safeUrl(item.preview);
      if (fallback && img.src !== fallback && !img.dataset.fallbackTried) {
        img.dataset.fallbackTried = "1";
        img.src = fallback;
      } else preview.replaceChildren(make("div", "placeholder", "Vista previa no disponible"));
    });
    img.addEventListener("click", () => openViewer(item)); preview.append(img);
  } else if (isVideo(item)) {
    const video = document.createElement("video"); video.src = url; video.controls = true; video.preload = "metadata"; video.playsInline = true;
    video.addEventListener("click", event => { event.preventDefault(); openViewer(item); });
    preview.append(video);
    const expand = make("button", "expand-media", "Ver en pantalla completa"); expand.addEventListener("click", () => openViewer(item)); preview.append(expand);
  } else preview.append(make("div", "placeholder", `${labels[item.type] || "Recurso"}\n${item.title || ""}`));

  const details = make("div", "details");
  details.append(make("h3", "", item.title || labels[item.type] || "Recurso"));
  details.append(make("div", "meta", `Tipo: ${labels[item.type] || item.type || "Recurso"}`));
  if (item.author) details.append(make("div", "meta", `Autor: ${item.author}`));
  if (item.isQuoted) details.append(make("div", "meta", `También aparece en una cita${item.quotedAuthor ? ` de ${item.quotedAuthor}` : ""}`));
  const actions = make("div", "card-actions");
  actions.append(externalLink(url, "Abrir recurso"));
  if (item.sourcePage && safeUrl(item.sourcePage)) actions.append(externalLink(safeUrl(item.sourcePage), "Ir al mensaje"));
  if (item.quotedPostUrl && safeUrl(item.quotedPostUrl)) actions.append(externalLink(safeUrl(item.quotedPostUrl), "Ir al mensaje citado"));
  const copy = make("button", "", "Copiar URL");
  copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); status.textContent = "URL copiada."; } catch { status.textContent = "No se pudo copiar la URL."; } });
  actions.append(copy); details.append(actions); card.append(preview, details); return card;
}

function render() {
  const filtered = data.items.filter(item => activeFilter === "all" || item.type === activeFilter);
  gallery.replaceChildren();
  if (!filtered.length) {
    const msg = data.error ? `La extracción no pudo completarse: ${data.error}` : data.items.length ? "No hay recursos en esta categoría." : data.pagesFailed ? `No se pudieron leer ${data.pagesFailed} páginas del tema.` : "No se encontraron recursos. Comprueba que el tema esté cargado y que la extensión tenga acceso.";
    gallery.append(make("div", "empty", msg));
  } else {
    const fragment = document.createDocumentFragment();
    filtered.forEach(item => fragment.append(createCard(item)));
    gallery.append(fragment);
  }
  const counts = { all: data.items.length };
  Object.keys(labels).forEach(type => counts[type] = data.items.filter(item => item.type === type).length);
  document.querySelectorAll("[data-count]").forEach(el => el.textContent = String(counts[el.dataset.count] ?? 0));
  document.querySelectorAll("#filters button[data-filter]").forEach(button => { button.disabled = button.dataset.filter !== "all" && !counts[button.dataset.filter]; });
  const threadLabel = data.threadId ? ` · Tema #${data.threadId}` : "";
  const statusLabel = ({
    completed: "Completada", partial: "Parcial", failed: "Fallida",
    interrupted: "Interrumpida", cancelled: "Cancelada", running: "En curso", queued: "En cola"
  })[data.status] || (data.complete === false ? "Parcial" : "Completada");
  const partialLabel = data.status && data.status !== "completed" ? ` · ${statusLabel}` :
    data.complete === false ? " · Parcial" : "";
  const first = data.totalItems ? data.offset + 1 : 0;
  const last = data.offset + data.items.length;
  summary.textContent = `${first}-${last} de ${data.totalItems} recursos · ${data.pagesScanned} páginas recorridas${threadLabel}${partialLabel}`;
  document.getElementById("pageInfo").textContent = `Página ${Math.floor(data.offset / data.limit) + 1} · ${data.items.length} recursos visibles`;
  document.getElementById("prevPage").disabled = data.offset <= 0;
  document.getElementById("nextPage").disabled = !data.hasMore;
  status.textContent = data.error ? `${statusLabel}: ${data.error}` :
    data.status === "interrupted" ? "La pestaña de origen se cerró o Chrome se reinició. Se conservaron los recursos recopilados hasta ese momento." :
    data.status === "running" ? "La extracción continúa en la pestaña de origen." :
    data.status === "partial" || data.complete === false ? `Extracción parcial. ${data.pagesFailed || 0} páginas no pudieron procesarse.` :
    data.status === "failed" ? "La extracción falló; se conservaron los resultados parciales disponibles." :
    activeFilter === "all" ? "Extracción completada para el tema activo." : `${filtered.length} resultados en ${labels[activeFilter] || activeFilter}.`;
}

document.getElementById("filters")?.addEventListener("click", event => {
  const button = event.target.closest("button[data-filter]"); if (!button || button.disabled) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll("#filters button[data-filter]").forEach(el => el.classList.toggle("active", el === button));
  render();
});
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function fetchAllItems() {
  const all = [];
  for (let offset = 0; offset < data.totalItems; offset += 100) {
    const page = await chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_RESULTS", sessionId, offset, limit: 100 });
    if (!page?.items) break;
    all.push(...page.items);
  }
  return all;
}
document.getElementById("exportJson")?.addEventListener("click", async () => {
  status.textContent = "Preparando exportación completa…";
  const items = await fetchAllItems();
  downloadFile("extractor-multimedia.json", JSON.stringify({ ...data, items }, null, 2), "application/json;charset=utf-8");
  status.textContent = `${items.length} recursos exportados.`;
});
document.getElementById("exportCsv")?.addEventListener("click", async () => {
  status.textContent = "Preparando exportación completa…";
  const items = await fetchAllItems();
  const fields = ["type", "title", "url", "playUrl", "sourcePage", "author", "isQuoted", "quotedAuthor"];
  const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [fields.join(","), ...items.map(item => fields.map(field => quote(item[field])).join(","))].join("\r\n");
  downloadFile("extractor-multimedia.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
  status.textContent = `${items.length} recursos exportados.`;
});
document.getElementById("copyUrls")?.addEventListener("click", async () => {
  const items = await fetchAllItems();
  const urls = [...new Set(items.map(item => item.playUrl || item.url).filter(Boolean))];
  try { await navigator.clipboard.writeText(urls.join("\n")); status.textContent = `${urls.length} URL copiadas.`; } catch { status.textContent = "No se pudo copiar la URL."; }
});
async function loadPage(offset) {
  const page = await chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_RESULTS", sessionId, offset, limit: 100 });
  if (!page) throw new Error("Los resultados de esta sesión ya no están disponibles.");
  data = page;
  render();
  gallery.scrollIntoView({ block: "start" });
}
document.getElementById("prevPage")?.addEventListener("click", () => loadPage(Math.max(0, data.offset - data.limit)).catch(error => status.textContent = error.message));
document.getElementById("nextPage")?.addEventListener("click", () => loadPage(data.offset + data.limit).catch(error => status.textContent = error.message));
document.getElementById("clear")?.addEventListener("click", async () => {
  if (!confirm("¿Eliminar definitivamente los recursos y el registro de esta extracción? Ya no aparecerá en Extracciones recientes.")) return;
  const result = await chrome.runtime.sendMessage({ type: "CLEAR_EXTRACTOR_RESULTS", sessionId });
  if (result?.ok === false) { status.textContent = result.error || "No se pudieron eliminar los resultados."; return; }
  data = { items: [], pagesScanned: 0, sourceUrl: "", totalItems: 0, offset: 0, limit: 100, hasMore: false };
  render(); status.textContent = "Recursos y registro de esta extracción eliminados.";
});

// Botón flotante para volver arriba sin alterar la paginación actual.
const scrollTopButton = document.getElementById("scrollTop");
function updateScrollTopButton() {
  scrollTopButton?.classList.toggle("visible", window.scrollY > 500);
}
window.addEventListener("scroll", updateScrollTopButton, { passive: true });
scrollTopButton?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
updateScrollTopButton();
async function init() {
  try {
    if (!sessionId) throw new Error("No se indicó la sesión de extracción.");
    const result = await chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_RESULTS", sessionId, offset: 0, limit: 100 });
    if (result) data = result;
    else throw new Error("Los resultados de esta sesión ya no están disponibles.");
    render();
  } catch (error) { status.textContent = `Error cargando resultados: ${error.message}`; }
}
init();
