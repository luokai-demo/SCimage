export async function runTaskLifecycleScenario(context) {
  const { page, state, now } = context;
  await page.waitForSelector("#taskQueueToggleBtn[aria-expanded='false']");
  await page.locator("#taskQueueToggleBtn").click();
  await page.waitForSelector("#taskQueuePanel");

  const durationNode = page.locator(".left-job-card.is-running .left-job-meta span").filter({ hasText: /分钟\d+秒/ }).first();
  const durationText = await durationNode.textContent();
  if (!durationText || !/\d+分钟\d+秒/.test(durationText)) {
    throw new Error(`运行中耗时没有显示秒：${durationText || ""}`);
  }
  await page.waitForFunction(
    (text) => {
      const nextText = [...document.querySelectorAll(".left-job-card.is-running .left-job-meta span")]
        .map((node) => node.textContent || "")
        .find((value) => /\d+分钟\d+秒/.test(value)) || "";
      return /\d+分钟\d+秒/.test(nextText) && nextText !== text;
    },
    durationText,
    { timeout: 2600 },
  );
  const nextDurationText = await durationNode.textContent();
  if (nextDurationText === durationText) {
    throw new Error(`运行中耗时没有按秒刷新：${durationText || ""}`);
  }

  await page.locator("#taskQueueToggleBtn").click();
  await page.waitForFunction(() => document.querySelector("#taskQueueToggleBtn")?.getAttribute("aria-expanded") === "false");
  await page.locator("#taskQueueToggleBtn").click();
  await page.waitForSelector("#taskQueuePanel");

  await page.locator(".left-job-card.is-running .left-job-actions button", { hasText: "中断" }).click();
  await page.waitForTimeout(100);
  const runningCountAfterCancel = await page.locator(".left-job-card.is-running").count();
  if (runningCountAfterCancel !== 0) {
    throw new Error(`中断点击后运行任务没有立即清空：${runningCountAfterCancel}`);
  }
  const canceledBadge = await page.locator(".left-job-card.is-canceled .left-job-badge").first().textContent();
  if (canceledBadge !== "已中断") {
    throw new Error(`中断点击后未立即进入已中断：${canceledBadge || ""}`);
  }
  await page.waitForTimeout(1400);
  const runningCountAfterSlowCancelResponse = await page.locator(".left-job-card.is-running").count();
  if (runningCountAfterSlowCancelResponse !== 0) {
    throw new Error(`中断接口慢返回后运行任务又闪回：${runningCountAfterSlowCancelResponse}`);
  }
  const canceledBadgeAfterSlowCancelResponse = await page.locator(".left-job-card.is-canceled .left-job-badge").first().textContent();
  if (canceledBadgeAfterSlowCancelResponse !== "已中断") {
    throw new Error(`中断接口慢返回后任务状态被覆盖：${canceledBadgeAfterSlowCancelResponse || ""}`);
  }

  state.providerModels = [
    { id: "image-capable-model", label: "image-capable-model", category: "image" },
    { id: "text-model", label: "text-model", category: "other" },
  ];
  await page.locator("#modelReloadBtn").click();
  await page.waitForSelector("#model option[value='text-model']", { state: "attached" });
  const modelGroupLabels = await page.locator("#model optgroup").evaluateAll((groups) => groups.map((group) => group.label));
  if (modelGroupLabels.join("|") !== "图片模型|其他模型") {
    throw new Error(`模型下拉没有按图片/其他分组：${modelGroupLabels.join("|")}`);
  }
  await page.selectOption("#model", "image-capable-model");
  await page.waitForFunction(() => !document.querySelector("#saveProviderBtn")?.hasAttribute("disabled"));
  await page.locator("#providerProfileSelect").click();
  await page.locator(".provider-profile-delete-btn").click();
  const deleteProfileDescription = await page.locator(".confirm-dialog-description").textContent();
  if (!deleteProfileDescription?.includes("确定删除配置「主配置」吗？删除后需要重新创建提供方配置。")) {
    throw new Error(`删除最后一个 API 配置确认文案未恢复旧版语义：${deleteProfileDescription || ""}`);
  }
  await page.locator(".confirm-dialog-cancel").click();

  state.jobs = [
    ...state.jobs,
    {
      id: "job-failed",
      status: "failed",
      workflow: "generate",
      prompt: "失败弹窗任务",
      count: 1,
      message: "本地执行失败",
      error: "auth_required: chat-requirements failed",
      created_at: new Date(now - 90000).toISOString(),
      updated_at: new Date().toISOString(),
      images: [],
    },
  ];
  await page.locator("#settingsToggleBtn").click();
  await page.locator("#refreshGalleryBtn").click();
  await page.waitForFunction(() => document.querySelector("#failurePopup")?.classList.contains("open"));
  const failurePrompt = await page.locator("#failurePopupPrompt").textContent();
  if (failurePrompt !== "失败弹窗任务") {
    throw new Error(`失败弹窗没有显示新增失败任务：${failurePrompt || ""}`);
  }
  const failureContent = await page.locator("#failurePopupContent").textContent();
  if (
    !failureContent?.includes("API上游原因失败") ||
    !failureContent.includes("本地后端：本地执行失败") ||
    !failureContent.includes("API上游：auth_required / chat-requirements failed") ||
    !failureContent.includes("error：auth_required: chat-requirements failed")
  ) {
    throw new Error(`失败弹窗没有显示旧版诊断信息：${failureContent || ""}`);
  }
  await page.locator("#failurePopupRetry").click();
  await page.waitForFunction(() => !document.querySelector("#failurePopup")?.classList.contains("open"));
  await page.waitForTimeout(450);
  const failurePopupOpenAfterRetry = await page.locator("#failurePopup").evaluate((node) => node.classList.contains("open"));
  if (failurePopupOpenAfterRetry) {
    throw new Error("失败弹窗重试后没有清理同一任务的弹窗队列。");
  }

  const leftTaskPrompts = await page.locator(".left-job-card .left-job-prompt").allTextContents();
  if (leftTaskPrompts.includes("只在图库分页中的任务")) {
    throw new Error("只存在于图库分页的任务不应出现在左侧任务列表中。");
  }
  const galleryOnlyDeleteButton = page.locator(".gallery-item[data-job-id='job-gallery-only'][data-image-slot='2'] .meta-actions button").last();
  await galleryOnlyDeleteButton.scrollIntoViewIfNeeded();
  const galleryOnlyDeleteText = await galleryOnlyDeleteButton.textContent();
  if (galleryOnlyDeleteText !== "删除") {
    throw new Error(`仅图库分页图片最后操作应为删除：${galleryOnlyDeleteText || ""}`);
  }
  await galleryOnlyDeleteButton.evaluate((button) => button.click());
  await page.waitForFunction(() => document.querySelector(".confirm-dialog-action")?.textContent?.trim() === "删除图片");
  const galleryOnlyDeleteDescription = await page.locator(".confirm-dialog-description").textContent();
  if (!galleryOnlyDeleteDescription?.includes("本次任务的其余 2 张图片会保留")) {
    throw new Error(`仅图库分页图片删除确认没有使用完整任务图片数：${galleryOnlyDeleteDescription || ""}`);
  }
  await page.locator(".confirm-dialog-action", { hasText: "删除图片" }).click();
  await page.waitForFunction(() => !document.querySelector(".gallery-item[data-job-id='job-gallery-only'][data-image-slot='2']"));
  const galleryOnlyRemainingSlots = await page.locator(".gallery-item[data-job-id='job-gallery-only']").evaluateAll((cards) => (
    cards.map((card) => card.getAttribute("data-image-slot")).sort()
  ));
  if (galleryOnlyRemainingSlots.join(",") !== "1,3") {
    throw new Error(`仅图库分页图片删除后剩余槽位错误：${galleryOnlyRemainingSlots.join(",")}`);
  }

  const completedGalleryDeleteButton = page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .meta-actions button").last();
  const completedGalleryDeleteText = await completedGalleryDeleteButton.textContent();
  if (completedGalleryDeleteText !== "删除") {
    throw new Error(`已完成图库卡片最后操作应为删除：${completedGalleryDeleteText || ""}`);
  }
  await completedGalleryDeleteButton.evaluate((button) => button.click());
  await page.waitForTimeout(100);
  const deleteImageDialogState = await page.evaluate(() => ({
    confirmText: document.querySelector(".confirm-dialog-action")?.textContent?.trim() || "",
    description: document.querySelector(".confirm-dialog-description")?.textContent?.trim() || "",
    status: document.querySelector("#status")?.textContent?.trim() || "",
    dialogCount: document.querySelectorAll(".confirm-dialog-action").length,
    completedCardCount: document.querySelectorAll(".gallery-item[data-job-id='job-completed']").length,
  }));
  if (deleteImageDialogState.confirmText !== "删除图片") {
    throw new Error(`点击已完成图库卡片删除后没有打开删除图片确认：${JSON.stringify(deleteImageDialogState)}`);
  }
  await page.locator(".confirm-dialog-action", { hasText: "删除图片" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".gallery-item[data-job-id='job-completed']").length === 1);

  if (await page.locator("#taskQueueToggleBtn").getAttribute("aria-expanded") !== "true") {
    await page.locator("#taskQueueToggleBtn").click();
    await page.waitForSelector("#taskQueuePanel");
  }
  const taskPanelVisible = await page.locator("#taskPanel .left-job-card").first().isVisible();
  if (!taskPanelVisible) {
    throw new Error("任务列表展开后任务内容应可见。");
  }
  await page.locator(".left-job-card.is-completed .gallery-del-btn").click();
  await page.locator(".confirm-dialog-action", { hasText: "删除任务" }).click();
  await page.waitForFunction(() => !document.querySelector(".left-job-card.is-completed"));
  await page.waitForFunction(() => !document.querySelector(".gallery-item[data-job-id='job-completed']"));
  await page.locator("#taskQueueToggleBtn").click();
  await page.waitForFunction(() => document.querySelector("#taskQueueToggleBtn")?.getAttribute("aria-expanded") === "false");
}
