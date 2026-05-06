export async function runPromptSettingsGalleryScenario(context) {
  const { page, state, waitForCondition, now, imageDataUrl } = context;
  await page.fill("#prompt", "重复保存检查");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  await page.locator("#savePromptBtn").click();
  await page.waitForFunction(() => document.querySelectorAll(".prompt-bank-item").length === 1);
  const savedPromptOptionSummary = await page.locator(".prompt-bank-item .prompt-meta").first().textContent();
  if (!savedPromptOptionSummary?.startsWith("文生图 · 尺寸")) {
    throw new Error(`保存提示词摘要缺少工作流信息：${savedPromptOptionSummary || ""}`);
  }
  await page.locator("#savePromptBtn").click();
  await page.waitForTimeout(200);
  const duplicatePromptCount = await page.locator(".prompt-bank-item").count();
  const promptBankCountText = await page.locator("#promptBankCount").textContent();
  if (duplicatePromptCount !== 1 || promptBankCountText !== "1 条") {
    throw new Error(`重复保存提示词没有更新置顶而是产生重复项：items=${duplicatePromptCount}, count=${promptBankCountText || ""}`);
  }
  await page.locator("#togglePromptBankBtn").click();

  await page.locator("#settingsToggleBtn").click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#settingsPanel")).display !== "none");
  await page.locator("#cleanupGeneratedBtn").click();
  await page.waitForFunction(() => document.querySelector("#cleanupGeneratedBtn")?.hasAttribute("disabled"));
  await page.locator("#cleanupGeneratedBtn").click({ force: true });
  await page.waitForFunction(() => document.querySelector("#cleanupGeneratedBtn")?.textContent?.trim() === "清理空文件夹");
  if (state.cleanupGeneratedRequestCount !== 1) {
    throw new Error(`清理空文件夹没有防重复请求：${state.cleanupGeneratedRequestCount}`);
  }
  const cleanupStatus = await page.locator("#status").textContent();
  if (cleanupStatus !== "已清理 2 个空文件夹。") {
    throw new Error(`清理空文件夹状态错误：${cleanupStatus || ""}`);
  }
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#settingsPanel")).display === "none");
  await page.locator("#settingsToggleBtn").click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#settingsPanel")).display !== "none");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#settingsPanel")).display === "none");

  await page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .meta-actions button", { hasText: "复制" }).click({ force: true });
  await page.waitForFunction(() => window.__copiedTexts?.includes("可删除的任务"));
  const copyStatus = await page.locator("#status").textContent();
  if (copyStatus !== "提示词已复制。") {
    throw new Error(`复制降级没有显示成功状态：${copyStatus || ""}`);
  }

  await page.locator("[data-gallery-filter='tasks']").click();
  await page.waitForFunction(() => document.querySelector("#galleryCount")?.textContent?.includes("个可见任务"));
  await page.waitForSelector(".gallery-job-section");
  const runningTaskSection = page.locator(".gallery-job-section", { hasText: "正在生成的任务" }).first();
  const runningTaskTitle = await runningTaskSection.locator(".gallery-job-section-title").textContent();
  const runningTaskSummary = await runningTaskSection.locator(".gallery-job-section-summary").textContent();
  const runningTaskMeta = await runningTaskSection.locator(".gallery-job-section-meta").textContent();
  if (
    runningTaskTitle !== "正在生成的任务" ||
    !runningTaskSummary?.includes("任务 job-runn") ||
    !runningTaskMeta?.includes("文生图 · 1/2 ·")
  ) {
    throw new Error(`任务分组信息没有按旧版展示：title=${runningTaskTitle || ""}, summary=${runningTaskSummary || ""}, meta=${runningTaskMeta || ""}`);
  }
  const runningGalleryAction = await runningTaskSection
    .locator(".gallery-item[data-job-id='job-running'][data-image-slot='1'] .meta-actions button")
    .last()
    .textContent();
  if (runningGalleryAction !== "中断") {
    throw new Error(`运行中图库卡片最后操作应为中断：${runningGalleryAction || ""}`);
  }
  await page.locator("[data-gallery-filter='prompts']").click();
  await page.waitForFunction(() => document.querySelector("#galleryCount")?.textContent?.includes("组提示词"));
  const completedPromptSection = page.locator(".gallery-job-section", { hasText: "可删除的任务" }).first();
  const completedPromptMeta = await completedPromptSection.locator(".gallery-job-section-meta").textContent();
  if (!completedPromptMeta?.includes("1 个任务 · 2 张图片 · 最近更新")) {
    throw new Error(`提示词分组信息没有按旧版展示：${completedPromptMeta || ""}`);
  }
  await page.locator("[data-gallery-filter='all']").click();

  await page.locator(".gallery-item[data-job-id='job-missing-reference'][data-image-slot='1'] .meta-actions button", { hasText: "参考" }).evaluate((button) => button.click());
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "图片读取失败：404");
  const workflowAfterFailedReference = await page.locator(".workflow-tab.active").textContent();
  const sourcePreviewCount = await page.locator(".source-preview-item").count();
  if (workflowAfterFailedReference !== "文生图" || sourcePreviewCount !== 0) {
    throw new Error(`失效参考图被误加入或误切换：workflow=${workflowAfterFailedReference || ""}, sources=${sourcePreviewCount}`);
  }

  await page.locator(".gallery-item[data-job-id='job-missing-reference'][data-image-slot='1'] .meta-actions button", { hasText: "下载" }).evaluate((button) => button.click());
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "下载失败：HTTP 404");

  await page.evaluate(() => {
    window.pywebview = {
      api: {
        download_file: async (url, filename) => {
          window.__desktopDownloads.push({ url, filename });
          return { ok: true, path: "/tmp/" + filename };
        },
      },
    };
  });
  await page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .meta-actions button", { hasText: "下载" }).click({ force: true });
  await page.waitForFunction(() => window.__desktopDownloads?.some((item) => item.filename === "one.svg"));
  const desktopDownloadStatus = await page.locator("#status").textContent();
  if (desktopDownloadStatus !== "图片已保存。") {
    throw new Error(`桌面桥接下载没有显示成功状态：${desktopDownloadStatus || ""}`);
  }

  state.galleryResponseDelayMs = 400;
  await page.locator("#sortBtn").click();
  await page.locator("#sortBtn").click();
  await page.waitForFunction(() => !document.querySelector("#sortBtn")?.textContent?.includes("旧到新"));
  await page.waitForSelector(".gallery-item[data-job-id='job-completed'][data-image-slot='1']");
  const firstGalleryJobAfterQueuedSort = await page.locator(".gallery-item[data-job-id]").first().getAttribute("data-job-id");
  if (firstGalleryJobAfterQueuedSort !== "job-running") {
    throw new Error(`连续排序后最终显示顺序没有回到新到旧：${firstGalleryJobAfterQueuedSort || ""}`);
  }
  state.galleryResponseDelayMs = 0;

  state.jobs = [
    {
      id: "job-lightbox-sync",
      status: "completed",
      workflow: "generate",
      prompt: "预览刷新保持当前图",
      count: 1,
      created_at: new Date(now - 210000).toISOString(),
      updated_at: new Date(now - 150000).toISOString(),
      images: [
        { slot: 1, url: imageDataUrl, name: "lightbox.png" },
      ],
    },
    ...state.jobs,
  ];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForSelector(".gallery-item[data-job-id='job-lightbox-sync'][data-image-slot='1']");
  await page.locator(".gallery-item[data-job-id='job-lightbox-sync'][data-image-slot='1']").click({ force: true });
  await page.waitForSelector("#lightbox.open");
  const lightboxA11yState = await page.locator("#lightbox").evaluate((node) => ({
    role: node.getAttribute("role"),
    modal: node.getAttribute("aria-modal"),
    label: node.getAttribute("aria-label"),
  }));
  if (lightboxA11yState.role !== "dialog" || lightboxA11yState.modal !== "true" || lightboxA11yState.label !== "图片预览") {
    throw new Error(`预览弹层语义没有恢复：${JSON.stringify(lightboxA11yState)}`);
  }
  for (let index = 0; index < 16; index += 1) {
    await page.locator("#lightboxZoomIn").click();
  }
  const zoomState = await page.evaluate(() => ({
    text: document.querySelector("#lightboxZoomValue")?.textContent || "",
    disabled: document.querySelector("#lightboxZoomIn")?.hasAttribute("disabled") || false,
  }));
  if (zoomState.text !== "500%" || !zoomState.disabled) {
    throw new Error(`预览最大缩放没有恢复到 5x：${JSON.stringify(zoomState)}`);
  }
  const lightboxPromptBeforeRefresh = await page.locator("#lightboxPrompt").textContent();
  if (lightboxPromptBeforeRefresh !== "预览刷新保持当前图") {
    throw new Error(`预览打开了错误图片：${lightboxPromptBeforeRefresh || ""}`);
  }
  state.jobs = [
    {
      id: "job-newer-before-lightbox",
      status: "completed",
      workflow: "generate",
      prompt: "刷新后排在前面的新图",
      count: 1,
      created_at: new Date(now + 30000).toISOString(),
      updated_at: new Date(now + 30000).toISOString(),
      images: [
        { slot: 1, url: imageDataUrl, name: "newer.png" },
      ],
    },
    ...state.jobs,
  ];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => document.querySelector("#lightboxPrompt")?.textContent === "预览刷新保持当前图");
  const lightboxCounterAfterRefresh = await page.locator("#lightboxCounter").textContent();
  if (lightboxCounterAfterRefresh === "1 / 7") {
    throw new Error("预览刷新后仍按旧下标显示，当前图片没有按任务和槽位重新定位。");
  }
  state.jobs = state.jobs.filter((job) => job.id !== "job-lightbox-sync");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => !document.querySelector("#lightbox")?.classList.contains("open"));
  state.jobs = state.jobs.filter((job) => job.id !== "job-newer-before-lightbox");
  await page.keyboard.press("Escape");

  await page.locator(".gallery-item[data-job-id='job-stale-selection'][data-image-slot='1'] .gallery-select-btn").click({ force: true });
  await page.waitForFunction(() => document.querySelector("#batchCount")?.textContent === "已选择 1 张");
  state.jobs = state.jobs.filter((job) => job.id !== "job-stale-selection");
  await page.locator("#settingsToggleBtn").click();
  await page.locator("#refreshGalleryBtn").click();
  await page.waitForFunction(() => !document.querySelector(".gallery-item[data-job-id='job-stale-selection']"));
  await page.waitForFunction(() => document.querySelector("#batchToolbar")?.hidden === true);
  await page.keyboard.press("Escape");

  await page.fill("#prompt", "离开保存检查");
  const saveRequest = page.waitForRequest((request) => (
    request.method() === "PUT" &&
    request.url().includes("/api/workspace-state") &&
    (request.postData() || "").includes("离开保存检查")
  ));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenSaveRequest = await saveRequest;
  const hiddenSavePayload = hiddenSaveRequest.postDataJSON();
  if (hiddenSavePayload?.forms?.generate?.prompt !== "离开保存检查") {
    throw new Error("页面隐藏时没有立即保存当前工作区状态。");
  }
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await waitForCondition(
    () => state.workspaceStateSaves.some((payload) => payload?.forms?.generate?.prompt === "离开保存检查"),
    "页面隐藏保存请求没有成功落入工作区状态。",
  );
  const attemptsBeforeRetry = state.workspaceStateSaveAttempts;
  state.failNextWorkspaceStateSave = true;
  state.expectedWorkspaceSaveFailures += 1;
  await page.fill("#prompt", "失败后重试保存检查");
  await waitForCondition(
    () => (
      state.workspaceStateSaveAttempts >= attemptsBeforeRetry + 2 &&
      state.workspaceStateSaves.some((payload) => payload?.forms?.generate?.prompt === "失败后重试保存检查")
    ),
    "工作区状态保存失败后没有自动重试并保存最新内容。",
    5000,
  );
}
