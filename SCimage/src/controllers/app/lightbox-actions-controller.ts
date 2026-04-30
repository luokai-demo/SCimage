// @ts-nocheck

export function createLightboxActionsController({
  elements,
  copyToClipboard,
  findJobImage,
  lightboxController,
  normalizeImageUrl,
  setStatus,
  switchTab,
  triggerImageDownload,
}) {
  function copyPrompt() {
    const item = lightboxController.getCurrentItem();
    if (!item) {
      return;
    }
    copyToClipboard(item.prompt, elements.lightboxCopy, "已复制", "复制提示词");
  }

  async function downloadLightboxImage() {
    const item = lightboxController.getCurrentItem();
    if (!item) {
      return;
    }
    const previousDisabled = elements.lightboxDl?.disabled || false;
    if (elements.lightboxDl) {
      elements.lightboxDl.disabled = true;
    }
    try {
      await triggerImageDownload(item.src, item.filename);
    } catch (error) {
      console.error("Download lightbox image failed:", error);
      setStatus("error", error.message || "下载图片失败。", { timeoutMs: 2400 });
    } finally {
      if (elements.lightboxDl) {
        elements.lightboxDl.disabled = previousDisabled;
      }
    }
  }

  async function addGalleryImageToSource(jobId, slot) {
    const image = findJobImage(jobId, slot);
    if (!image?.url) {
      setStatus("error", "要加入参考图的图片不存在。", { timeoutMs: 2200 });
      return;
    }
    if (!window.WorkspacePanel?.addSourceImageFromUrl) {
      setStatus("error", "当前工作区暂不支持加入参考图。", { timeoutMs: 2200 });
      return;
    }

    const imageUrl = normalizeImageUrl(image.url);
    const filename = image.name || `image-${image.slot || 1}.png`;
    try {
      const addedCount = await window.WorkspacePanel.addSourceImageFromUrl({
        url: imageUrl,
        filename,
        sourceKey: `gallery:${imageUrl}`,
      });
      switchTab("image-to-image");
      setStatus(
        "success",
        addedCount > 0 ? "已加入图生图参考图。" : "这张图片已经在图生图参考图中。",
        { timeoutMs: 2200 }
      );
    } catch (error) {
      console.error("Add source reference failed:", error);
      setStatus("error", error.message);
    }
  }

  async function addLightboxImageToSource() {
    const item = lightboxController.getCurrentItem();
    if (!item) {
      return;
    }
    if (elements.lightboxAddSource) {
      elements.lightboxAddSource.disabled = true;
    }
    try {
      await addGalleryImageToSource(item.jobId, item.slot);
    } finally {
      if (elements.lightboxAddSource) {
        elements.lightboxAddSource.disabled = false;
      }
    }
  }

  return {
    addGalleryImageToSource,
    addLightboxImageToSource,
    copyPrompt,
    downloadLightboxImage,
  };
}
