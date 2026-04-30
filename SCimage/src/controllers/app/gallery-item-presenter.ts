// @ts-nocheck

export function createGalleryItemPresenter({
  createElement,
  normalizeImageUrl,
  getGalleryPreviewUrl,
  getImageDimensions,
  getImagePlaceholder,
  createGalleryFlatItem,
  buildGalleryTerminalAction,
  getSelectionState,
  isActionDisabled = () => false,
  imageWarmCache,
  previewWarmCache,
  scheduleActiveGalleryLayout,
  rememberImageMetrics,
}) {
  function createActionButton(label, action, jobId, extraClassName = "") {
    const button = createElement("button", extraClassName, label);
    button.type = "button";
    button.dataset.action = action;
    button.dataset.jobId = jobId;
    button.disabled = isActionDisabled(jobId);
    return button;
  }

  function createGalleryTimeNode(value) {
    const formatted = value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";
    const timeNode = createElement("span", "time");
    timeNode.setAttribute("aria-label", `生成时间 ${formatted}`);
    const [datePart, clockPart] = formatted.split(/\s+/, 2);
    if (!datePart || !clockPart) {
      timeNode.textContent = formatted;
      return timeNode;
    }
    timeNode.append(
      createElement("span", "time-date", datePart),
      createElement("span", "time-clock", clockPart)
    );
    return timeNode;
  }

  function applyImageDimensions(imageNode, image) {
    const dimensions = getImageDimensions(image);
    if (!imageNode || !dimensions) {
      return false;
    }
    imageNode.width = dimensions.width;
    imageNode.height = dimensions.height;
    return true;
  }

  function applyCardProfile(card, profile) {
    if (!card || !profile) {
      return;
    }
    card.classList.remove("is-featured", "is-tall", "is-compact", "is-lifted", "is-balanced");
    card.classList.remove("shape-panorama", "shape-landscape", "shape-square", "shape-portrait", "shape-tallPortrait");
    card.classList.add("has-masonry-profile", `is-${profile.variant}`);
    card.classList.add(`shape-${profile.shape}`);
    card.style.setProperty("--gallery-card-aspect-ratio", profile.aspectRatio);
  }

  function applyPlaceholder(card, image) {
    if (!card) {
      return;
    }
    const placeholder = getImagePlaceholder(image);
    if (!placeholder) {
      card.style.removeProperty("--gallery-placeholder-color");
      card.style.removeProperty("--gallery-placeholder-accent");
      return;
    }
    card.style.setProperty("--gallery-placeholder-color", placeholder.color);
    card.style.setProperty("--gallery-placeholder-accent", placeholder.accentColor);
  }

  function setPreviewImageSource(previewNode, previewUrl) {
    previewNode.classList.remove("is-error");
    previewNode.src = previewUrl;
    previewNode.addEventListener("load", () => previewWarmCache.markLoaded(previewUrl, previewNode), { once: true });
    previewNode.addEventListener("error", () => previewNode.classList.add("is-error"), { once: true });
    previewNode.dataset.previewSrc = previewUrl;
    previewNode.fetchPriority = previewWarmCache.isReady(previewUrl) ? "auto" : "high";
  }

  function createPreviewImage(previewUrl, job) {
    const previewNode = new Image();
    previewNode.className = "gallery-preview";
    previewNode.decoding = "async";
    previewNode.loading = "eager";
    previewNode.alt = "";
    previewNode.setAttribute("aria-hidden", "true");
    setPreviewImageSource(previewNode, previewUrl);
    if (job?.prompt) {
      previewNode.title = job.prompt;
    }
    return previewNode;
  }

  function syncPreviewImage(card, entry) {
    const previewUrl = entry.previewUrl || "";
    let previewNode = card.querySelector(".gallery-preview");
    card.classList.toggle("has-preview", Boolean(previewUrl));
    if (!previewUrl) {
      previewNode?.remove();
      return;
    }
    if (!previewNode) {
      previewNode = createPreviewImage(previewUrl, entry.job);
      const fullImageNode = card.querySelector("img[data-src]");
      card.insertBefore(previewNode, fullImageNode || card.firstChild);
      return;
    }
    if (previewNode.dataset.previewSrc !== previewUrl) {
      setPreviewImageSource(previewNode, previewUrl);
    }
  }

  function handleImageLoaded(card, imageNode) {
    rememberImageMetrics(card, imageNode);
    imageWarmCache.markLoaded(imageNode.dataset.src || imageNode.currentSrc || imageNode.src, imageNode);
    card.classList.remove("is-loading", "is-error");
    card.classList.add("is-loaded");
    imageNode.style.removeProperty("min-height");
    imageNode.dataset.loadingState = "loaded";
    imageNode.classList.add("is-loaded");
    scheduleActiveGalleryLayout();
  }

  function handleImageError(card, imageNode) {
    card.classList.remove("is-loading");
    card.classList.add("is-error");
    imageNode.style.removeProperty("min-height");
    imageNode.dataset.loadingState = "error";
    scheduleActiveGalleryLayout();
  }

  function syncCard(card, entry, openIndex) {
    card.dataset.galleryImageKey = entry.key;
    card.dataset.openLightbox = String(openIndex);
    card.dataset.jobId = entry.job.id || "";
    card.dataset.imageSlot = String(entry.image.slot || 0);
    card.classList.toggle("is-selected", getSelectionState(entry.job.id, entry.image.slot));
    card.setAttribute("aria-label", entry.job.prompt || "生成图片");
    applyCardProfile(card, entry.layoutProfile);
    applyPlaceholder(card, entry.image);
    syncPreviewImage(card, entry);

    const imageNode = card.querySelector("img[data-src]");
    if (imageNode) {
      imageNode.alt = entry.job.prompt || "";
      const hasDimensions = applyImageDimensions(imageNode, entry.image);
      if (hasDimensions) {
        imageNode.style.removeProperty("min-height");
      }
      if (imageNode.dataset.loadingState === "idle" && imageWarmCache.isReady(entry.imageUrl)) {
        imageNode.dataset.loadingState = "loaded";
        imageNode.src = entry.imageUrl;
        imageNode.classList.add("is-loaded");
        card.classList.remove("is-loading", "is-error");
        card.classList.add("is-loaded");
      }
    }
    const promptPreview = card.querySelector(".prompt-preview");
    if (promptPreview) {
      promptPreview.textContent = entry.job.prompt || "";
    }
    const addSourceButton = card.querySelector("[data-action='add-source-reference']");
    if (addSourceButton) {
      addSourceButton.dataset.jobId = entry.job.id || "";
      addSourceButton.dataset.slot = String(entry.image.slot || 0);
    }
    const copyButton = card.querySelector("[data-action='copy-job-prompt']");
    if (copyButton) {
      copyButton.dataset.jobId = entry.job.id || "";
    }
    const downloadButton = card.querySelector("[data-action='download-image']");
    if (downloadButton) {
      downloadButton.dataset.jobId = entry.job.id || "";
      downloadButton.dataset.slot = String(entry.image.slot || 0);
    }
    const selectButton = card.querySelector("[data-action='toggle-image-selection']");
    if (selectButton) {
      const selected = getSelectionState(entry.job.id, entry.image.slot);
      selectButton.dataset.jobId = entry.job.id || "";
      selectButton.dataset.slot = String(entry.image.slot || 0);
      selectButton.textContent = "";
      selectButton.setAttribute("aria-label", selected ? "取消选择图片" : "选择图片");
    }
  }

  function resetLayoutStyle(card) {
    card.style.removeProperty("position");
    card.style.removeProperty("left");
    card.style.removeProperty("top");
    card.style.removeProperty("width");
    card.style.removeProperty("height");
  }

  function buildCard(job, image, options = {}) {
    const imageUrl = options.imageUrl || normalizeImageUrl(image.url);
    if (!imageUrl) {
      return null;
    }

    const imageReady = imageWarmCache.isReady(imageUrl);
    const openIndex = Number.isInteger(options.openIndex)
      ? options.openIndex
      : options.registerFlatItem(createGalleryFlatItem(job, image, imageUrl, getGalleryPreviewUrl(image)));
    const imageKey = options.key || `${job.id || ""}:${image.slot || 0}:${imageUrl}`;
    const previewUrl = getGalleryPreviewUrl(image);

    const card = createElement("div", "gallery-item");
    card.classList.add("is-loading");
    card.classList.toggle("has-preview", Boolean(previewUrl));
    card.dataset.galleryImageKey = imageKey;
    card.dataset.openLightbox = String(openIndex);
    card.dataset.jobId = job.id || "";
    card.dataset.imageSlot = String(image.slot || 0);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", job.prompt || "生成图片");
    applyCardProfile(card, options.layoutProfile);
    applyPlaceholder(card, image);

    const imageNode = new Image();
    imageNode.decoding = "async";
    imageNode.loading = "eager";
    imageNode.fetchPriority = "auto";
    imageNode.dataset.src = imageUrl;
    imageNode.dataset.loadingState = imageReady ? "loaded" : "idle";
    imageNode.alt = job.prompt || "";
    const hasDimensions = applyImageDimensions(imageNode, image);
    if (imageReady) {
      imageNode.src = imageUrl;
      imageNode.classList.add("is-loaded");
      card.classList.remove("is-loading");
      card.classList.add("is-loaded");
    } else if (!hasDimensions) {
      imageNode.style.minHeight = "140px";
    }
    imageNode.addEventListener("load", () => handleImageLoaded(card, imageNode), { once: true });
    imageNode.addEventListener("error", () => handleImageError(card, imageNode), { once: true });
    card.dataset.lazyImage = "true";

    const previewNode = previewUrl ? createPreviewImage(previewUrl, job) : null;
    const selectButton = createActionButton("", "toggle-image-selection", job.id, "gallery-select-btn");
    selectButton.dataset.slot = String(image.slot || 0);
    selectButton.setAttribute("aria-label", "选择图片");

    const overlay = createElement("div", "gallery-overlay");
    const promptPreview = createElement("div", "prompt-preview", job.prompt);

    const metaRow = createElement("div", "meta-row");
    const timeNode = createGalleryTimeNode(job.updated_at || job.created_at);
    const actions = createElement("span", "meta-actions");

    const copyButton = createActionButton("复制", "copy-job-prompt", job.id);
    copyButton.setAttribute("aria-label", "复制提示词");
    copyButton.setAttribute("title", "复制提示词");
    actions.appendChild(copyButton);

    const addSourceButton = createActionButton("参考", "add-source-reference", job.id);
    addSourceButton.dataset.slot = String(image.slot || 0);
    addSourceButton.setAttribute("aria-label", "加入图生图参考图");
    addSourceButton.setAttribute("title", "加入图生图参考图");
    actions.appendChild(addSourceButton);

    const downloadButton = createActionButton("下载", "download-image", job.id);
    downloadButton.dataset.slot = String(image.slot || 0);
    downloadButton.setAttribute("aria-label", "下载图片");
    downloadButton.setAttribute("title", "下载图片");
    actions.appendChild(downloadButton);
    actions.appendChild(buildGalleryTerminalAction(job, image.slot || 0));

    metaRow.append(timeNode, actions);
    overlay.append(promptPreview, metaRow);
    card.append(...[selectButton, previewNode, imageNode, overlay].filter(Boolean));
    return card;
  }

  return {
    applyImageDimensions,
    buildCard,
    createActionButton,
    createGalleryTimeNode,
    resetLayoutStyle,
    syncCard,
  };
}
