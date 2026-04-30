// @ts-nocheck

export function bindAppEvents({
  document,
  elements,
  formFieldIds,
  lightboxZoomMin,
  lightboxZoomStep,
  workflowState,
  callbacks,
  getLightboxZoomScale,
  getTaskListRenderFrame,
  setTaskListRenderFrame,
}) {
  callbacks.initGalleryInteractionArchitecture();

  formFieldIds.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field || fieldId === "size" || fieldId === "quality") {
      return;
    }
    field.addEventListener("input", () => callbacks.saveActiveWorkflowForm());
    field.addEventListener("change", () => callbacks.saveActiveWorkflowForm());
  });

  elements.size.addEventListener("change", () => {
    callbacks.saveActiveWorkflowForm();
  });

  elements.quality?.addEventListener("change", () => {
    callbacks.syncSizeOptionsForQuality(elements.quality.value, elements.size.value);
    callbacks.saveActiveWorkflowForm();
  });

  elements.toggleApiKeyVisibilityBtn?.addEventListener("click", callbacks.toggleApiKeyVisibility);
  elements.providerProfileSelect?.addEventListener("change", (event) => {
    callbacks.activateProviderProfile(event.target.value);
  });

  elements.generateBtn?.addEventListener("click", callbacks.submitActiveWorkflow);
  elements.savePromptBtn?.addEventListener("click", callbacks.saveCurrentPrompt);
  elements.clearPromptBankBtn?.addEventListener("click", callbacks.clearSavedPrompts);
  elements.saveProviderBtn?.addEventListener("click", () => void callbacks.saveProviderProfile());
  elements.saveAsProviderBtn?.addEventListener("click", () => void callbacks.saveAsProviderProfile());
  document.querySelectorAll(".gallery-filter button[data-gallery-filter]").forEach((button) => {
    button.addEventListener("click", () => callbacks.filterGallery(button.dataset.galleryFilter));
  });
  elements.sortBtn?.addEventListener("click", callbacks.toggleSort);
  document.getElementById("settingsToggleBtn")?.addEventListener("click", callbacks.toggleSettingsPanel);
  document.getElementById("refreshGalleryBtn")?.addEventListener("click", callbacks.refreshGallery);
  elements.cleanupGeneratedBtn?.addEventListener("click", () => void callbacks.cleanupEmptyGeneratedDirs());
  document.getElementById("clearSavedPromptsBtn")?.addEventListener("click", callbacks.clearSavedPrompts);
  document.getElementById("resetFormStateBtn")?.addEventListener("click", () => callbacks.resetFormState());
  elements.batchDownloadBtn?.addEventListener("click", callbacks.batchDownloadSelectedImages);
  elements.batchDeleteBtn?.addEventListener("click", callbacks.batchDeleteSelectedImages);
  elements.batchClearBtn?.addEventListener("click", callbacks.clearBatchSelection);
  window.addEventListener("scimage:load-more-jobs", (event) => {
    callbacks.loadMoreJobs(event.detail || {});
  });

  elements.savedPrompts.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prompt-action]");
    if (!button) {
      return;
    }

    const promptId = button.dataset.promptId;
    const action = button.dataset.promptAction;

    if (action === "apply") {
      callbacks.applySavedPrompt(promptId);
      return;
    }
    if (action === "copy") {
      callbacks.copySavedPrompt(promptId, button);
      return;
    }
    if (action === "delete") {
      callbacks.deleteSavedPrompt(promptId);
    }
  });

  elements.failurePopupConfirm?.addEventListener("click", callbacks.closeFailurePopup);
  elements.failurePopupRetry?.addEventListener("click", () => {
    const jobId = elements.failurePopupRetry.dataset.jobId;
    if (jobId) {
      callbacks.retryJob(jobId);
    }
  });
  elements.failurePopupDelete?.addEventListener("click", () => {
    const jobId = elements.failurePopupDelete.dataset.jobId;
    if (jobId) {
      callbacks.deleteJob(jobId);
    }
  });

  elements.lightboxZoomOut?.addEventListener("click", (event) => {
    event.stopPropagation();
    callbacks.zoomLightboxBy(-lightboxZoomStep);
  });
  elements.lightboxZoomIn?.addEventListener("click", (event) => {
    event.stopPropagation();
    callbacks.zoomLightboxBy(lightboxZoomStep);
  });
  elements.lightboxZoomReset?.addEventListener("click", (event) => {
    event.stopPropagation();
    callbacks.resetLightboxZoom();
  });
  document.getElementById("lightboxClose")?.addEventListener("click", callbacks.closeLightbox);
  elements.lightboxPrev?.addEventListener("click", () => callbacks.lightboxNav(-1));
  elements.lightboxNext?.addEventListener("click", () => callbacks.lightboxNav(1));
  elements.lightbox?.addEventListener("click", (event) => {
    if (event.target === elements.lightbox) {
      callbacks.closeLightbox();
    }
  });
  elements.lightboxPrompt?.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.lightboxPrompt.classList.toggle("expanded");
  });
  elements.lightboxCopy?.addEventListener("click", (event) => {
    event.stopPropagation();
    callbacks.copyPrompt();
  });
  elements.lightboxAddSource?.addEventListener("click", (event) => {
    event.stopPropagation();
    void callbacks.addLightboxImageToSource();
  });
  elements.lightboxDl?.addEventListener("click", (event) => {
    event.stopPropagation();
    void callbacks.downloadLightboxImage();
  });
  elements.lightboxDel?.addEventListener("click", (event) => {
    event.stopPropagation();
    void callbacks.deleteLightboxImage();
  });

  elements.lightboxImg?.addEventListener("wheel", callbacks.handleLightboxWheel, { passive: false });
  elements.lightboxImg?.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    callbacks.setLightboxZoom(getLightboxZoomScale() > lightboxZoomMin ? lightboxZoomMin : 2);
  });
  elements.lightboxImg?.addEventListener("pointerdown", callbacks.startLightboxPan);
  elements.lightboxImg?.addEventListener("pointermove", callbacks.updateLightboxPan);
  elements.lightboxImg?.addEventListener("pointerup", callbacks.stopLightboxPan);
  elements.lightboxImg?.addEventListener("pointercancel", callbacks.stopLightboxPan);
  elements.lightboxImg?.addEventListener("dragstart", (event) => event.preventDefault());

  elements.galleryGrid.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      event.stopPropagation();
      callbacks.handleJobAction(actionButton);
      return;
    }

    if (event.target.closest("a, button")) {
      return;
    }

    const card = event.target.closest("[data-open-lightbox]");
    if (!card) {
      return;
    }
    callbacks.openLightbox(Number.parseInt(card.dataset.openLightbox, 10), {
      jobId: card.dataset.jobId,
      slot: Number(card.dataset.imageSlot || 0),
    });
  });

  elements.galleryGrid.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-open-lightbox]");
    if (!card) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      callbacks.openLightbox(Number.parseInt(card.dataset.openLightbox, 10), {
        jobId: card.dataset.jobId,
        slot: Number(card.dataset.imageSlot || 0),
      });
    }
  });

  elements.taskList?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }
    event.stopPropagation();
    callbacks.handleJobAction(actionButton);
  });
  elements.taskList?.addEventListener("scroll", () => {
    callbacks.maybeLoadMoreJobsFromScroll(elements.taskList);
    if (getTaskListRenderFrame()) {
      return;
    }
    setTaskListRenderFrame(window.requestAnimationFrame(() => {
      setTaskListRenderFrame(null);
      callbacks.renderLeftTaskList();
    }));
  }, { passive: true });
  elements.galleryWindow?.addEventListener("scroll", () => {
    callbacks.maybeLoadMoreJobsFromScroll(elements.galleryWindow);
  }, { passive: true });
  elements.runningBannerToggle?.addEventListener("click", () => {
    const collapsed = elements.runningBanner.classList.toggle("is-collapsed");
    elements.runningBannerToggle.setAttribute("aria-expanded", String(!collapsed));
    window.requestAnimationFrame(() => callbacks.refreshGalleryViewportEffects());
    window.setTimeout(() => callbacks.refreshGalleryViewportEffects(), 220);
  });

  elements.runningBannerBody?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }
    event.stopPropagation();
    callbacks.handleJobAction(actionButton);
  });

  document.addEventListener("click", (event) => {
    if (elements.settingsPanel.classList.contains("open") && !event.target.closest(".settings-wrap")) {
      elements.settingsPanel.classList.remove("open");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!elements.lightbox.classList.contains("open")) {
      return;
    }
    if (event.key === "Escape") {
      callbacks.closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      callbacks.lightboxNav(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      callbacks.lightboxNav(1);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      callbacks.zoomLightboxBy(lightboxZoomStep);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      callbacks.zoomLightboxBy(-lightboxZoomStep);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      callbacks.resetLightboxZoom();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void workflowState.flush?.();
      return;
    }
    if (document.visibilityState === "visible") {
      callbacks.refreshJobs({ silent: true });
    }
  });

  window.addEventListener("focus", () => {
    callbacks.refreshJobs({ silent: true });
  });

  window.addEventListener("beforeunload", () => {
    void workflowState.flush?.();
  });
}
