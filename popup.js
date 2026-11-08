const startButton = document.getElementById("start");
const status = document.getElementById("status");
const linkedThreads = document.getElementById("linkedThreads");
const maxPages = document.getElementById("maxPages");

function showState(state) {
  if (!state) { status.textContent = "Preparado."; return; }
  if (state.status === "running" || state.status === "starting") {
    const phase = state.phase === "resolving_attachments" ? "Resolviendo adjuntos" : "Recorriendo páginas";
    status.textContent = `${phase}: ${state.pagesScanned || 0} páginas correctas · ${state.pagesFailed || 0} fallidas · ${state.itemsFound || 0} recursos.`;
  } else if (state.status === "complete") status.textContent = `Extracción completa: ${state.itemsFound} recursos en ${state.pagesScanned} páginas.`;
  else if (state.status === "partial" || state.status === "failed") status.textContent = `Extracción ${state.status === "partial" ? "parcial" : "fallida"}: ${state.pagesScanned} páginas, ${state.pagesFailed} fallidas.`;
  else if (state.status === "cancelled") status.textContent = state.error || "La extracción fue cancelada.";
}
async function refreshState() {
  try { showState(await chrome.runtime.sendMessage({ type: "GET_EXTRACTION_STATE" })); }
  catch { status.textContent = "No se pudo consultar el estado de la extracción."; }
}
startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  status.textContent = "Validando el tema actual…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) throw new Error("No se encontró una pestaña activa.");
    const identity = ExtractorProtocol.parseThreadIdentity(tab.url);
    if (!identity) throw new Error("Abre un tema válido de PeruTops o Foros Perú.");
    const runId = `${Date.now()}-${crypto.randomUUID()}`;
    const reset = await chrome.runtime.sendMessage({ type: "RESET_EXTRACTION", sourceTabId: tab.id, runId });
    if (!reset?.ok) throw new Error(reset?.error || "No se pudo preparar la extracción.");
    const options = { includeLinkedThreads: linkedThreads.checked, maxPages: Number(maxPages.value), maxLinkedThreads: 25 };
    const response = await chrome.tabs.sendMessage(tab.id, { type: "START_EXTRACTOR", runId, threadId: identity.threadId, options });
    if (!response?.ok) throw new Error(response?.error || "No se pudo iniciar. Recarga el tema y vuelve a intentarlo.");
    status.textContent = `Extracción iniciada. Límite: ${options.maxPages} páginas${options.includeLinkedThreads ? "; temas enlazados activados" : ""}.`;
  } catch (error) {
    status.textContent = `${error.message} Si acabas de instalar o actualizar la extensión, recarga el tema.`;
    startButton.disabled = false;
  }
});
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "EXTRACTOR_PROGRESS") {
    const phase = message.phase === "resolving_attachments" ? "Resolviendo adjuntos" : "Recorriendo páginas";
    status.textContent = `${phase}: ${message.pagesScanned || 0} páginas · ${message.pagesFailed || 0} fallidas · ${message.itemsFound || 0} recursos.`;
  }
});
refreshState();
