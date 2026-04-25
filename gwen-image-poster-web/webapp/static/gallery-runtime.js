"use strict";

(function attachGalleryRuntime(windowObject) {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getCardImageNode(card) {
    return card?.querySelector?.("img[data-src]") || null;
  }

  function getCardBounds(card) {
    return card?.getBoundingClientRect?.() || null;
  }

  function setCardRevealStyle(card, state) {
    if (!card) {
      return;
    }
    card.style.setProperty("--gallery-item-opacity", `${state.opacity}`);
    card.style.setProperty("--gallery-item-offset-y", `${state.offsetY}px`);
    card.style.setProperty("--gallery-item-scale", `${state.scale}`);
  }

  function setHiddenCardState(card, direction, options) {
    const hiddenOffset = direction === "up" ? -options.maxOffsetPx : options.maxOffsetPx;
    setCardRevealStyle(card, {
      opacity: 0,
      offsetY: hiddenOffset,
      scale: options.minScale,
    });
  }

  class GalleryScrollRoot {
    constructor({ root, fallbackRoot = null }) {
      this.root = root || fallbackRoot || null;
      this.fallbackRoot = fallbackRoot || root || null;
    }

    getNode() {
      return this.root || this.fallbackRoot || null;
    }

    getBounds() {
      return this.getNode()?.getBoundingClientRect?.() || null;
    }

    getHeight() {
      return Math.max(Math.round(this.getNode()?.clientHeight || windowObject.innerHeight || 0), 0);
    }

    getScrollTop() {
      const node = this.getNode();
      if (!node) {
        return 0;
      }
      if (node === windowObject) {
        return windowObject.scrollY || windowObject.pageYOffset || 0;
      }
      return node.scrollTop || 0;
    }

    getRootMargin({ screens = 1, extraPx = 0 } = {}) {
      const margin = Math.max(Math.round(this.getHeight() * screens) + extraPx, 0);
      return `${margin}px 0px`;
    }
  }

  class GalleryImageLoader {
    constructor({ scrollRoot, preloadScreens = 1, preloadExtraPx = 24, immediateExtraPx = 24 }) {
      this.scrollRoot = scrollRoot;
      this.preloadScreens = preloadScreens;
      this.preloadExtraPx = preloadExtraPx;
      this.immediateExtraPx = immediateExtraPx;
      this.observer = null;
      this.observedCards = new Set();
    }

    reset() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      this.observedCards.clear();
    }

    refresh() {
      if (!this.observedCards.size) {
        this.reset();
        return;
      }
      const cards = Array.from(this.observedCards);
      this.reset();
      cards.forEach((card) => this.register(card));
    }

    ensureObserver() {
      if (this.observer || typeof windowObject.IntersectionObserver !== "function") {
        return this.observer;
      }
      this.observer = new windowObject.IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }
            const card = entry.target;
            this.observedCards.delete(card);
            this.observer?.unobserve(card);
            this.startLoad(card);
          });
        },
        {
          root: this.scrollRoot.getNode(),
          rootMargin: this.scrollRoot.getRootMargin({ screens: this.preloadScreens, extraPx: this.preloadExtraPx }),
          threshold: 0.01,
        }
      );
      return this.observer;
    }

    shouldLoadImmediately(card) {
      const rootBounds = this.scrollRoot.getBounds();
      const cardBounds = getCardBounds(card);
      if (!rootBounds || !cardBounds) {
        return true;
      }
      return cardBounds.top < rootBounds.bottom + this.immediateExtraPx
        && cardBounds.bottom > rootBounds.top - this.immediateExtraPx;
    }

    startLoad(card) {
      const imageNode = getCardImageNode(card);
      if (!imageNode || !imageNode.dataset.src) {
        return;
      }
      if (imageNode.dataset.loadingState === "loading" || imageNode.dataset.loadingState === "loaded") {
        return;
      }
      imageNode.dataset.loadingState = "loading";
      imageNode.src = imageNode.dataset.src;
      if (imageNode.complete && imageNode.naturalWidth > 0) {
        imageNode.dispatchEvent(new windowObject.Event("load"));
      }
    }

    register(card) {
      if (!card) {
        return;
      }
      const imageNode = getCardImageNode(card);
      if (!imageNode || !imageNode.dataset.src) {
        return;
      }
      if (imageNode.dataset.loadingState === "loaded" || imageNode.dataset.loadingState === "loading") {
        return;
      }
      if (this.shouldLoadImmediately(card)) {
        card.dataset.lazyImage = "false";
        imageNode.fetchPriority = "high";
        imageNode.style.minHeight = "0px";
        this.startLoad(card);
        return;
      }
      card.dataset.lazyImage = "true";
      imageNode.fetchPriority = "low";
      const observer = this.ensureObserver();
      if (!observer) {
        this.startLoad(card);
        return;
      }
      this.observedCards.add(card);
      observer.observe(card);
    }
  }

  class GalleryRevealController {
    constructor({
      scrollRoot,
      activeScreens = 0.35,
      activeExtraPx = 64,
      maxOffsetPx = 12,
      minScale = 0.995,
      edgeFadeFraction = 0.16,
      minEdgeFadePx = 72,
      maxEdgeFadePx = 140,
    }) {
      this.scrollRoot = scrollRoot;
      this.activeScreens = activeScreens;
      this.activeExtraPx = activeExtraPx;
      this.maxOffsetPx = maxOffsetPx;
      this.minScale = minScale;
      this.edgeFadeFraction = edgeFadeFraction;
      this.minEdgeFadePx = minEdgeFadePx;
      this.maxEdgeFadePx = maxEdgeFadePx;
      this.observedCards = new Set();
      this.cardMetrics = new Map();
      this.frameId = 0;
      this.layoutFrameId = 0;

      this.handleRootScroll = this.handleRootScroll.bind(this);

      this.scrollRoot.getNode()?.addEventListener("scroll", this.handleRootScroll, { passive: true });
    }

    destroy() {
      this.reset();
      this.scrollRoot.getNode()?.removeEventListener("scroll", this.handleRootScroll);
    }

    reset() {
      if (this.frameId) {
        windowObject.cancelAnimationFrame(this.frameId);
        this.frameId = 0;
      }
      if (this.layoutFrameId) {
        windowObject.cancelAnimationFrame(this.layoutFrameId);
        this.layoutFrameId = 0;
      }
      this.observedCards.clear();
      this.cardMetrics.clear();
    }

    refresh() {
      if (!this.observedCards.size) {
        if (this.frameId) {
          windowObject.cancelAnimationFrame(this.frameId);
          this.frameId = 0;
        }
        return;
      }
      this.refreshMetrics();
      this.scheduleUpdate();
    }

    measureCard(card, rootBounds = this.scrollRoot.getBounds(), scrollTop = this.scrollRoot.getScrollTop()) {
      const cardBounds = getCardBounds(card);
      if (!rootBounds || !cardBounds) {
        return null;
      }
      const metric = {
        top: scrollTop + (cardBounds.top - rootBounds.top),
        height: cardBounds.height,
      };
      this.cardMetrics.set(card, metric);
      return metric;
    }

    refreshMetrics(cards = this.observedCards) {
      const rootBounds = this.scrollRoot.getBounds();
      const scrollTop = this.scrollRoot.getScrollTop();
      Array.from(cards).forEach((card) => {
        if (!card?.isConnected) {
          this.cardMetrics.delete(card);
          return;
        }
        this.measureCard(card, rootBounds, scrollTop);
      });
    }

    scheduleLayoutRefresh() {
      if (this.layoutFrameId) {
        return;
      }
      this.layoutFrameId = windowObject.requestAnimationFrame(() => {
        this.layoutFrameId = 0;
        this.refreshMetrics();
        this.scheduleUpdate();
      });
    }

    handleRootScroll() {
      this.scheduleUpdate();
    }

    getDirectionFromMetric(metric, viewportHeight) {
      if (!metric) {
        return "down";
      }
      return metric.top >= viewportHeight ? "down" : "up";
    }

    register(card) {
      if (!card) {
        return;
      }
      this.observedCards.add(card);
      const metric = this.measureCard(card);
      setHiddenCardState(card, this.getDirectionFromMetric(metric, this.scrollRoot.getHeight()), this);
      this.scheduleUpdate();
    }

    scheduleUpdate() {
      if (this.frameId) {
        return;
      }
      this.frameId = windowObject.requestAnimationFrame(() => {
        this.frameId = 0;
        this.update();
      });
    }

    update() {
      const viewportHeight = this.scrollRoot.getHeight();
      const scrollTop = this.scrollRoot.getScrollTop();
      if (!viewportHeight) {
        return;
      }
      const activeMargin = Math.max((viewportHeight * this.activeScreens) + this.activeExtraPx, 0);
      const edgeFadePx = clamp(
        viewportHeight * this.edgeFadeFraction,
        this.minEdgeFadePx,
        this.maxEdgeFadePx
      );
      const cardsToDrop = [];

      this.observedCards.forEach((card) => {
        if (!card?.isConnected) {
          cardsToDrop.push(card);
          return;
        }
        const metric = this.cardMetrics.get(card);
        if (!metric) {
          return;
        }
        const cardTop = metric.top - scrollTop;
        const cardBottom = cardTop + metric.height;
        if (cardBottom < -activeMargin || cardTop > viewportHeight + activeMargin) {
          setHiddenCardState(card, this.getDirectionFromMetric({ top: cardTop }, viewportHeight), this);
          return;
        }
        const visibleTop = Math.max(cardTop, 0);
        const visibleBottom = Math.min(cardBottom, viewportHeight);
        const visibleHeight = Math.max(visibleBottom - visibleTop, 0);
        const visibleRatio = clamp(visibleHeight / Math.max(Math.min(metric.height, viewportHeight), 1), 0, 1);

        const topFade = clamp((cardTop + edgeFadePx) / edgeFadePx, 0, 1);
        const bottomFade = clamp((viewportHeight + edgeFadePx - cardBottom) / edgeFadePx, 0, 1);
        const edgeVisibility = Math.min(topFade, bottomFade);
        const visibility = clamp(Math.max(visibleRatio, edgeVisibility), 0, 1);

        let direction = 0;
        if (cardTop < 0) {
          direction = -1;
        } else if (cardBottom > viewportHeight) {
          direction = 1;
        }

        const offsetY = (1 - visibility) * this.maxOffsetPx * direction;
        const scale = this.minScale + (visibility * (1 - this.minScale));

        setCardRevealStyle(card, {
          opacity: Number(visibility.toFixed(3)),
          offsetY: Number(offsetY.toFixed(2)),
          scale: Number(scale.toFixed(3)),
        });
      });

      cardsToDrop.forEach((card) => {
        this.observedCards.delete(card);
        this.cardMetrics.delete(card);
      });
    }
  }

  windowObject.GalleryRuntime = {
    GalleryScrollRoot,
    GalleryImageLoader,
    GalleryRevealController,
  };
})(window);
