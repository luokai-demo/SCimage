// @ts-nocheck

export function createJobSyncController({
  apiRequest,
  jobsPageSize,
  galleryPageSize,
  jobsLoadTimeoutMs,
  getJobsState,
  getJobsPaginationState,
  getGalleryPaginationState,
  getGallerySortAsc,
  setJobsPaginationState,
  setGalleryPaginationState,
  getJobSnapshotSignature,
  getGallerySnapshotSignature,
  applyJobsPage,
  applyGalleryImagesPage,
  patchJobsPagination,
  patchGalleryPagination,
  markSyncSuccess,
  markSyncError,
  syncProblemPopups,
  renderGallery,
  renderLeftTaskList,
  renderRunningBanner,
  syncRenderedGalleryCardActions,
  updateSyncIndicators,
  refreshGalleryViewportEffects,
  syncLightboxSelection,
  refreshRelativeTimes,
  setStatus,
}) {
  let refreshInFlight = null;
  let lastSyncAt = null;
  let lastSyncError = "";
  let lastJobSnapshotSignature = "";
  let lastGallerySnapshotSignature = "";

  function getState() {
    return {
      lastSyncAt,
      lastSyncError,
      lastJobSnapshotSignature,
      lastGallerySnapshotSignature,
      refreshInFlight,
    };
  }

  function setSnapshotSignatures(jobs) {
    lastJobSnapshotSignature = getJobSnapshotSignature(jobs);
    lastGallerySnapshotSignature = getGallerySnapshotSignature(jobs);
  }

  function buildJobsPageUrl(offset, limit, cursor = "") {
    const params = new URLSearchParams({
      offset: String(Math.max(0, Number(offset || 0))),
      limit: String(Math.max(1, Number(limit || jobsPageSize))),
    });
    if (cursor) {
      params.set("cursor", cursor);
    }
    return `/api/jobs?${params.toString()}`;
  }

  function buildGalleryImagesPageUrl(limit, cursor = "") {
    const params = new URLSearchParams({
      limit: String(Math.max(1, Number(limit || galleryPageSize))),
      sort: getGallerySortAsc() ? "asc" : "desc",
    });
    if (cursor) {
      params.set("cursor", cursor);
    }
    return `/api/gallery/images?${params.toString()}`;
  }

  async function refreshJobs(options = {}) {
    if (refreshInFlight) {
      return refreshInFlight;
    }

    refreshInFlight = (async () => {
      try {
        const jobsPaginationState = getJobsPaginationState();
        const galleryPaginationState = getGalleryPaginationState();
        const data = await apiRequest(buildJobsPageUrl(0, jobsPaginationState.pageSize || jobsPageSize), {
          method: "GET",
          timeoutMs: jobsLoadTimeoutMs,
        });
        const galleryData = await apiRequest(buildGalleryImagesPageUrl(galleryPaginationState.pageSize || galleryPageSize), {
          method: "GET",
          timeoutMs: jobsLoadTimeoutMs,
        });
        const previousJobs = getJobsState();
        const shouldReset = Boolean(options.reset) || !previousJobs.length;
        applyJobsPage(data, { reset: shouldReset });
        applyGalleryImagesPage(galleryData, { reset: true });
        const nextJobs = getJobsState();
        const nextSignature = getJobSnapshotSignature(nextJobs);
        const nextGallerySignature = getGallerySnapshotSignature(nextJobs);
        const jobsChanged = nextSignature !== lastJobSnapshotSignature;
        const galleryChanged = nextGallerySignature !== lastGallerySnapshotSignature;
        syncProblemPopups(nextJobs);

        lastSyncAt = new Date();
        lastSyncError = "";
        markSyncSuccess(lastSyncAt);
        if (jobsChanged && galleryChanged) {
          renderGallery();
        } else if (jobsChanged) {
          lastJobSnapshotSignature = nextSignature;
          lastGallerySnapshotSignature = nextGallerySignature;
          renderLeftTaskList();
          renderRunningBanner();
          syncRenderedGalleryCardActions();
          updateSyncIndicators();
          refreshGalleryViewportEffects();
          syncLightboxSelection();
        } else {
          updateSyncIndicators();
          refreshRelativeTimes();
        }
        if (options.manual) {
          setStatus("success", "已刷新。", { timeoutMs: 1800 });
        }
        if (!jobsChanged && previousJobs !== getJobsState()) {
          renderLeftTaskList();
        }
      } catch (error) {
        lastSyncError = error.message;
        markSyncError(error);
        updateSyncIndicators();
        if (!options.silent) {
          setStatus("error", error.message);
        }
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }

  async function loadMoreJobs(options = {}) {
    const jobsPaginationState = getJobsPaginationState();
    if (jobsPaginationState.isLoadingMore || !jobsPaginationState.hasMore) {
      return null;
    }

    setJobsPaginationState(patchJobsPagination(jobsPaginationState, { isLoadingMore: true }));
    renderLeftTaskList();

    try {
      const nextPaginationState = getJobsPaginationState();
      const data = await apiRequest(buildJobsPageUrl(
        nextPaginationState.nextOffset,
        nextPaginationState.pageSize || jobsPageSize,
        nextPaginationState.nextCursor,
      ), {
        method: "GET",
        timeoutMs: jobsLoadTimeoutMs,
      });
      applyJobsPage(data, { reset: false });
      renderGallery();
      return data;
    } catch (error) {
      lastSyncError = error.message;
      markSyncError(error);
      updateSyncIndicators();
      if (!options.silent) {
        setStatus("error", error.message);
      }
      return null;
    } finally {
      setJobsPaginationState(patchJobsPagination(getJobsPaginationState(), { isLoadingMore: false }));
      renderLeftTaskList();
    }
  }

  async function loadMoreGalleryImages(options = {}) {
    const galleryPaginationState = getGalleryPaginationState();
    if (galleryPaginationState.isLoadingMore || !galleryPaginationState.hasMore) {
      return null;
    }
    setGalleryPaginationState(patchGalleryPagination(galleryPaginationState, { isLoadingMore: true }));
    try {
      const nextPaginationState = getGalleryPaginationState();
      const data = await apiRequest(buildGalleryImagesPageUrl(
        nextPaginationState.pageSize || galleryPageSize,
        nextPaginationState.nextCursor,
      ), {
        method: "GET",
        timeoutMs: jobsLoadTimeoutMs,
      });
      applyGalleryImagesPage(data, { reset: false });
      renderGallery();
      return data;
    } catch (error) {
      lastSyncError = error.message;
      updateSyncIndicators();
      if (!options.silent) {
        setStatus("error", error.message);
      }
      return null;
    } finally {
      setGalleryPaginationState(patchGalleryPagination(getGalleryPaginationState(), { isLoadingMore: false }));
    }
  }

  return {
    buildGalleryImagesPageUrl,
    buildJobsPageUrl,
    getState,
    loadMoreGalleryImages,
    loadMoreJobs,
    refreshJobs,
    setSnapshotSignatures,
  };
}
