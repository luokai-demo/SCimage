// @ts-nocheck

export function createJobActionsController({
  elements,
  actionTimeoutMs,
  apiRequest,
  fetch,
  getGalleryFlatList,
  getJobById,
  getSelectedGalleryItems,
  isActiveStatus,
  isRetryableJob,
  lightboxController,
  gallerySelectionController,
  triggerImageDownload,
  truncateText,
  clearFailurePopupEntries,
  closeLightbox,
  refreshJobs,
  renderGallery,
  setStatus,
  showLightboxItem,
  syncFailurePopupActions,
}) {
  const actionJobIds = new Set();
  let cleanupGeneratedInFlight = null;

  function isActionDisabled(jobId) {
    return actionJobIds.has(jobId);
  }

  function setJobActionBusy(jobId, isBusy, options = {}) {
    if (isBusy) {
      actionJobIds.add(jobId);
    } else {
      actionJobIds.delete(jobId);
    }
    if (options.syncFailurePopup !== false) {
      syncFailurePopupActions();
    }
    renderGallery();
  }

  function findJobImage(jobId, slot) {
    const job = getJobById(jobId);
    if (!job) {
      return null;
    }
    const normalizedSlot = Number(slot || 0);
    return (job.images || []).find((image) => Number(image.slot || 0) === normalizedSlot) || null;
  }

  async function cleanupEmptyGeneratedDirs() {
    if (cleanupGeneratedInFlight) {
      return cleanupGeneratedInFlight;
    }

    elements.cleanupGeneratedBtn.disabled = true;
    cleanupGeneratedInFlight = (async () => {
      try {
        const payload = await apiRequest("/api/maintenance/generated/cleanup-empty-dirs", {
          method: "POST",
          timeoutMs: actionTimeoutMs,
        });
        const removedCount = Number(payload.removed_count || 0);
        setStatus(
          "success",
          removedCount ? `已清理 ${removedCount} 个空文件夹。` : "没有需要清理的空文件夹。",
          { timeoutMs: 2200 }
        );
      } catch (error) {
        console.error("Cleanup empty generated dirs failed:", error);
        setStatus("error", error.message);
      } finally {
        elements.cleanupGeneratedBtn.disabled = false;
        cleanupGeneratedInFlight = null;
      }
    })();

    return cleanupGeneratedInFlight;
  }

  async function downloadGalleryImage(jobId, slot, triggerButton = null) {
    const image = findJobImage(jobId, slot);
    if (!image?.url) {
      setStatus("error", "要下载的图片不存在。", { timeoutMs: 2200 });
      return;
    }

    const previousDisabled = Boolean(triggerButton?.disabled);
    if (triggerButton) {
      triggerButton.disabled = true;
    }
    try {
      await triggerImageDownload(image.url, image.name || `image-${image.slot || 1}.png`);
    } catch (error) {
      console.error("Download image failed:", error);
      setStatus("error", error.message || "下载图片失败。", { timeoutMs: 2400 });
    } finally {
      if (triggerButton) {
        triggerButton.disabled = previousDisabled;
      }
    }
  }

  async function deleteJob(jobId) {
    const job = getJobById(jobId);
    if (!job) {
      return;
    }

    const imageCount = Array.isArray(job.images) ? job.images.length : 0;
    const promptLabel = truncateText(job.prompt || "这个任务", 24);
    const message = imageCount > 1
      ? `确定删除「${promptLabel}」这个任务？会同时删除已生成的 ${imageCount} 张图片。`
      : `确定删除「${promptLabel}」这个任务吗？`;

    if (!window.confirm(message)) {
      return;
    }

    setJobActionBusy(jobId, true);
    try {
      await apiRequest(`/api/jobs/${jobId}`, { method: "DELETE", timeoutMs: actionTimeoutMs });
      clearFailurePopupEntries(jobId);
      const lightboxSelection = lightboxController.getSelection();
      if (lightboxSelection && lightboxSelection.jobId === jobId) {
        closeLightbox();
      }
      await refreshJobs({ silent: true, reset: true });
      setStatus("success", "任务已删除。", { timeoutMs: 2200 });
    } catch (error) {
      console.error("Delete job failed:", error);
      setStatus("error", error.message);
    } finally {
      setJobActionBusy(jobId, false);
    }
  }

  async function deleteImage(jobId, slot) {
    const job = getJobById(jobId);
    if (!job) {
      return;
    }

    const imageCount = Array.isArray(job.images) ? job.images.length : 0;
    const targetImage = (job.images || []).find((image) => Number(image.slot || 0) === Number(slot));
    if (!targetImage) {
      setStatus("error", "要删除的图片不存在。", { timeoutMs: 2200 });
      return;
    }

    const message = imageCount > 1
      ? `确定删除这张图片吗？本次任务的其余 ${imageCount - 1} 张图片会保留。`
      : "确定删除这张图片吗？任务记录会保留，但图库中将不再显示这次结果。";

    if (!window.confirm(message)) {
      return;
    }

    const previousLightboxIndex = lightboxController.getCurrentIndex();
    setJobActionBusy(jobId, true, { syncFailurePopup: false });
    try {
      const payload = await apiRequest(`/api/jobs/${jobId}/images/${slot}`, { method: "DELETE", timeoutMs: actionTimeoutMs });
      await refreshJobs({ silent: true, reset: true });

      if (elements.lightbox.classList.contains("open")) {
        const galleryFlatList = getGalleryFlatList();
        if (galleryFlatList.length > 0) {
          const nextIndex = Math.min(previousLightboxIndex, galleryFlatList.length - 1);
          showLightboxItem(nextIndex);
        } else {
          closeLightbox();
        }
      }

      setStatus(
        "success",
        payload.deleted_job ? "图片已删除，这个任务已自动移除。" : "图片已删除，其余图片和任务记录已保留。",
        { timeoutMs: 2200 }
      );
    } catch (error) {
      console.error("Delete image failed:", error);
      setStatus("error", error.message);
    } finally {
      setJobActionBusy(jobId, false, { syncFailurePopup: false });
    }
  }

  async function batchDownloadSelectedImages() {
    const items = getSelectedGalleryItems();
    if (!items.length) {
      return;
    }
    try {
      const response = await fetch("/api/gallery/batch/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "批量下载失败。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "SCimage-selected-images.zip";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus("success", `已打包下载 ${items.length} 张图片。`, { timeoutMs: 2200 });
    } catch (error) {
      console.error("Batch download failed:", error);
      setStatus("error", error.message);
    }
  }

  async function batchDeleteSelectedImages() {
    const items = getSelectedGalleryItems();
    if (!items.length) {
      return;
    }
    if (!window.confirm(`确定删除选中的 ${items.length} 张图片吗？`)) {
      return;
    }
    try {
      const payload = await apiRequest("/api/gallery/batch/delete", {
        method: "POST",
        body: { items },
        timeoutMs: actionTimeoutMs,
      });
      gallerySelectionController.clear();
      await refreshJobs({ silent: true, reset: true });
      setStatus("success", `已删除 ${payload.removed_count || 0} 张图片。`, { timeoutMs: 2200 });
    } catch (error) {
      console.error("Batch delete failed:", error);
      setStatus("error", error.message);
    }
  }

  async function cancelJob(jobId) {
    const job = getJobById(jobId);
    if (!job || !isActiveStatus(job.status)) {
      return;
    }

    setJobActionBusy(jobId, true, { syncFailurePopup: false });
    try {
      await apiRequest(`/api/jobs/${jobId}/cancel`, { method: "POST", timeoutMs: actionTimeoutMs });
      await refreshJobs({ silent: true });
      setStatus("success", "任务已送出中断请求。", { timeoutMs: 2200 });
    } catch (error) {
      console.error("Cancel job failed:", error);
      setStatus("error", error.message);
    } finally {
      setJobActionBusy(jobId, false, { syncFailurePopup: false });
    }
  }

  async function retryJob(jobId) {
    const job = getJobById(jobId);
    if (!isRetryableJob(job)) {
      return;
    }

    clearFailurePopupEntries(jobId);
    setJobActionBusy(jobId, true, { syncFailurePopup: false });
    try {
      await apiRequest(`/api/jobs/${jobId}/retry`, { method: "POST", timeoutMs: actionTimeoutMs });
      await refreshJobs({ silent: true });
      setStatus("success", "任务已重新加入队列。", { timeoutMs: 2200 });
    } catch (error) {
      console.error("Retry job failed:", error);
      setStatus("error", error.message);
    } finally {
      setJobActionBusy(jobId, false, { syncFailurePopup: false });
    }
  }

  return {
    batchDeleteSelectedImages,
    batchDownloadSelectedImages,
    cancelJob,
    cleanupEmptyGeneratedDirs,
    deleteImage,
    deleteJob,
    downloadGalleryImage,
    findJobImage,
    isActionDisabled,
    retryJob,
  };
}
