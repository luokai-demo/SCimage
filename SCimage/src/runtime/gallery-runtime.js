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
      const cards = Array.from(this.observedCards).filter((card) => card?.isConnected);
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

    unregister(card) {
      if (!card) {
        return;
      }
      this.observedCards.delete(card);
      this.observer?.unobserve(card);
    }
  }

  class GalleryImageWarmCache {
    constructor({ concurrency = 4, maxEntries = 180 } = {}) {
      this.concurrency = concurrency;
      this.maxEntries = maxEntries;
      this.cache = new Map();
      this.queue = [];
      this.activeCount = 0;
      this.scheduleId = 0;
    }

    isReady(url) {
      return this.cache.get(url)?.state === "loaded";
    }

    markLoaded(url, imageNode = null) {
      if (!url) {
        return;
      }
      this.cache.set(url, {
        state: "loaded",
        image: imageNode || this.cache.get(url)?.image || null,
        touchedAt: Date.now(),
      });
      this.prune();
    }

    warm(urls, options = {}) {
      const priority = options.priority || "normal";
      const normalizedUrls = Array.isArray(urls) ? urls : [urls];
      normalizedUrls.forEach((url) => {
        if (!url || this.cache.get(url)?.state === "loaded" || this.cache.get(url)?.state === "loading") {
          return;
        }
        if (this.queue.includes(url)) {
          if (priority === "high") {
            this.queue = [url, ...this.queue.filter((queuedUrl) => queuedUrl !== url)];
          }
          return;
        }
        if (priority === "high") {
          this.queue.unshift(url);
        } else {
          this.queue.push(url);
        }
        this.cache.set(url, { state: "queued", image: null, touchedAt: Date.now() });
      });
      if (options.immediate) {
        this.pump();
        return;
      }
      this.schedulePump();
    }

    schedulePump() {
      if (this.scheduleId) {
        return;
      }
      const run = () => {
        this.scheduleId = 0;
        this.pump();
      };
      if (typeof windowObject.requestIdleCallback === "function") {
        this.scheduleId = windowObject.requestIdleCallback(run, { timeout: 240 });
        return;
      }
      this.scheduleId = windowObject.setTimeout(run, 16);
    }

    pump() {
      while (this.activeCount < this.concurrency && this.queue.length) {
        this.startLoad(this.queue.shift());
      }
      if (this.queue.length && this.activeCount < this.concurrency) {
        this.schedulePump();
      }
    }

    startLoad(url) {
      if (!url) {
        return;
      }
      this.activeCount += 1;
      const image = new windowObject.Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      this.cache.set(url, { state: "loading", image, touchedAt: Date.now() });

      const finish = (state) => {
        const entry = this.cache.get(url);
        if (entry) {
          entry.state = state;
          entry.touchedAt = Date.now();
          if (state !== "loaded") {
            entry.image = null;
          }
        }
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.prune();
        this.schedulePump();
      };

      image.onload = () => {
        if (typeof image.decode === "function") {
          image.decode().then(() => finish("loaded")).catch(() => finish("loaded"));
          return;
        }
        finish("loaded");
      };
      image.onerror = () => finish("error");
      image.src = url;
      if (image.complete && image.naturalWidth > 0) {
        image.onload();
      }
    }

    prune() {
      if (this.cache.size <= this.maxEntries) {
        return;
      }
      const entries = Array.from(this.cache.entries())
        .filter(([, value]) => value.state !== "loading")
        .sort((left, right) => left[1].touchedAt - right[1].touchedAt);
      while (this.cache.size > this.maxEntries && entries.length) {
        const [url] = entries.shift();
        this.cache.delete(url);
      }
    }
  }

  class GalleryMasonryLayout {
    constructor({
      targetColumnWidth = 190,
      minColumns = 1,
      maxColumns = 5,
      rowHeightPx = 8,
      gapPx = 10,
    }) {
      this.targetColumnWidth = targetColumnWidth;
      this.minColumns = minColumns;
      this.maxColumns = maxColumns;
      this.rowHeightPx = rowHeightPx;
      this.gapPx = gapPx;
      this.frameId = 0;
    }

    destroy() {
      if (this.frameId) {
        windowObject.cancelAnimationFrame(this.frameId);
        this.frameId = 0;
      }
    }

    scheduleRefresh(rootNode = document) {
      if (this.frameId) {
        windowObject.cancelAnimationFrame(this.frameId);
      }
      this.frameId = windowObject.requestAnimationFrame(() => {
        this.frameId = 0;
        this.refresh(rootNode);
      });
    }

    refresh(rootNode = document) {
      const root = rootNode || document;
      const grids = Array.from(root.querySelectorAll(".gallery-grid, .gallery-task-section-grid"));
      grids.forEach((grid) => this.layoutGrid(grid));
    }

    layoutGrid(grid) {
      if (!grid) {
        return;
      }
      const isGroupedRoot = grid.classList.contains("gallery-grid") && grid.classList.contains("grouped-by-task");
      if (isGroupedRoot || grid.classList.contains("is-virtualized")) {
        return;
      }

      const items = Array.from(grid.children).filter((node) => node.classList.contains("gallery-item"));
      if (!items.length) {
        return;
      }

      const width = grid.clientWidth;
      if (!width) {
        return;
      }

      const columns = clamp(
        Math.floor((width + this.gapPx) / (this.targetColumnWidth + this.gapPx)),
        this.minColumns,
        this.maxColumns
      );

      const columnsVarName = grid.classList.contains("gallery-task-section-grid")
        ? "--gallery-task-columns"
        : "--gallery-columns";

      if (grid.style.getPropertyValue(columnsVarName) !== `${columns}`) {
        grid.style.setProperty(columnsVarName, `${columns}`);
      }
      if (grid.style.getPropertyValue("--gallery-grid-row-height") !== `${this.rowHeightPx}px`) {
        grid.style.setProperty("--gallery-grid-row-height", `${this.rowHeightPx}px`);
      }
      if (grid.style.getPropertyValue("--gallery-grid-gap") !== `${this.gapPx}px`) {
        grid.style.setProperty("--gallery-grid-gap", `${this.gapPx}px`);
      }

      items.forEach((item) => {
        const height = item.getBoundingClientRect().height;
        const span = Math.max(1, Math.ceil((height + this.gapPx) / (this.rowHeightPx + this.gapPx)));
        const nextRowEnd = `span ${span}`;
        if (item.style.gridRowEnd !== nextRowEnd) {
          item.style.gridRowEnd = nextRowEnd;
        }
      });
    }
  }

  class GalleryVirtualMasonry {
    constructor({
      scrollRoot,
      container,
      targetColumnWidth = 190,
      minColumns = 1,
      maxColumns = 5,
      gapPx = 10,
      overscanScreens = 1.25,
      estimatedHeightPx = 320,
      maxCachedItems = 180,
      getKey,
      getItemHeight,
      getItemSpan,
      renderItem,
      updateItem,
      onMount,
      onUnmount,
    }) {
      this.scrollRoot = scrollRoot;
      this.container = container;
      this.targetColumnWidth = targetColumnWidth;
      this.minColumns = minColumns;
      this.maxColumns = maxColumns;
      this.gapPx = gapPx;
      this.overscanScreens = overscanScreens;
      this.estimatedHeightPx = estimatedHeightPx;
      this.maxCachedItems = maxCachedItems;
      this.getKey = getKey;
      this.getItemHeight = getItemHeight;
      this.getItemSpan = getItemSpan;
      this.renderItem = renderItem;
      this.updateItem = updateItem;
      this.onMount = onMount;
      this.onUnmount = onUnmount;
      this.items = [];
      this.records = [];
      this.nodeByKey = new Map();
      this.cacheOrder = [];
      this.mountedKeys = new Set();
      this.layoutFrameId = 0;
      this.totalHeight = 0;
      this.renderedRange = { start: 0, end: 0 };
      this.handleScroll = this.handleScroll.bind(this);

      this.scrollRoot.getNode()?.addEventListener("scroll", this.handleScroll, { passive: true });
    }

    destroy() {
      this.clear();
      this.scrollRoot.getNode()?.removeEventListener("scroll", this.handleScroll);
    }

    clear() {
      if (this.layoutFrameId) {
        windowObject.cancelAnimationFrame(this.layoutFrameId);
        this.layoutFrameId = 0;
      }
      this.mountedKeys.forEach((key) => {
        const node = this.nodeByKey.get(key);
        if (node) {
          this.onUnmount?.(node);
        }
      });
      this.items = [];
      this.records = [];
      this.nodeByKey.clear();
      this.cacheOrder = [];
      this.mountedKeys.clear();
      this.totalHeight = 0;
      this.renderedRange = { start: 0, end: 0 };
      if (this.container) {
        this.container.classList.remove("is-virtualized");
        this.container.style.removeProperty("height");
        this.container.style.removeProperty("--gallery-virtual-height");
        this.container.replaceChildren();
      }
    }

    unmountAll() {
      this.mountedKeys.forEach((key) => {
        const node = this.nodeByKey.get(key);
        if (node?.parentElement === this.container) {
          this.onUnmount?.(node);
          node.remove();
        }
      });
      this.mountedKeys.clear();
    }

    setItems(items) {
      this.items = Array.isArray(items) ? items : [];
      if (!this.container) {
        return;
      }
      if (!this.container.classList.contains("is-virtualized")) {
        this.container.querySelectorAll(".gallery-item").forEach((node) => this.onUnmount?.(node));
        this.container.replaceChildren();
        this.mountedKeys.clear();
      }
      this.container.classList.add("is-virtualized");
      this.refreshLayout();
    }

    scheduleRefresh() {
      if (this.layoutFrameId) {
        return;
      }
      this.layoutFrameId = windowObject.requestAnimationFrame(() => {
        this.layoutFrameId = 0;
        this.refreshLayout();
      });
    }

    refreshLayout() {
      this.buildLayout();
      this.renderWindow();
    }

    handleScroll() {
      const visibleRange = this.getVisibleRange();
      const viewportHeight = this.scrollRoot.getHeight();
      const guard = viewportHeight * 0.5;
      const windowMissedVisibleRange = visibleRange.start < this.renderedRange.start + guard
        || visibleRange.end > this.renderedRange.end - guard;
      if (!windowMissedVisibleRange) {
        return;
      }
      this.renderWindow();
    }

    buildLayout() {
      const width = this.container?.clientWidth || 0;
      if (!width || !this.items.length) {
        this.records = [];
        this.totalHeight = 0;
        if (this.container) {
          this.container.style.setProperty("--gallery-virtual-height", "0px");
          this.container.style.height = "0px";
        }
        return;
      }

      const columns = clamp(
        Math.floor((width + this.gapPx) / (this.targetColumnWidth + this.gapPx)),
        this.minColumns,
        this.maxColumns
      );
      const columnWidth = (width - (this.gapPx * (columns - 1))) / columns;
      const columnHeights = Array.from({ length: columns }, () => 0);

      this.records = this.items.map((item, index) => {
        const key = this.getKey?.(item, index) || String(index);
        let span = this.getColumnSpan(item, index, columns);
        let itemWidth = this.getSpannedWidth(columnWidth, span);
        let height = Math.max(
          1,
          Math.round(this.getItemHeight?.(item, itemWidth, index, { columns, span }) || this.estimatedHeightPx)
        );
        let placement = this.findColumnPlacement(columnHeights, span);
        if (this.shouldCollapseSpan(placement, height, columnWidth)) {
          span = 1;
          itemWidth = this.getSpannedWidth(columnWidth, span);
          height = Math.max(
            1,
            Math.round(this.getItemHeight?.(item, itemWidth, index, { columns, span, collapsedSpan: true }) || this.estimatedHeightPx)
          );
          placement = this.findColumnPlacement(columnHeights, span);
        }
        const x = placement.columnIndex * (columnWidth + this.gapPx);
        const y = placement.y;
        for (let offset = 0; offset < span; offset += 1) {
          columnHeights[placement.columnIndex + offset] = y + height + this.gapPx;
        }
        return { item, index, key, x, y, width: itemWidth, height, span };
      });

      this.totalHeight = Math.max(0, Math.max(...columnHeights) - this.gapPx);
      this.container.style.setProperty("--gallery-virtual-height", `${Math.ceil(this.totalHeight)}px`);
      this.container.style.height = `${Math.ceil(this.totalHeight)}px`;
    }

    getSpannedWidth(columnWidth, span) {
      return (columnWidth * span) + (this.gapPx * (span - 1));
    }

    getColumnSpan(item, index, columns) {
      const rawSpan = Number(this.getItemSpan?.(item, index, columns) || 1);
      if (!Number.isFinite(rawSpan)) {
        return 1;
      }
      return clamp(Math.round(rawSpan), 1, columns);
    }

    shouldCollapseSpan(placement, height, columnWidth) {
      if (!placement || placement.span <= 1) {
        return false;
      }
      const tolerance = Math.max(this.gapPx * 2.5, Math.min(columnWidth * 0.18, height * 0.16));
      return placement.imbalance > tolerance || placement.waste > tolerance * placement.span;
    }

    findColumnPlacement(columnHeights, span) {
      let columnIndex = 0;
      let y = Number.POSITIVE_INFINITY;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestWaste = 0;
      let bestImbalance = 0;
      const lastStartIndex = Math.max(0, columnHeights.length - span);
      for (let startIndex = 0; startIndex <= lastStartIndex; startIndex += 1) {
        const heights = columnHeights.slice(startIndex, startIndex + span);
        const candidateY = Math.max(...heights);
        const lowestY = Math.min(...heights);
        const waste = heights.reduce((total, value) => total + (candidateY - value), 0);
        const imbalance = candidateY - lowestY;
        const score = span > 1 ? candidateY + (waste * 0.9) + (imbalance * 0.45) : candidateY;
        if (score < bestScore || (score === bestScore && candidateY < y)) {
          columnIndex = startIndex;
          y = candidateY;
          bestScore = score;
          bestWaste = waste;
          bestImbalance = imbalance;
        }
      }
      return {
        columnIndex,
        y: Number.isFinite(y) ? y : 0,
        span,
        waste: bestWaste,
        imbalance: bestImbalance,
      };
    }

    getContainerScrollTop() {
      const containerOffset = this.container?.offsetTop || 0;
      return this.scrollRoot.getScrollTop() - containerOffset;
    }

    getVisibleRange() {
      const viewportHeight = this.scrollRoot.getHeight();
      return {
        start: Math.max(0, this.getContainerScrollTop()),
        end: this.getContainerScrollTop() + viewportHeight,
      };
    }

    getWindowRange() {
      const viewportHeight = this.scrollRoot.getHeight();
      const overscan = viewportHeight * this.overscanScreens;
      const scrollTop = this.getContainerScrollTop();
      return {
        start: Math.max(0, scrollTop - overscan),
        end: scrollTop + viewportHeight + overscan,
      };
    }

    touchCacheKey(key) {
      const previousIndex = this.cacheOrder.indexOf(key);
      if (previousIndex >= 0) {
        this.cacheOrder.splice(previousIndex, 1);
      }
      this.cacheOrder.push(key);
    }

    pruneCache() {
      let guard = this.cacheOrder.length;
      while (this.cacheOrder.length > this.maxCachedItems && guard > 0) {
        guard -= 1;
        const key = this.cacheOrder.shift();
        if (!key || this.mountedKeys.has(key)) {
          if (key) {
            this.cacheOrder.push(key);
          }
          continue;
        }
        const node = this.nodeByKey.get(key);
        if (node?.isConnected) {
          node.remove();
        }
        this.nodeByKey.delete(key);
      }
    }

    getOrCreateNode(record) {
      let node = this.nodeByKey.get(record.key);
      if (!node) {
        node = this.renderItem?.(record.item, record.index);
        if (!node) {
          return null;
        }
        this.nodeByKey.set(record.key, node);
      }
      this.touchCacheKey(record.key);
      return node;
    }

    positionNode(node, record) {
      node.style.position = "absolute";
      node.style.left = `${record.x}px`;
      node.style.top = `${record.y}px`;
      node.style.width = `${record.width}px`;
      node.style.height = `${record.height}px`;
      node.dataset.columnSpan = String(record.span || 1);
    }

    renderWindow() {
      if (!this.container || !this.records.length) {
        this.unmountAll();
        return;
      }
      const { start, end } = this.getWindowRange();
      this.renderedRange = { start, end };
      const nextMountedKeys = new Set();

      this.records.forEach((record) => {
        if (record.y + record.height < start || record.y > end) {
          return;
        }
        const node = this.getOrCreateNode(record);
        if (!node) {
          return;
        }
        this.updateItem?.(node, record.item, record.index);
        this.positionNode(node, record);
        nextMountedKeys.add(record.key);
        if (node.parentElement !== this.container) {
          this.container.appendChild(node);
          this.onMount?.(node, record);
        }
      });

      this.mountedKeys.forEach((key) => {
        if (nextMountedKeys.has(key)) {
          return;
        }
        const node = this.nodeByKey.get(key);
        if (node?.parentElement === this.container) {
          this.onUnmount?.(node);
          node.remove();
        }
      });

      this.mountedKeys = nextMountedKeys;
      this.pruneCache();
    }
  }

  windowObject.GalleryRuntime = {
    GalleryScrollRoot,
    GalleryImageLoader,
    GalleryImageWarmCache,
    GalleryMasonryLayout,
    GalleryVirtualMasonry,
  };
})(window);
