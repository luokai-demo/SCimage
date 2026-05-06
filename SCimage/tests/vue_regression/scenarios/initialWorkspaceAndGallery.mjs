export async function runInitialWorkspaceAndGalleryScenario(context) {
  const { page, baseUrl } = context;
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#galleryWindow");
  await page.waitForSelector("#taskQueueToggleBtn[aria-expanded='false']");
  await page.locator("#taskQueueToggleBtn").click();
  await page.waitForSelector("#taskQueuePanel");
  await page.waitForSelector(".left-job-card.is-running");
  const topTaskState = await page.evaluate(() => ({
    legacyTopTaskCount: document.querySelectorAll(".running-job-card, #runningBanner").length,
    headerTaskText: document.querySelector("#fsDirStatus")?.textContent?.trim() || "",
  }));
  if (topTaskState.legacyTopTaskCount !== 0 || topTaskState.headerTaskText) {
    throw new Error(`文生图顶部仍然显示任务信息：${JSON.stringify(topTaskState)}`);
  }
  await page.waitForSelector("#saveAsProviderBtn[disabled]");
  const initialPanelToggleLabel = await page.locator("#panelToggleBtn").getAttribute("aria-label");
  if (initialPanelToggleLabel !== "收起输入工作区") {
    throw new Error(`左侧面板初始按钮文案错误：${initialPanelToggleLabel || ""}`);
  }
  await page.locator("#panelToggleBtn").click();
  await page.waitForFunction(() => document.querySelector("#panelToggleBtn")?.getAttribute("aria-label") === "展开输入工作区");
  const collapsedPanelToggleTitle = await page.locator("#panelToggleBtn").getAttribute("title");
  if (collapsedPanelToggleTitle !== "展开输入工作区") {
    throw new Error(`左侧面板收起后标题文案错误：${collapsedPanelToggleTitle || ""}`);
  }
  await page.locator("#panelToggleBtn").click();
  await page.waitForFunction(() => document.querySelector("#panelToggleBtn")?.getAttribute("aria-label") === "收起输入工作区");
  await page.waitForSelector(".left-job-card.is-partial", { state: "attached" });
  const partialTaskActions = await page.locator(".left-job-card.is-partial .left-job-actions").textContent();
  if (partialTaskActions.includes("重试") || !partialTaskActions.includes("删除")) {
    throw new Error(`部分完成任务操作错误，应只允许删除不允许重试：${partialTaskActions}`);
  }
  const partialTaskMessage = await page.locator(".left-job-card.is-partial .left-job-message").textContent();
  if (!partialTaskMessage?.includes("API上游原因失败") || !partialTaskMessage.includes("auth_required / chat-requirements failed")) {
    throw new Error(`部分完成任务没有显示旧版诊断信息：${partialTaskMessage || ""}`);
  }
  await page.locator("#taskQueueToggleBtn").click();
  await page.waitForFunction(() => document.querySelector("#taskQueueToggleBtn")?.getAttribute("aria-expanded") === "false");

  const portraitCard = page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1']");
  await portraitCard.scrollIntoViewIfNeeded();
  await portraitCard.locator(".gallery-image").waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const image = document.querySelector(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .gallery-image");
    return image && image.complete && image.naturalWidth > 0;
  });
  const cardLayout = await portraitCard.evaluate((card) => {
    const image = card.querySelector(".gallery-image");
    const cardRect = card.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    return {
      className: card.className,
      hasLegacyLazyImage: Boolean(card.querySelector("img[data-src]")),
      isVirtualized: Boolean(card.closest(".gallery-grid.is-virtualized")),
      hasMasonryProfile: card.classList.contains("has-masonry-profile"),
      wrapperPosition: window.getComputedStyle(card.parentElement).position,
      cardHeight: cardRect.height,
      imageHeight: imageRect?.height || 0,
      topDelta: imageRect ? Math.abs(imageRect.top - cardRect.top) : 999,
      heightDelta: imageRect ? Math.abs(imageRect.height - cardRect.height) : 999,
    };
  });
  if (
    cardLayout.hasLegacyLazyImage ||
    !cardLayout.isVirtualized ||
    !cardLayout.hasMasonryProfile ||
    cardLayout.wrapperPosition !== "absolute" ||
    /\bis-(loading|loaded|error)\b/.test(cardLayout.className) ||
    cardLayout.topDelta > 1 ||
    cardLayout.heightDelta > 2 ||
    cardLayout.imageHeight < 120
  ) {
    throw new Error(`图库卡片仍有旧懒加载/占位布局残留：${JSON.stringify(cardLayout)}`);
  }
}
