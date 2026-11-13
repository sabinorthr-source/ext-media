const gallery = document.getElementById("gallery");
const summary = document.getElementById("summary");
const status = document.getElementById("status");
let data = { items: [], pagesScanned: 0, sourceUrl: "", totalItems: 0, offset: 0, limit: 100, hasMore: false };
const sessionId = new URLSearchParams(location.search).get("sessionId") || "";
let activeFilter = "all";
let renderObserver = null;
let renderedCount = 0;
const RENDER_BATCH_SIZE = 30;

const labels = { image: "Imagen", video: "Video", embed: "Embed", telegram: "Telegram", link: "Enlace", attachment: "Adjunto" };
const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
function safeUrl(raw) { try { const u = new URL(raw); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } }
function isImage(item) { return item.type === "image"; }
function isVideo(item) { return item.type === "video"; }
function resourceUrl(item) { return safeUrl(item.playUrl) || safeUrl(item.url); }
function externalLink(url, label) { const a = make("a", "", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }

function openMediaViewer(item, trigger) {
  if (!window.ExtMediaViewer || (!isImage(item) && !isVideo(item))) return;
  const index = data.items.indexOf(item);
  if (index < 0) return;
  window.ExtMediaViewer.open(data.items, index, item.type, trigger);
}

async function reportPreviewSuccess(item) {
  if (!item.previewDiagnostic && !item.resolveError) return;
  await chrome.runtime.sendMessage({ type: "PREVIEW_LOAD_DIAGNOSTIC", sessionId, mediaKey: item.dedupeKey || item.url, category: "resolved" }).catch(() => {});
  delete item.previewDiagnostic;
  delete item.resolveError;
  delete item.resolveStatus;
}

async function diagnosePreviewFailure(rawUrl, item) {
  let url;
  try { url = new URL(rawUrl); } catch { return { category: "invalid-url", label: "URL inválida", detail: "La dirección de la vista previa no es una URL válida." }; }
  if (!["http:", "https:"].includes(url.protocol)) return { category: "invalid-url", label: "Protocolo no permitido", detail: `Protocolo ${url.protocol} no permitido.` };
  const trustedForumHost = ["perutops.com", "www.perutops.com", "media.perutops.com"].includes(url.hostname);
  if (!trustedForumHost) return { category: "unverified-external", label: "Recurso externo no verificable", detail: "El navegador no permite determinar el estado HTTP de este servidor desde la extensión." };
  try {
    let response = await fetch(url.href, { method: "HEAD", credentials: "include", cache: "no-store", redirect: "follow" });
    if ([401, 403, 405, 501].includes(response.status)) {
      const headStatus = response.status;
      const ranged = await fetch(url.href, { method: "GET", headers: { Range: "bytes=0-0" }, credentials: "include", cache: "no-store", redirect: "follow" });
      try { await ranged.body?.cancel(); } catch {}
      // Algunos servidores rechazan HEAD pero permiten GET. Solo clasificamos
      // como acceso denegado si la petición GET también fue rechazada.
      response = ranged.status >= 200 && ranged.status < 300 ? ranged : { status: headStatus, ok: false, headers: response.headers };
    }
    if (response.status === 401 || response.status === 403) return { category: "access-denied", label: `Acceso denegado (${response.status})`, detail: `El servidor respondió HTTP ${response.status}. Puede requerir autenticación o rechazar la carga desde la extensión.`, status: response.status };
    if (response.status === 404 || response.status === 410) return { category: "resource-unavailable", label: `Recurso no disponible (${response.status})`, detail: `El servidor respondió HTTP ${response.status}.`, status: response.status };
    if (!response.ok) return { category: "http-error", label: `Error HTTP ${response.status}`, detail: `El servidor respondió HTTP ${response.status}.`, status: response.status };
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) return { category: "invalid-content-type", label: "El recurso no es una imagen", detail: `El servidor respondió con Content-Type: ${contentType}.`, status: response.status };
    return { category: "display-failure", label: "Carga bloqueada o incompatible", detail: "El servidor respondió correctamente, pero el navegador no pudo mostrar la imagen.", status: response.status };
  } catch (error) {
    return { category: "network-or-permission", label: "Error de red o permisos", detail: `No se pudo consultar el servidor desde la extensión: ${error?.message || "error de red/permisos"}.` };
  }
}

