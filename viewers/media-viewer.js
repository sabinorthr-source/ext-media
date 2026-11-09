/* Prototipo local de lightbox inspirado en el flujo de GLightbox; no carga código remoto. */
(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const safeUrl = raw => {
    try { const url = new URL(raw); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; }
    catch { return ""; }
  };

  class MediaViewer {
    constructor() {
      this.dialog = byId("mediaViewer");
      this.stage = byId("viewerStage");
      this.thumbs = byId("viewerThumbs");
      this.caption = byId("viewerCaption");
      this.counter = byId("viewerCounter");
      this.kind = byId("viewerKind");
      this.items = [];
      this.index = 0;
      this.type = "image";
      this.previousFocus = null;
      this.zoomed = false;
      this.drag = null;
      this.swipe = null;
      this.suppressClick = false;
      this.bind();
    }

    bind() {
      if (!this.dialog) return;
      byId("viewerClose")?.addEventListener("click", () => this.close());
      byId("viewerPrev")?.addEventListener("click", () => this.move(-1));
      byId("viewerNext")?.addEventListener("click", () => this.move(1));
      byId("viewerZoom")?.addEventListener("click", () => this.toggleZoom());
      byId("viewerFullscreen")?.addEventListener("click", () => this.toggleFullscreen());
      this.dialog.addEventListener("click", event => {
        if (event.target === this.dialog) this.close();
      });
      this.dialog.addEventListener("close", () => {
        this.stopMedia();
        if (document.fullscreenElement === this.dialog) document.exitFullscreen?.().catch(() => {});
        document.body.classList.remove("viewer-open");
        this.items = [];
        this.thumbs?.replaceChildren();
        if (this.caption) this.caption.textContent = "";
        if (this.counter) this.counter.textContent = "";
        this.zoomed = false;
        if (this.previousFocus?.isConnected) this.previousFocus.focus();
        this.previousFocus = null;
      });
      document.addEventListener("keydown", event => {
        if (!this.dialog.open) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); this.move(-1); }
        else if (event.key === "ArrowRight") { event.preventDefault(); this.move(1); }
        else if (event.key.toLowerCase() === "f") { event.preventDefault(); this.toggleFullscreen(); }
        else if (event.key === "+" || event.key === "=") this.toggleZoom(true);
        else if (event.key === "-") this.toggleZoom(false);
      });
      this.stage.addEventListener("click", event => { if (event.target === this.stage) this.close(); });
      this.stage.addEventListener("wheel", event => {
        if (this.type !== "image" || !event.ctrlKey) return;
        event.preventDefault(); this.toggleZoom(event.deltaY < 0);
      }, { passive: false });
      this.stage.addEventListener("pointerdown", event => this.startPan(event));
      this.stage.addEventListener("pointermove", event => this.pan(event));
      this.stage.addEventListener("pointerup", event => this.finishGesture(event));
      this.stage.addEventListener("pointercancel", () => this.finishGesture(null));
    }

    open(items, index, type, trigger) {
      const expectedType = type === "video" ? "video" : "image";
      this.items = (Array.isArray(items) ? items : []).filter(item => item?.type === expectedType && safeUrl(expectedType === "video" ? (item.playUrl || item.url) : (item.url || item.preview)));
      if (!this.items.length) return;
      const selected = items[index];
      this.index = Math.max(0, this.items.findIndex(item => item === selected || (item.url === selected?.url && item.type === selected?.type)));
      this.type = expectedType;
      this.previousFocus = trigger || document.activeElement;
      this.kind.textContent = expectedType === "video" ? "VIDEOS" : "IMÁGENES";
      this.render();
      if (!this.dialog.open) this.dialog.showModal();
      document.body.classList.add("viewer-open");
      byId("viewerClose")?.focus();
    }

    close() {
      if (this.dialog?.open) this.dialog.close();
      else this.stopMedia();
    }

    move(delta) {
      if (this.items.length < 2) return;
      this.index = (this.index + delta + this.items.length) % this.items.length;
      this.render();
    }

    stopMedia() {
      const video = this.stage?.querySelector("video");
      if (video) { video.pause(); video.removeAttribute("src"); video.querySelectorAll("source").forEach(source => source.removeAttribute("src")); video.load(); }
      this.stage?.replaceChildren();
    }

    render() {
      const item = this.items[this.index];
      if (!item) return;
      this.stopMedia();
      this.zoomed = false;
      byId("viewerZoom").hidden = this.type !== "image";
      byId("viewerZoom").textContent = "＋";
      this.counter.textContent = `${this.index + 1} / ${this.items.length}`;
      this.caption.textContent = [item.title || (this.type === "video" ? "Video" : "Imagen"), item.author, item.sourcePage ? "Publicación del foro" : ""].filter(Boolean).join(" · ");
      byId("viewerPrev").disabled = this.items.length < 2;
      byId("viewerNext").disabled = this.items.length < 2;

      if (this.type === "video") this.renderVideo(item);
      else this.renderImage(item);
      this.renderThumbs();
    }

    renderImage(item) {
      const img = document.createElement("img");
      img.alt = item.title || "Imagen ampliada";
      img.draggable = false;
      img.decoding = "async";
      img.src = safeUrl(item.url) || safeUrl(item.preview);
      img.addEventListener("error", () => {
        const fallback = safeUrl(item.fallbackUrl) || safeUrl(item.preview);
        if (fallback && img.src !== fallback && !img.dataset.fallbackUsed) { img.dataset.fallbackUsed = "1"; img.src = fallback; return; }
        this.showError("No se pudo cargar la imagen.", item.url);
      });
      img.addEventListener("click", event => { if (this.suppressClick) { this.suppressClick = false; event.preventDefault(); return; } this.toggleZoom(); });
      this.stage.append(img);
    }

    renderVideo(item) {
      const url = safeUrl(item.playUrl) || safeUrl(item.url);
      const video = document.createElement("video");
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = url;
      video.addEventListener("error", () => this.showError("El navegador no pudo reproducir este video. Puedes abrir el archivo original.", url), { once: true });
      this.stage.append(video);
      const play = video.play();
      if (play?.catch) play.catch(() => { /* El usuario puede iniciar la reproducción con los controles. */ });
    }

    showError(message, url) {
      const box = document.createElement("div");
      box.className = "viewer-error";
      const text = document.createElement("p"); text.textContent = message; box.append(text);
      const link = document.createElement("a"); link.href = safeUrl(url); link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Abrir recurso original"; box.append(link);
      this.stage.replaceChildren(box);
    }

    renderThumbs() {
      this.thumbs.replaceChildren();
      const fragment = document.createDocumentFragment();
      this.items.forEach((item, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "viewer-thumb";
        button.title = item.title || `${this.type === "video" ? "Video" : "Imagen"} ${index + 1}`;
        button.setAttribute("aria-label", `Mostrar ${this.type === "video" ? "video" : "imagen"} ${index + 1}`);
        button.setAttribute("aria-current", String(index === this.index));
        const thumbUrl = safeUrl(item.preview) || safeUrl(item.fallbackUrl);
        if (thumbUrl) {
          const img = document.createElement("img"); img.loading = "lazy"; img.decoding = "async"; img.alt = ""; img.src = thumbUrl; button.append(img);
        }
        if (this.type === "video") {
          const icon = document.createElement("span"); icon.className = "video-thumb"; icon.textContent = "▶";
          const duration = document.createElement("small"); duration.textContent = "VIDEO"; icon.append(duration); button.append(icon);
        }
        button.addEventListener("click", () => { this.index = index; this.render(); });
        fragment.append(button);
      });
      this.thumbs.append(fragment);
      this.thumbs.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
    }

    toggleZoom(force) {
      if (this.type !== "image") return;
      const img = this.stage.querySelector("img");
      if (!img) return;
      this.zoomed = typeof force === "boolean" ? force : !this.zoomed;
      img.classList.toggle("is-zoomed", this.zoomed);
      if (!this.zoomed) { img.style.transform = ""; img.style.maxWidth = "100%"; img.style.maxHeight = "100%"; }
      else { img.style.maxWidth = "none"; img.style.maxHeight = "none"; img.style.transform = "scale(1.8)"; }
      byId("viewerZoom").textContent = this.zoomed ? "−" : "＋";
    }

    startPan(event) {
      if (this.type !== "image" || event.pointerType !== "touch") return;
      const img = event.target;
      if (this.zoomed && img?.tagName === "IMG") {
        this.drag = { x: event.clientX, y: event.clientY, tx: this.readTranslate(img, 0), ty: this.readTranslate(img, 1), pointerId: event.pointerId };
        img.classList.add("is-dragging"); img.setPointerCapture?.(event.pointerId);
      } else {
        this.swipe = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      }
    }

    readTranslate(img, axis) {
      const match = img.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
      return match ? Number(match[axis + 1]) : 0;
    }

    pan(event) {
      if (!this.drag || !this.zoomed) return;
      const img = this.stage.querySelector("img"); if (!img) return;
      const x = this.drag.tx + event.clientX - this.drag.x;
      const y = this.drag.ty + event.clientY - this.drag.y;
      img.style.transform = `scale(1.8) translate(${x}px, ${y}px)`;
    }

    finishGesture(event) {
      if (this.drag) {
        this.drag = null;
        this.stage.querySelector("img")?.classList.remove("is-dragging");
        return;
      }
      if (!this.swipe) return;
      const start = this.swipe; this.swipe = null;
      if (!event || this.zoomed) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        this.suppressClick = true;
        this.move(dx < 0 ? 1 : -1);
      }
    }

    async toggleFullscreen() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await this.dialog.requestFullscreen?.();
      } catch { this.caption.textContent = "El navegador no permitió activar pantalla completa."; }
    }
  }

  window.ExtMediaViewer = new MediaViewer();
})();
