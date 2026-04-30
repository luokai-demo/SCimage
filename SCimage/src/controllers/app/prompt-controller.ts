// @ts-nocheck

export function createPromptController({
  elements,
  workflowState,
  outputOptions,
  promptStore,
  copyToClipboard,
  getActiveWorkflow,
  getWorkflowLabel,
  getJobOptionSummary,
  formatDateTime,
  normalizeWorkflow,
  readFormFromUi,
  readOutputParamsFromUi,
  saveActiveWorkflowForm,
  applyFormToUi,
  setStatus,
}) {
  function syncStore(workflow, promptBank) {
    promptStore?.setActiveWorkflow(workflow);
    promptStore?.replacePrompts(promptBank.map((item) => ({
      id: String(item.id || ""),
      workflow: normalizeWorkflow(item.workflow || workflow),
      prompt: String(item.prompt || ""),
      optionSummary: getJobOptionSummary(item),
      savedAtText: `保存于 ${formatDateTime(item.updatedAt || item.createdAt)}`,
      createdAt: item.createdAt || item.updatedAt || "",
    })));
  }

  function render() {
    const workflow = normalizeWorkflow(getActiveWorkflow());
    const workflowLabel = getWorkflowLabel(workflow);
    const promptBank = workflowState.readPromptBank(workflow);
    promptStore?.setEmptyLabel(`还没有保存的${workflowLabel}提示词`);
    syncStore(workflow, promptBank);
    window.WorkspacePanel?.setPromptBankMeta(promptBank.length);
  }

  function saveCurrent() {
    const workflow = normalizeWorkflow(getActiveWorkflow());
    const form = readFormFromUi();
    const prompt = form.prompt.trim();
    if (!prompt) {
      alert("请先输入提示词");
      elements.prompt.focus();
      return;
    }

    const outputParams = readOutputParamsFromUi();
    if (!outputParams) {
      return;
    }

    const nextEntry = workflowState.savePrompt(workflow, {
      workflow,
      prompt,
      outputProfileId: outputOptions.getActiveOutputProfileId(),
      size: outputParams.size,
      quality: outputParams.quality,
      count: Number.parseInt(form.count, 10) || 1,
    });
    if (!nextEntry) {
      return;
    }

    saveActiveWorkflowForm(workflow);
    render();
    window.WorkspacePanel?.openPromptBank(true);
    setStatus("success", `已保存到${getWorkflowLabel(workflow)}词库。`, { timeoutMs: 2200 });
  }

  function clearSaved() {
    const workflow = normalizeWorkflow(getActiveWorkflow());
    if (!workflowState.readPromptBank(workflow).length) {
      return;
    }
    if (!window.confirm(`确定清空${getWorkflowLabel(workflow)}已保存提示词？`)) {
      return;
    }
    workflowState.clearPromptBank(workflow);
    render();
    setStatus("success", "提示词库已清空。", { timeoutMs: 2200 });
  }

  function applySaved(promptId) {
    const workflow = normalizeWorkflow(getActiveWorkflow());
    const entry = workflowState.findPrompt(workflow, promptId);
    if (!entry) {
      return;
    }
    applyFormToUi({
      prompt: entry.prompt,
      size: entry.size,
      quality: entry.quality,
      count: String(entry.count || 1),
    }, workflow);
    saveActiveWorkflowForm(workflow);
    setStatus("success", "提示词已载入。", { timeoutMs: 2200 });
  }

  function deleteSaved(promptId) {
    const workflow = normalizeWorkflow(getActiveWorkflow());
    workflowState.deletePrompt(workflow, promptId);
    render();
  }

  function copySaved(promptId, trigger) {
    const workflow = normalizeWorkflow(getActiveWorkflow());
    const entry = workflowState.findPrompt(workflow, promptId);
    if (entry) {
      copyToClipboard(entry.prompt, trigger, "已复制", "复制");
    }
  }

  return {
    applySaved,
    clearSaved,
    copySaved,
    deleteSaved,
    render,
    saveCurrent,
  };
}