function createCard(item) {
  const card = make("article", "card");
  const preview = make("div", "preview");
  const url = resourceUrl(item);
  if (!url) { card.append(make("div", "placeholder", "URL no disponible")); return card; }

  if (isImage(item)) {
    const img = document.createElement("img");
    img.src = safeUrl(item.preview) || safeUrl(item.fallbackUrl) || safeUrl(item.url);
    img.alt = item.title || "Imagen"; img.loading = "lazy"; img.decoding = "async"; img.fetchPriority = "low";
    const previewCandidates = [...new Set([safeUrl(item.preview), safeUrl(item.fallbackUrl), safeUrl(item.url)].filter(Boolean))];
    let previewIndex = Math.max(0, previewCandidates.indexOf(img.src));
    img.addEventListener("error", async () => {
      previewIndex++;
      if (previewIndex < previewCandidates.length) { img.src = previewCandidates[previewIndex]; return; }
      const failedUrl = previewCandidates[0] || "";
      const diagnostic = await diagnosePreviewFailure(failedUrl, item);
      const message = diagnostic.label || "No se pudo determinar la causa de la carga.";
      const placeholder = make("div", "placeholder", `Vista previa no disponible\n${message}`);
      placeholder.title = diagnostic.detail || message;
      preview.replaceChildren(placeholder);
      status.textContent = `Vista previa no disponible: ${message}`;
      chrome.runtime.sendMessage({ type: "PREVIEW_LOAD_DIAGNOSTIC", sessionId, mediaKey: item.dedupeKey || item.url, category: diagnostic.category, detail: diagnostic.detail || message, url: failedUrl, status: diagnostic.status || 0 }).catch(() => {});
    });
    img.addEventListener("load", () => { reportPreviewSuccess(item).catch(() => {}); }, { once: true });
    img.addEventListener("click", event => openMediaViewer(item, event.currentTarget));
    preview.append(img);
  } else if (isVideo(item)) {
    const poster = safeUrl(item.preview) || safeUrl(item.fallbackUrl);
    if (poster) {
      const img = document.createElement("img"); img.src = poster; img.alt = item.title || "Video";
      img.loading = "lazy"; img.decoding = "async"; img.fetchPriority = "low"; preview.append(img);
    } else preview.append(make("div", "video-card-placeholder", "▶\nVIDEO"));
    const expand = make("button", "expand-media", "▶ Reproducir video");
    expand.type = "button"; expand.addEventListener("click", event => openMediaViewer(item, event.currentTarget)); preview.append(expand);
  } else preview.append(make("div", "placeholder", `${labels[item.type] || "Recurso"}\n${item.title || ""}`));

  const details = make("div", "details");
  details.append(make("h3", "", item.title || labels[item.type] || "Recurso"));
  details.append(make("div", "meta", `Tipo: ${labels[item.type] || item.type || "Recurso"}`));
  if (item.author) details.append(make("div", "meta", `Autor: ${item.author}`));
  if (item.resolveError) details.append(make("div", "meta", `Resolución del adjunto: ${item.resolveError}`));
  if (item.previewDiagnostic?.message) details.append(make("div", "meta", `Último diagnóstico: ${item.previewDiagnostic.message}`));
  const actions = make("div", "card-actions");
  actions.append(externalLink(url, isVideo(item) ? "Abrir video" : "Abrir recurso"));
  if (item.sourcePage && safeUrl(item.sourcePage)) actions.append(externalLink(safeUrl(item.sourcePage), "Ir al mensaje"));
  const copy = make("button", "", "Copiar URL"); copy.type = "button";
  copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); status.textContent = "URL copiada."; } catch { status.textContent = "No se pudo copiar la URL."; } });
  actions.append(copy); details.append(actions); card.append(preview, details); return card;
}

function stopProgressiveRender() {
  renderObserver?.disconnect(); renderObserver = null; renderedCount = 0;
}
function appendNextBatch(filtered, sentinel) {
  const fragment = document.createDocumentFragment();
  const end = Math.min(renderedCount + RENDER_BATCH_SIZE, filtered.length);
  for (; renderedCount < end; renderedCount++) fragment.append(createCard(filtered[renderedCount]));
  sentinel.before(fragment);
  if (renderedCount >= filtered.length) { sentinel.remove(); renderObserver?.disconnect(); renderObserver = null; }
}

