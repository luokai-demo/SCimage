// @ts-nocheck

export function createWorkflowFormController({
  elements,
  formFieldIds,
  outputOptions,
  workflowState,
  workspaceStore,
  promptStore,
  createElement,
  getSelectedSourceFiles,
  getWorkspacePanel,
  renderSavedPrompts,
  syncPrimaryActionState,
}) {
  function normalizeWorkflow(value, fallback = workflowState.DEFAULT_WORKFLOW) {
    return workflowState.normalizeWorkflow(value, fallback);
  }

  function isSupportedWorkflow(value) {
    return workflowState.isSupportedWorkflow(value);
  }

  function getActiveWorkflow() {
    return normalizeWorkflow(getWorkspacePanel()?.getActiveWorkflow?.(), workflowState.readActiveWorkflow());
  }

  function hasRequiredSourcesForWorkflow(workflow) {
    return workflow !== "image-to-image" || getSelectedSourceFiles().length > 0;
  }

  function syncPrimaryAction(isBusy = false, createJobInFlight = false) {
    const workflow = getActiveWorkflow();
    const config = getWorkspacePanel()?.getWorkflowConfig?.(workflow);
    const isEnabled = Boolean(config?.submitEnabled) && hasRequiredSourcesForWorkflow(workflow);
    const shouldDisable = isBusy || createJobInFlight || !isEnabled;
    elements.generateBtn.disabled = shouldDisable;
    elements.generateBtn.setAttribute("aria-disabled", String(shouldDisable));
  }

  function handleWorkflowChange(name) {
    const nextWorkflow = normalizeWorkflow(name, "");
    if (!nextWorkflow) {
      return;
    }

    const previousWorkflow = normalizeWorkflow(workflowState.readActiveWorkflow());
    if (nextWorkflow !== previousWorkflow) {
      saveActiveWorkflowForm(previousWorkflow);
    }
    workflowState.writeActiveWorkflow(nextWorkflow);
    workspaceStore?.setWorkflow(nextWorkflow);
    promptStore?.setActiveWorkflow(nextWorkflow);
    loadActiveWorkflowForm(nextWorkflow);
    renderSavedPrompts();
    syncPrimaryActionState();
  }

  function handleSourceFilesChange() {
    workspaceStore?.setSourceFileCount(getSelectedSourceFiles().length);
    syncPrimaryActionState();
  }

  function populateOutputOptionSelects() {
    if (elements.quality) {
      elements.quality.innerHTML = "";
      outputOptions.getQualityOptions().forEach((option) => {
        const node = createElement("option", "", option.label);
        node.value = option.value;
        node.selected = option.value === outputOptions.getDefaultQuality();
        elements.quality.appendChild(node);
      });
    }
    syncSizeOptionsForQuality(
      elements.quality?.value || outputOptions.getDefaultQuality(),
      elements.size?.value || outputOptions.getDefaultSizeOption()
    );
  }

  function syncSizeOptionsForQuality(quality, preferredSize) {
    if (!elements.size) {
      return;
    }

    const normalizedQuality = outputOptions.normalizeQuality(quality, outputOptions.getDefaultQuality());
    const nextSize = outputOptions.mapSizeToQuality(
      preferredSize,
      normalizedQuality,
      outputOptions.defaultSizeForQuality(normalizedQuality)
    );

    elements.size.innerHTML = "";
    outputOptions.getSizeOptions(normalizedQuality).forEach((option) => {
      const node = createElement("option", "", option.label);
      node.value = option.value;
      node.selected = option.value === nextSize;
      elements.size.appendChild(node);
    });
    if (!Array.from(elements.size.options).some((option) => option.value === nextSize)) {
      const customNode = createElement("option", "", `自定义像素 · ${nextSize}`);
      customNode.value = nextSize;
      customNode.selected = true;
      elements.size.appendChild(customNode);
    }
    elements.size.value = nextSize;

    if (elements.quality) {
      elements.quality.value = normalizedQuality;
    }
  }

  function readFormFromUi(workflow = getActiveWorkflow()) {
    const form = {};
    formFieldIds.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        form[fieldId] = field.value;
      }
    });
    return workflowState.normalizeForm(form, workflow);
  }

  function applyFormToUi(form, workflow = getActiveWorkflow()) {
    const nextState = workflowState.normalizeForm(form, workflow);
    if (elements.prompt && nextState.prompt != null) {
      elements.prompt.value = nextState.prompt;
    }
    if (elements.count && nextState.count != null) {
      elements.count.value = nextState.count;
    }
    syncSizeOptionsForQuality(nextState.quality, nextState.size);
  }

  function saveActiveWorkflowForm(workflow = getActiveWorkflow()) {
    const normalizedWorkflow = normalizeWorkflow(workflow);
    workflowState.writeForm(normalizedWorkflow, readFormFromUi(normalizedWorkflow));
  }

  function loadActiveWorkflowForm(workflow = getActiveWorkflow()) {
    const normalizedWorkflow = normalizeWorkflow(workflow);
    applyFormToUi(workflowState.readForm(normalizedWorkflow), normalizedWorkflow);
  }

  function readOutputParamsFromUi() {
    const size = elements.size.value;
    const quality = elements.quality.value;

    if (!outputOptions.isSupportedSize(size)) {
      alert("请选择有效的尺寸参数");
      elements.size.focus();
      return null;
    }

    if (!outputOptions.isSupportedQuality(quality)) {
      alert("请选择有效的质量参数");
      elements.quality.focus();
      return null;
    }

    return {
      size: outputOptions.normalizeSizeOption(
        size,
        outputOptions.defaultSizeForQuality(quality),
        quality
      ),
      quality: outputOptions.normalizeQuality(quality, outputOptions.getDefaultQuality()),
    };
  }

  return {
    applyFormToUi,
    getActiveWorkflow,
    handleSourceFilesChange,
    handleWorkflowChange,
    isSupportedWorkflow,
    loadActiveWorkflowForm,
    normalizeWorkflow,
    populateOutputOptionSelects,
    readFormFromUi,
    readOutputParamsFromUi,
    saveActiveWorkflowForm,
    syncPrimaryAction,
    syncSizeOptionsForQuality,
  };
}
