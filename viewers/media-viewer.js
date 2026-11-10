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
      this.zoomScale = 1;
      this.panX = 0;
      this.panY = 0;
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
        else if (event.key === "+" || event.key === "=") this.zoomBy(1.2);
        else if (event.key === "-") this.zoomBy(1 / 1.2);
      });
      this.stage.addEventListener("click", event => { if (event.target === this.stage) this.close(); });
      this.stage.addEventListener("wheel", event => {
        if (this.type !== "image" || !this.stage.querySelector("img")) return;
        event.preventDefault();
        this.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
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
      this.resetZoom();
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

    resetZoom() {
      this.zoomScale = 1;
      this.panX = 0;
      this.panY = 0;
      this.zoomed = false;
      this.drag = null;
      const img = this.stage?.querySelector("img");
      if (img) {
        img.classList.remove("is-zoomed", "is-dragging");
        img.style.transform = "";
      }
      if (byId("viewerZoom")) byId("viewerZoom").textContent = "＋";
    }

    applyImageTransform() {
      const img = this.stage.querySelector("img");
      if (!img) return;
      this.zoomed = this.zoomScale > 1.001;
      img.classList.toggle("is-zoomed", this.zoomed);
      img.classList.toggle("is-dragging", Boolean(this.drag));
      img.style.transform = this.zoomed
        ? `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomScale})`
        : "";
      byId("viewerZoom").textContent = this.zoomed ? `${this.zoomScale.toFixed(1)}×` : "＋";
    }

    clampPan(scale, x, y) {
      const img = this.stage.querySelector("img");
      if (!img) return { x: 0, y: 0 };
      const style = getComputedStyle(this.stage);
      const availableWidth = this.stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availableHeight = this.stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const maxX = Math.max(0, (img.offsetWidth * scale - availableWidth) / 2);
      const maxY = Math.max(0, (img.offsetHeight * scale - availableHeight) / 2);
      return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
    }

    zoomBy(factor, clientX, clientY) {
      if (this.type !== "image") return;
      const img = this.stage.querySelector("img");
      if (!img || !img.complete || !img.naturalWidth) return;
      const previous = this.zoomScale;
      const next = Math.max(1, Math.min(4, previous * factor));
      if (Math.abs(next - previous) < 0.001) return;
      if (next === 1) {
        this.zoomScale = 1; this.panX = 0; this.panY = 0;
        this.applyImageTransform(); return;
      }
      const rect = this.stage.getBoundingClientRect();
      const anchorX = Number.isFinite(clientX) ? clientX - (rect.left + rect.width / 2) : 0;
      const anchorY = Number.isFinite(clientY) ? clientY - (rect.top + rect.height / 2) : 0;
      const ratio = next / previous;
      const translatedX = anchorX - (anchorX - this.panX) * ratio;
      const translatedY = anchorY - (anchorY - this.panY) * ratio;
      this.zoomScale = next;
      const bounded = this.clampPan(next, translatedX, translatedY);
      this.panX = bounded.x; this.panY = bounded.y;
      this.applyImageTransform();
    }

    toggleZoom() {
      if (this.type !== "image") return;
      if (this.zoomScale > 1) this.zoomBy(1 / this.zoomScale);
      else this.zoomBy(2);
    }

    startPan(event) {
      if (this.type !== "image") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const img = this.stage.querySelector("img");
      if (this.zoomScale > 1 && img && (event.target === img || event.pointerType === "touch")) {
        event.preventDefault();
        this.drag = { x: event.clientX, y: event.clientY, tx: this.panX, ty: this.panY, pointerId: event.pointerId, moved: false };
        this.stage.setPointerCapture?.(event.pointerId);
        this.applyImageTransform();
      } else if (event.pointerType === "touch") {
        this.swipe = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        this.stage.setPointerCapture?.(event.pointerId);
      }
    }

    pan(event) {
      if (!this.drag || !this.zoomed) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.drag.moved = true;
      const bounded = this.clampPan(this.zoomScale, this.drag.tx + dx, this.drag.ty + dy);
      this.panX = bounded.x; this.panY = bounded.y;
      this.applyImageTransform();
    }

    finishGesture(event) {
      if (this.drag) {
        const moved = this.drag.moved;
        this.drag = null;
        if (moved) this.suppressClick = true;
        this.applyImageTransform();
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