function render() {
  stopProgressiveRender();
  const filtered = data.items.filter(item => activeFilter === "all" || item.type === activeFilter);
  gallery.replaceChildren();
  if (!filtered.length) {
    const msg = data.error ? `La extracción no pudo completarse: ${data.error}` : data.items.length ? "No hay recursos en esta categoría." : data.pagesFailed ? `No se pudieron leer ${data.pagesFailed} páginas del tema.` : "No se encontraron recursos. Comprueba que el tema esté cargado y que la extensión tenga acceso.";
    gallery.append(make("div", "empty", msg));
  } else {
    const sentinel = make("div", "render-sentinel", "Desplázate para cargar más recursos…");
    gallery.append(sentinel); appendNextBatch(filtered, sentinel);
    if (sentinel.isConnected) {
      renderObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) appendNextBatch(filtered, sentinel);
      }, { rootMargin: "800px" });
      renderObserver.observe(sentinel);
    }
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
  const blob = content instanceof Blob ? content : new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function forEachExportPage(visitor) {
  const total = Math.max(0, Number(data.totalItems) || 0);
  for (let offset = 0; offset < total; offset += 100) {
    const page = await chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_RESULTS", sessionId, offset, limit: 100 });
    if (!page || !Array.isArray(page.items)) throw new Error("La exportación se interrumpió: no se pudo leer una página del catálogo.");
    await visitor(page.items, offset);
    if (!page.items.length) break;
  }
}
function exportUrlValue(field, value) {
  if (["url", "playUrl", "sourcePage"].includes(field)) return safeUrl(value);
  return value;
}
document.getElementById("exportJson")?.addEventListener("click", async () => {
  try {
    status.textContent = "Preparando exportación completa…";
    const metadata = { ...data }; delete metadata.items;
    metadata.offset = 0; metadata.limit = Math.max(100, Number(data.totalItems) || 0); metadata.hasMore = false;
    const parts = [JSON.stringify(metadata).replace(/}$/, ',"items":[')];
    let first = true, count = 0;
    await forEachExportPage(items => {
      if (items.length) { parts.push((first ? "" : ",") + items.map(item => JSON.stringify(item)).join(",")); first = false; count += items.length; }
    });
    parts.push("]}");
    downloadFile("extractor-multimedia.json", new Blob(parts, { type: "application/json;charset=utf-8" }), "application/json;charset=utf-8");
    status.textContent = `${count} recursos exportados.`;
  } catch (error) { status.textContent = error.message || "No se pudo exportar el catálogo."; }
});
document.getElementById("exportCsv")?.addEventListener("click", async () => {
  try {
    status.textContent = "Preparando exportación completa…";
    const fields = ["type", "title", "url", "playUrl", "sourcePage", "author"];
    const parts = ["\uFEFF" + window.ExtMediaCsv.row(fields) + "\r\n"];
    let count = 0;
    await forEachExportPage(items => {
      if (!items.length) return;
      parts.push(items.map(item => window.ExtMediaCsv.row(fields.map(field => exportUrlValue(field, item[field])))).join("\r\n") + "\r\n");
      count += items.length;
    });
    downloadFile("extractor-multimedia.csv", new Blob(parts, { type: "text/csv;charset=utf-8" }), "text/csv;charset=utf-8");
    status.textContent = `${count} recursos exportados.`;
  } catch (error) { status.textContent = error.message || "No se pudo exportar el catálogo."; }
});
document.getElementById("copyUrls")?.addEventListener("click", async () => {
  try {
    const urls = new Set();
    await forEachExportPage(items => items.forEach(item => { const url = safeUrl(item.playUrl) || safeUrl(item.url); if (url) urls.add(url); }));
    await navigator.clipboard.writeText([...urls].join("\n")); status.textContent = `${urls.size} URL copiadas.`;
  } catch (error) { status.textContent = error.message || "No se pudo copiar al portapapeles."; }
});
async function loadPage(offset) {
  window.ExtMediaViewer?.close();
  const page = await chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_RESULTS", sessionId, offset, limit: 100 });
  if (!page) throw new Error("Los resultados de esta sesión ya no están disponibles.");
  data = page;
  render();
}
document.getElementById("prevPage")?.addEventListener("click", () => loadPage(Math.max(0, data.offset - data.limit)).catch(error => status.textContent = error.message));
document.getElementById("nextPage")?.addEventListener("click", () => loadPage(data.offset + data.limit).catch(error => status.textContent = error.message));
document.getElementById("clear")?.addEventListener("click", async () => {
  if (!confirm("¿Eliminar definitivamente los recursos y el registro de esta extracción? Ya no aparecerá en Extracciones recientes.")) return;
  window.ExtMediaViewer?.close();
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
    const registration = await chrome.runtime.sendMessage({ type: "GALLERY_SESSION_OPENED", sessionId });
    if (registration?.ok === false) throw new Error(registration.error || "No se pudo registrar esta pestaña de galería.");
    const result = await chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_RESULTS", sessionId, offset: 0, limit: 100 });
    if (result) data = result;
    else throw new Error("Los resultados de esta sesión ya no están disponibles.");
    render();
  } catch (error) { status.textContent = `Error cargando resultados: ${error.message}`; }
}
init();
