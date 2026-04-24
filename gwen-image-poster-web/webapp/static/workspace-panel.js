"use strict";

(() => {
  const PANEL_COLLAPSED_KEY = "image_workbench_panel_collapsed_v1";
  const WORKFLOWS = {
    generate: {
      label: "文生图",
      chipLabel: "已接入",
      chipState: "live",
      submitEnabled: true,
      promptHint: "直接描述你想生成的画面、风格和细节。",
      promptPlaceholder: "一只在星空下奔跑的白色柴犬，水彩风格",
      actionLabel: "生成图片",
      source: null,
    },
    "image-to-image": {
      label: "图生图",
      chipLabel: "待接入",
      chipState: "planned",
      submitEnabled: false,
      promptHint: "可上传多张参考图，再描述你希望统一迁移出的画面效果。",
      promptPlaceholder: "参考多张样图的构图与质感，输出统一风格的人像海报",
      actionLabel: "开始图生图",
      source: {
        title: "参考图",
        hint: "支持拖拽、粘贴或选择多张图片作为参考。",
        text: "将多张参考图拖到这里，或粘贴到工作区",
        buttonLabel: "选择多张参考图",
      },
    },
  };

  const elements = {
    panel: document.getElementById("workspacePanel"),
    panelToggleBtn: document.getElementById("panelToggleBtn"),
    providerConfigCard: document.getElementById("providerConfigCard"),
    workflowTabs: Array.from(document.querySelectorAll("[data-workflow]")),
    workflowScopedNodes: Array.from(document.querySelectorAll("[data-workflow-scope]")),
    workspaceTitle: document.getElementById("workspaceTitle"),
    workspaceModeChip: document.getElementById("workspaceModeChip"),
    promptField: document.getElementById("prompt"),
    promptSectionHint: document.getElementById("promptSectionHint"),
    primaryActionButton: document.getElementById("generateBtn"),
    sourceTitle: document.getElementById("sourceTitle"),
    sourceHint: document.getElementById("sourceHint"),
    sourceDropZone: document.getElementById("sourceDropZone"),
    sourceDropText: document.getElementById("sourceDropText"),
    sourcePreview: document.getElementById("sourcePreview"),
    sourceInput: document.getElementById("sourceImage"),
    sourceBrowseBtn: document.getElementById("sourceBrowseBtn"),
    togglePromptBankBtn: document.getElementById("togglePromptBankBtn"),
    promptBankPanel: document.getElementById("promptBankPanel"),
    promptBankCount: document.getElementById("promptBankCount"),
  };

  let activeWorkflow = "generate";
  let initialized = false;
  let providerConfigTouched = false;
  let workflowChangeHandler = null;
  let sourceFiles = [];
  let isPanelCollapsed = false;

  function getWorkflowConfig(name) {
    return WORKFLOWS[name] || null;
  }

  function syncPromptBankToggleState() {
    if (!elements.togglePromptBankBtn || !elements.promptBankPanel) {
      return;
    }
    const isOpen = elements.promptBankPanel.open;
    elements.togglePromptBankBtn.classList.toggle("is-active", isOpen);
    elements.togglePromptBankBtn.setAttribute("aria-expanded", String(isOpen));
  }

  function syncPanelToggleState() {
    if (!elements.panel || !elements.panelToggleBtn) {
      return;
    }
    elements.panel.classList.toggle("is-collapsed", isPanelCollapsed);
    const label = isPanelCollapsed ? "展开左侧工作区" : "收起左侧工作区";
    elements.panelToggleBtn.setAttribute("aria-label", label);
    elements.panelToggleBtn.setAttribute("title", label);
  }

  function setPanelCollapsed(nextValue) {
    isPanelCollapsed = Boolean(nextValue);
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, isPanelCollapsed ? "1" : "0");
    } catch (error) {
      console.warn("Failed to persist panel state:", error);
    }
    syncPanelToggleState();
  }

  function buildSourceFileKey(file) {
    return [file.name, file.size, file.lastModified].join("::");
  }

  function renderSourcePreview() {
    if (!elements.sourcePreview || !elements.sourceDropText) {
      return;
    }

    elements.sourcePreview.innerHTML = "";
    elements.sourceDropText.textContent = sourceFiles.length
      ? `已选择 ${sourceFiles.length} 张参考图`
      : "将多张参考图拖到这里，或粘贴到工作区";

    sourceFiles.forEach((file) => {
      const wrap = document.createElement("span");
      wrap.className = "thumb-wrap";

      const image = document.createElement("img");
      image.src = URL.createObjectURL(file);
      image.alt = file.name;
      image.addEventListener("load", () => {
        URL.revokeObjectURL(image.src);
      }, { once: true });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "thumb-remove";
      removeButton.textContent = "×";
      removeButton.setAttribute("aria-label", `移除 ${file.name}`);
      removeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const targetKey = buildSourceFileKey(file);
        sourceFiles = sourceFiles.filter((item) => buildSourceFileKey(item) !== targetKey);
        renderSourcePreview();
      });

      wrap.append(image, removeButton);
      elements.sourcePreview.appendChild(wrap);
    });
  }

  function appendSourceFiles(fileList) {
    const nextFiles = Array.from(fileList || []).filter((file) => file && file.type.startsWith("image/"));
    if (!nextFiles.length) {
      return;
    }

    const existingKeys = new Set(sourceFiles.map(buildSourceFileKey));
    nextFiles.forEach((file) => {
      const fileKey = buildSourceFileKey(file);
      if (!existingKeys.has(fileKey)) {
        sourceFiles.push(file);
        existingKeys.add(fileKey);
      }
    });
    renderSourcePreview();
  }

  function applyWorkflowUi(name) {
    const config = getWorkflowConfig(name);
    if (!config) {
      return false;
    }

    activeWorkflow = name;

    elements.workflowTabs.forEach((button) => {
      const isActive = button.dataset.workflow === name;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    elements.workflowScopedNodes.forEach((node) => {
      const scopes = (node.dataset.workflowScope || "")
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const shouldShow = scopes.includes(name);
      node.classList.toggle("mode-hidden", !shouldShow);
    });

    if (elements.workspaceTitle) {
      elements.workspaceTitle.textContent = config.label;
    }

    if (elements.workspaceModeChip) {
      elements.workspaceModeChip.textContent = config.chipLabel;
      elements.workspaceModeChip.classList.toggle("is-live", config.chipState === "live");
      elements.workspaceModeChip.classList.toggle("is-planned", config.chipState !== "live");
    }

    if (elements.promptSectionHint) {
      elements.promptSectionHint.textContent = config.promptHint;
    }

    if (elements.promptField) {
      elements.promptField.placeholder = config.promptPlaceholder;
    }

    if (elements.primaryActionButton) {
      elements.primaryActionButton.textContent = config.actionLabel;
    }

    if (config.source && elements.sourceTitle && elements.sourceHint && elements.sourceDropText && elements.sourceBrowseBtn) {
      elements.sourceTitle.textContent = config.source.title;
      elements.sourceHint.textContent = config.source.hint;
      elements.sourceDropText.textContent = config.source.text;
      elements.sourceBrowseBtn.textContent = config.source.buttonLabel;
    }

    return true;
  }

  function setActiveWorkflow(name, options = {}) {
    const changed = applyWorkflowUi(name);
    if (!changed) {
      return false;
    }

    if (options.emit !== false && typeof workflowChangeHandler === "function") {
      workflowChangeHandler(name, getWorkflowConfig(name));
    }
    return true;
  }

  function openPromptBank(forceOpen = true) {
    if (!elements.promptBankPanel) {
      return;
    }
    elements.promptBankPanel.open = forceOpen;
    syncPromptBankToggleState();
  }

  function setPromptBankMeta(count) {
    if (!elements.promptBankCount) {
      return;
    }
    elements.promptBankCount.textContent = `${count} 条`;
  }

  function syncProviderConfig(hasProfiles) {
    if (!elements.providerConfigCard || providerConfigTouched) {
      return;
    }
    elements.providerConfigCard.open = !hasProfiles;
  }

  function bindEvents() {
    elements.workflowTabs.forEach((button) => {
      button.addEventListener("click", () => {
        setActiveWorkflow(button.dataset.workflow);
      });
    });

    elements.togglePromptBankBtn?.addEventListener("click", () => {
      openPromptBank(!elements.promptBankPanel?.open);
    });

    elements.promptBankPanel?.addEventListener("toggle", () => {
      syncPromptBankToggleState();
    });

    elements.providerConfigCard?.addEventListener("toggle", () => {
      providerConfigTouched = true;
    });

    elements.panelToggleBtn?.addEventListener("click", () => {
      setPanelCollapsed(!isPanelCollapsed);
    });

    elements.sourceBrowseBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      elements.sourceInput?.click();
    });

    elements.sourceInput?.addEventListener("change", (event) => {
      appendSourceFiles(event.target.files);
      event.target.value = "";
    });

    elements.sourceDropZone?.addEventListener("click", (event) => {
      if (event.target.closest(".thumb-remove")) {
        return;
      }
      elements.sourceInput?.click();
    });

    elements.sourceDropZone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      elements.sourceDropZone.classList.add("dragover");
    });

    elements.sourceDropZone?.addEventListener("dragleave", () => {
      elements.sourceDropZone.classList.remove("dragover");
    });

    elements.sourceDropZone?.addEventListener("drop", (event) => {
      event.preventDefault();
      elements.sourceDropZone.classList.remove("dragover");
      appendSourceFiles(event.dataTransfer?.files);
    });

    elements.sourceDropZone?.addEventListener("paste", (event) => {
      const items = Array.from(event.clipboardData?.items || []);
      const files = items
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (!files.length) {
        return;
      }
      event.preventDefault();
      appendSourceFiles(files);
    });
  }

  function init(options = {}) {
    workflowChangeHandler = typeof options.onWorkflowChange === "function" ? options.onWorkflowChange : null;

    if (!initialized) {
      bindEvents();
      initialized = true;
    }

    try {
      isPanelCollapsed = localStorage.getItem(PANEL_COLLAPSED_KEY) === "1";
    } catch (error) {
      console.warn("Failed to read panel state:", error);
      isPanelCollapsed = false;
    }

    const nextWorkflow = getWorkflowConfig(options.initialWorkflow) ? options.initialWorkflow : "generate";
    setActiveWorkflow(nextWorkflow, { emit: false });
    syncPromptBankToggleState();
    syncPanelToggleState();
    renderSourcePreview();
  }

  window.WorkspacePanel = {
    init,
    getActiveWorkflow: () => activeWorkflow,
    getWorkflowConfig,
    openPromptBank,
    setActiveWorkflow,
    setPromptBankMeta,
    syncProviderConfig,
  };
})();
