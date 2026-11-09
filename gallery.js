const gallery = document.getElementById("gallery");
const summary = document.getElementById("summary");
const status = document.getElementById("status");
let data = { items: [], pagesScanned: 0, sourceUrl: "" };
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
    img.src = safeUrl(item.preview) || safeUrl(item.url);
    img.alt = item.title || "Imagen";
    img.draggable = false;
    if (item.fallbackUrl && item.fallbackUrl !== img.src) {
      img.addEventListener("error", () => {
        if (img.dataset.fallbackTried) return;
        img.dataset.fallbackTried = "1";
        img.src = safeUrl(item.fallbackUrl);
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
    img.src = safeUrl(item.preview) || safeUrl(item.url); img.alt = item.title || "Imagen"; img.loading = "lazy";
    img.addEventListener("error", () => {
      if (item.fallbackUrl && img.src !== item.fallbackUrl && !img.dataset.fallbackTried) {
        img.dataset.fallbackTried = "1";
        img.src = safeUrl(item.fallbackUrl);
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
  const partialLabel = data.complete === false ? ` · Parcial: ${data.pagesFailed || 0} páginas con error` : "";
  summary.textContent = `${data.items.length} recursos · ${data.pagesScanned} páginas recorridas${threadLabel}${partialLabel}`;
  status.textContent = data.error ? "La extracción terminó con un error." :
    data.complete === false ? `Extracción parcial. ${data.pagesFailed || 0} páginas no pudieron procesarse.` :
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
document.getElementById("exportJson")?.addEventListener("click", () => downloadFile("extractor-multimedia.json", JSON.stringify(data, null, 2), "application/json;charset=utf-8"));
document.getElementById("exportCsv")?.addEventListener("click", () => {
  const fields = ["type", "title", "url", "playUrl", "sourcePage", "author"];
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
  await chrome.runtime.sendMessage({ type: "CLEAR_EXTRACTOR_RESULTS", sessionId }); data = { items: [], pagesScanned: 0, sourceUrl: "" }; render(); status.textContent = "Resultados temporales eliminados.";
});
async function init() {
  try {
    if (!sessionId) throw new Error("No se indicó la sesión de extracción.");
    const result = await chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_RESULTS", sessionId });
    if (result) data = result;
    else throw new Error("Los resultados de esta sesión ya no están disponibles.");
    render();
  }
  catch (error) { status.textContent = `Error cargando resultados: ${error.message}`; }
}
init();
