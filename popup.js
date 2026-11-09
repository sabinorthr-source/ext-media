const startButton = document.getElementById("start");
const status = document.getElementById("status");
const recentJobs = document.getElementById("recentJobs");

const statusLabels = {
  running: "En curso", queued: "En cola", completed: "Completada",
  partial: "Parcial", failed: "Fallida", interrupted: "Interrumpida", cancelled: "Cancelada"
};

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

async function loadRecentJobs() {
  try {
    const jobs = await chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_SESSIONS", limit: 6 });
    recentJobs.replaceChildren();
    if (!Array.isArray(jobs) || !jobs.length) {
      recentJobs.append(node("p", "muted", "Todavía no hay extracciones guardadas."));
      return;
    }
    for (const job of jobs) {
      const card = node("article", "job");
      const title = job.threadId ? `Tema #${job.threadId}` : "Tema de PeruTops";
      card.append(node("p", "", `${title} · ${statusLabels[job.status] || job.status}`));
      card.append(node("p", "muted", `${job.itemsFound || 0} recursos · ${job.pagesScanned || 0} páginas`));
      if (job.error) card.append(node("p", "muted", job.error));
      const open = node("button", "", "Ver resultados guardados");
      open.type = "button";
      open.disabled = ["running", "queued", "finalizing"].includes(job.status);
      open.addEventListener("click", () => {
        chrome.tabs.create({ url: `${chrome.runtime.getURL("gallery.html")}?sessionId=${encodeURIComponent(job.sessionId)}` });
      });
      const remove = node("button", "secondary", "Eliminar datos");
      remove.type = "button";
      remove.disabled = ["running", "queued", "finalizing"].includes(job.status);
      remove.title = "Elimina los recursos y también esta entrada del historial";
      remove.addEventListener("click", async () => {
        if (!confirm("¿Eliminar todos los recursos y el registro de esta extracción?")) return;
        remove.disabled = true;
        try {
          const result = await chrome.runtime.sendMessage({ type: "CLEAR_EXTRACTOR_RESULTS", sessionId: job.sessionId });
          if (result?.ok === false) throw new Error(result.error || "No se pudo eliminar.");
          await loadRecentJobs();
        } catch (error) {
          remove.disabled = false;
          status.textContent = `No se pudo eliminar la extracción: ${error.message}`;
        }
      });
      card.append(open, remove);
      recentJobs.append(card);
    }
  } catch (error) {
    recentJobs.replaceChildren(node("p", "muted", `No se pudo cargar el historial: ${error.message}`));
  }
}

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  status.textContent = "Conectando con el tema…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) throw new Error("No se encontró una pestaña activa.");
    const url = new URL(tab.url);
    const hostname = url.hostname.replace(/^www\./i, "");
    if (!["perutops.com"].includes(hostname) || !/\/threads\/[^/]+\.\d+(?:\/|$)/i.test(url.pathname)) {
      throw new Error("Abre un tema de PeruTops antes de iniciar la extracción.");
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "START_EXTRACTOR" });
    if (!response?.ok) throw new Error(response?.error || "No se pudo iniciar.");
    status.textContent = "Extracción iniciada. El progreso se indica en el icono de Ext-Media; los resultados se abrirán al terminar.";
    await loadRecentJobs();
  } catch (error) {
    status.textContent = `${error.message} Si acabas de instalar o actualizar la extensión, recarga el tema.`;
    startButton.disabled = false;
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "EXTRACTOR_PROGRESS") {
    status.textContent = `Páginas procesadas: ${message.pagesScanned}. Recursos encontrados: ${message.itemsFound}.`;
  }
});

loadRecentJobs();
