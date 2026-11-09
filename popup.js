
const startButton = document.getElementById("start");
const status = document.getElementById("status");

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  status.textContent = "Conectando con el tema…";

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id || !tab.url) {
      throw new Error("No se encontró una pestaña activa.");
    }

    const url = new URL(tab.url);

    const hostname = url.hostname.replace(/^www\./i, "");
    if (!["perutops.com"].includes(hostname) || !/\/threads\/[^/]+\.\d+(?:\/|$)/i.test(url.pathname)) {
      throw new Error("Abre un tema de PeruTops antes de iniciar la extracción.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "START_EXTRACTOR"
    });

    if (!response?.ok) {
      throw new Error(response?.error || "No se pudo iniciar.");
    }

    status.textContent =
      "Extracción iniciada. La galería se abrirá al terminar.";
  } catch (error) {
    status.textContent =
      error.message +
      " Si acabas de instalar o actualizar la extensión, recarga el tema.";
    startButton.disabled = false;
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "EXTRACTOR_PROGRESS") {
    status.textContent =
      `Páginas procesadas: ${message.pagesScanned}. ` +
      `Recursos encontrados: ${message.itemsFound}.`;
  }
});
