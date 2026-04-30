// @ts-nocheck

export function createGalleryRenderController({
  elements,
  workflowState,
  getCurrentFilter,
  setCurrentFilter,
  getGalleryItemsState,
  getGalleryPaginationState,
  setGalleryItemsState,
  setGalleryPaginationState,
  getGallerySortAsc,
  setGallerySortAsc,
  getJobsState,
  getFilteredJobs,
  getGalleryDataController,
  getJobSyncController,
  getSyncState,
  getRunningJobsCount,
  getActiveProviderProfile,
  getLoadedGalleryCountText,
  getLoadedJobCountText,
  normalizeGalleryFilter,
  syncGalleryFilterButtons,
  collectReusableGalleryCards,
  reconcileTaskGallery,
  reconcilePromptGallery,
  reconcileFlatGallery,
  renderLeftTaskList,
  renderRunningBanner,
  scheduleGalleryLayout,
  syncLightboxSelection,
  formatClock,
  formatElapsed,
  truncateText,
  refreshJobs,
}) {
  function updateSyncIndicators() {
    const runningJobs = Number(getRunningJobsCount() || 0);
    const activeProfile = getActiveProviderProfile();
    elements.storageMode.textContent = activeProfile
      ? `当前配置：${activeProfile.name}`
      : "当前配置：未设置";

    const syncState = getSyncState();
    if (syncState.lastSyncError) {
      elements.storageUsage.textContent = `同步失败：${truncateText(syncState.lastSyncError, 30)}`;
    } else if (syncState.lastSyncAt) {
      const suffix = runningJobs ? ` · ${runningJobs} 个任务进行中` : "";
      elements.storageUsage.textContent = `最后同步：${formatClock(syncState.lastSyncAt)}${suffix}`;
    } else {
      elements.storageUsage.textContent = "同步：自动刷新";
    }

    if (runningJobs) {
      elements.fsDirStatus.style.display = "";
      elements.fsDirStatus.textContent = `${runningJobs} 个任务进行中`;
    } else {
      elements.fsDirStatus.style.display = "none";
      elements.fsDirStatus.textContent = "";
    }
  }

  function refreshRelativeTimes() {
    document.querySelectorAll("[data-elapsed-from]").forEach((node) => {
      if (node.dataset.elapsedLive === "false") {
        return;
      }
      node.textContent = `${node.dataset.elapsedPrefix || ""}${formatElapsed(node.dataset.elapsedFrom)}`;
    });
  }

  function renderGallery() {
    const jobs = getFilteredJobs();
    getJobSyncController().setSnapshotSignatures(getJobsState());
    renderLeftTaskList();
    renderRunningBanner();
    const reusableCards = collectReusableGalleryCards();
    const currentFilter = getCurrentFilter();
    const isGroupedGallery = currentFilter === "tasks" || currentFilter === "prompts";
    elements.galleryGrid.classList.toggle("grouped-by-task", isGroupedGallery);

    let renderedCards = 0;
    let promptGroupCount = 0;
    if (currentFilter === "tasks") {
      renderedCards = reconcileTaskGallery(jobs, reusableCards);
    } else if (currentFilter === "prompts") {
      const promptResult = reconcilePromptGallery(jobs, reusableCards);
      renderedCards = promptResult.renderedCards;
      promptGroupCount = promptResult.groupCount;
    } else {
      renderedCards = reconcileFlatGallery(jobs);
    }

    elements.galleryEmpty.style.display = renderedCards ? "none" : "";
    const loadedJobText = getGalleryItemsState().length ? getLoadedGalleryCountText() : getLoadedJobCountText();
    elements.galleryCount.textContent = renderedCards
      ? currentFilter === "tasks"
        ? `${jobs.length} 个可见任务 · ${renderedCards} 张 · ${loadedJobText}`
        : currentFilter === "prompts"
          ? `${promptGroupCount} 组提示词 · ${renderedCards} 张 · ${loadedJobText}`
          : `${renderedCards} 张 · ${loadedJobText}`
      : "";
    updateSyncIndicators();
    refreshRelativeTimes();
    scheduleGalleryLayout();
    syncLightboxSelection();
  }

  function filterGallery(type) {
    const nextFilter = normalizeGalleryFilter(type);
    const changed = getCurrentFilter() !== nextFilter;
    setCurrentFilter(nextFilter);
    syncGalleryFilterButtons(nextFilter);
    if (changed) {
      workflowState.writeGalleryFilter?.(nextFilter);
    }
    renderGallery();
  }

  function toggleSort() {
    const nextSortAsc = !getGallerySortAsc();
    setGallerySortAsc(nextSortAsc);
    elements.sortBtn.textContent = nextSortAsc ? "旧→新 ↑" : "新→旧 ↓";
    const clearedState = getGalleryDataController().clearItems(getGalleryPaginationState());
    setGalleryItemsState(clearedState.items);
    setGalleryPaginationState(clearedState.pagination);
    renderGallery();
    refreshJobs({ silent: true, reset: true });
  }

  return {
    filterGallery,
    refreshRelativeTimes,
    renderGallery,
    toggleSort,
    updateSyncIndicators,
  };
}
