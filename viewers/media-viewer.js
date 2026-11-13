/* Visor local de Ext-Media: zoom acotado y desplazamiento con mouse/tacto. */
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
      this.zoom = 1;
      this.baseWidth = 0;
      this.baseHeight = 0;
      this.translateX = 0;
      this.translateY = 0;
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
      byId("viewerZoom")?.addEventListener("click", () => this.setZoom(this.zoom === 1 ? 2 : 1));
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
        this.resetZoomState();
        if (this.previousFocus?.isConnected) this.previousFocus.focus();
        this.previousFocus = null;
      });
      document.addEventListener("keydown", event => {
        if (!this.dialog.open) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); this.move(-1); }
        else if (event.key === "ArrowRight") { event.preventDefault(); this.move(1); }
        else if (event.key.toLowerCase() === "f") { event.preventDefault(); this.toggleFullscreen(); }
        else if (event.key === "+" || event.key === "=") { event.preventDefault(); this.setZoom(Math.min(4, this.zoom + 0.5)); }
        else if (event.key === "-") { event.preventDefault(); this.setZoom(Math.max(1, this.zoom - 0.5)); }
      });
      this.stage.addEventListener("click", event => {
        // Solo un clic real en el fondo cierra el visor; nunca activa zoom.
        if (event.target === this.stage) this.close();
      });
      this.stage.addEventListener("wheel", event => {
        if (this.type !== "image" || event.target?.tagName !== "IMG") return;
        event.preventDefault();
        const rect = this.stage.getBoundingClientRect();
        const anchor = { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) };
        const next = event.deltaY < 0 ? Math.min(4, this.zoom + 0.25) : Math.max(1, this.zoom - 0.25);
        this.setZoom(next, anchor);
      }, { passive: false });
      this.stage.addEventListener("pointerdown", event => this.startPan(event));
      this.stage.addEventListener("pointermove", event => this.pan(event));
      this.stage.addEventListener("pointerup", event => this.finishGesture(event));
      this.stage.addEventListener("pointercancel", () => this.finishGesture(null));
      window.addEventListener("resize", () => {
        if (this.dialog.open && this.type === "image") {
          const img = this.stage.querySelector("img");
          if (img?.complete && img.naturalWidth) this.fitImage(img, true);
        }
      });
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
      if (!this.dialog.open) this.dialog.showModal();
      document.body.classList.add("viewer-open");
      this.render();
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

    resetZoomState() {
      this.zoom = 1;
      this.baseWidth = 0;
      this.baseHeight = 0;
      this.translateX = 0;
      this.translateY = 0;
      this.drag = null;
      this.swipe = null;
      this.suppressClick = false;
    }

    render() {
      const item = this.items[this.index];
      if (!item) return;
      this.stopMedia();
      this.resetZoomState();
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
      img.addEventListener("load", () => this.fitImage(img), { once: true });
      img.addEventListener("error", () => {
        const fallback = safeUrl(item.fallbackUrl) || safeUrl(item.preview);
        if (fallback && img.src !== fallback && !img.dataset.fallbackUsed) { img.dataset.fallbackUsed = "1"; img.src = fallback; return; }
        this.showError("No se pudo cargar la imagen.", item.url);
      });
      img.addEventListener("click", event => {
        if (this.suppressClick) { this.suppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
        if (event.target === img) this.setZoom(this.zoom === 1 ? 2 : 1);
      });
      this.stage.append(img);
      if (img.complete && img.naturalWidth) this.fitImage(img);
    }

    fitImage(img, preserveView = false) {
      if (!img?.naturalWidth || !this.stage) return;
      const previousZoom = preserveView ? this.zoom : 1;
      const previousX = preserveView ? this.translateX : 0;
      const previousY = preserveView ? this.translateY : 0;
      const style = getComputedStyle(this.stage);
      const availableWidth = Math.max(1, this.stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      const availableHeight = Math.max(1, this.stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
      const fit = Math.min(availableWidth / img.naturalWidth, availableHeight / img.naturalHeight, 1);
      this.baseWidth = Math.max(1, img.naturalWidth * fit);
      this.baseHeight = Math.max(1, img.naturalHeight * fit);
      img.style.width = `${this.baseWidth}px`;
      img.style.height = `${this.baseHeight}px`;
      img.style.maxWidth = "none";
      img.style.maxHeight = "none";
      this.zoom = previousZoom;
      this.translateX = previousX;
      this.translateY = previousY;
      this.applyImageTransform(img);
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
      if (play?.catch) play.catch(() => {});
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

    setZoom(nextZoom, anchor = { x: 0, y: 0 }) {
      if (this.type !== "image") return;
      const img = this.stage.querySelector("img");
      if (!img || !this.baseWidth || !this.baseHeight) return;
      const next = Math.max(1, Math.min(4, Number(nextZoom) || 1));
      if (next === this.zoom) return;
      const ratio = next / this.zoom;
      this.translateX = anchor.x + (this.translateX - anchor.x) * ratio;
      this.translateY = anchor.y + (this.translateY - anchor.y) * ratio;
      this.zoom = next;
      if (this.zoom === 1) { this.translateX = 0; this.translateY = 0; }
      this.applyImageTransform(img);
      byId("viewerZoom").textContent = this.zoom > 1 ? `${this.zoom.toFixed(zoomDecimals(this.zoom))}×` : "＋";
    }

    applyImageTransform(img) {
      const style = getComputedStyle(this.stage);
      const viewportWidth = Math.max(1, this.stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      const viewportHeight = Math.max(1, this.stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
      const maxX = Math.max(0, (this.baseWidth * this.zoom - viewportWidth) / 2);
      const maxY = Math.max(0, (this.baseHeight * this.zoom - viewportHeight) / 2);
      this.translateX = Math.max(-maxX, Math.min(maxX, this.translateX));
      this.translateY = Math.max(-maxY, Math.min(maxY, this.translateY));
      img.style.transform = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale(${this.zoom})`;
      img.classList.toggle("is-zoomed", this.zoom > 1);
      img.style.touchAction = this.zoom > 1 ? "none" : "pan-y";
      byId("viewerZoom").textContent = this.zoom > 1 ? `${this.zoom.toFixed(zoomDecimals(this.zoom))}×` : "＋";
    }

    startPan(event) {
      if (this.type !== "image" || event.target?.tagName !== "IMG") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (this.zoom > 1) {
        event.preventDefault();
        this.drag = { x: event.clientX, y: event.clientY, tx: this.translateX, ty: this.translateY, pointerId: event.pointerId, moved: false };
        event.target.classList.add("is-dragging");
        event.target.setPointerCapture?.(event.pointerId);
      } else if (event.pointerType === "touch") {
        this.swipe = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        event.target.setPointerCapture?.(event.pointerId);
      }
    }

    pan(event) {
      if (!this.drag || !this.zoom || this.zoom <= 1) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      this.translateX = this.drag.tx + dx;
      this.translateY = this.drag.ty + dy;
      const img = this.stage.querySelector("img");
      if (img) {
        this.applyImageTransform(img);
        // Reancla el gesto tras limitarlo al borde para permitir invertir el arrastre sin zona muerta.
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
        this.drag.tx = this.translateX;
        this.drag.ty = this.translateY;
      }
    }

    finishGesture(event) {
      if (this.drag) {
        const moved = this.drag.moved;
        this.drag = null;
        this.stage.querySelector("img")?.classList.remove("is-dragging");
        if (moved) this.suppressClick = true;
        return;
      }
      if (!this.swipe) return;
      const start = this.swipe; this.swipe = null;
      if (!event || this.zoom > 1) return;
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

  function zoomDecimals(value) { return Number.isInteger(value) ? 0 : 1; }
  window.ExtMediaViewer = new MediaViewer();
})();
