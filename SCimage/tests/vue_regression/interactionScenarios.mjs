export async function runInitialWorkspaceAndGalleryScenario(context) {
  const { page, baseUrl } = context;
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("#galleryWindow");
  await page.waitForSelector(".left-task-card.is-running");
  const topTaskState = await page.evaluate(() => ({
    legacyTopTaskCount: document.querySelectorAll(".running-job-card, #runningBanner").length,
    headerTaskText: document.querySelector("#fsDirStatus")?.textContent?.trim() || "",
  }));
  if (topTaskState.legacyTopTaskCount !== 0 || topTaskState.headerTaskText) {
    throw new Error(`文生图顶部仍然显示任务信息：${JSON.stringify(topTaskState)}`);
  }
  await page.waitForSelector("#saveAsProviderBtn[disabled]");
  const initialPanelToggleLabel = await page.locator("#panelToggleBtn").getAttribute("aria-label");
  if (initialPanelToggleLabel !== "收起左侧工作区") {
    throw new Error(`左侧面板初始按钮文案错误：${initialPanelToggleLabel || ""}`);
  }
  await page.locator("#panelToggleBtn").click();
  await page.waitForFunction(() => document.querySelector("#panelToggleBtn")?.getAttribute("aria-label") === "展开左侧工作区");
  const collapsedPanelToggleTitle = await page.locator("#panelToggleBtn").getAttribute("title");
  if (collapsedPanelToggleTitle !== "展开左侧工作区") {
    throw new Error(`左侧面板收起后标题文案错误：${collapsedPanelToggleTitle || ""}`);
  }
  await page.locator("#panelToggleBtn").click();
  await page.waitForFunction(() => document.querySelector("#panelToggleBtn")?.getAttribute("aria-label") === "收起左侧工作区");
  await page.waitForSelector(".left-task-card.is-partial", { state: "attached" });
  const partialTaskActions = await page.locator(".left-task-card.is-partial .left-task-actions").textContent();
  if (partialTaskActions.includes("重试") || !partialTaskActions.includes("删除")) {
    throw new Error(`部分完成任务操作错误，应只允许删除不允许重试：${partialTaskActions}`);
  }
  const partialTaskMessage = await page.locator(".left-task-card.is-partial .left-task-message").textContent();
  if (!partialTaskMessage?.includes("API上游原因失败") || !partialTaskMessage.includes("auth_required / chat-requirements failed")) {
    throw new Error(`部分完成任务没有显示旧版诊断信息：${partialTaskMessage || ""}`);
  }

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

export async function runPromptLibraryEmptyScenario(context) {
  const { page } = context;
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  const generateEmptyLabel = (await page.locator("#savedPrompts").textContent())?.trim() || "";
  if (generateEmptyLabel !== "还没有保存的文生图提示词") {
    throw new Error(`文生图提示词库空态错误：${generateEmptyLabel}`);
  }
  await page.locator("#savePromptBtn").click();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "请先输入提示词。");
  const focusedAfterEmptySave = await page.evaluate(() => document.activeElement?.id || "");
  if (focusedAfterEmptySave !== "prompt") {
    throw new Error(`空提示词保存后没有聚焦提示词输入框：${focusedAfterEmptySave}`);
  }
  await page.locator("[data-workflow='image-to-image']").click();
  const imageWorkflowEmptyLabel = (await page.locator("#savedPrompts").textContent())?.trim() || "";
  if (imageWorkflowEmptyLabel !== "还没有保存的图生图提示词") {
    throw new Error(`图生图提示词库空态错误：${imageWorkflowEmptyLabel}`);
  }
  await page.locator("[data-workflow='generate']").click();
  await page.locator("#togglePromptBankBtn").click();
}

export async function runGenealogyCanvasScenario(context) {
  const { page, state, waitForCondition } = context;
  await page.locator("[data-workflow='image-to-image']").click();
  await page.getByRole("tab", { name: "当前族谱" }).click();
  await page.waitForSelector('[data-genealogy-node-id="genealogy-job:2"]');
  const initialNavigationState = await page.evaluate(() => ({
    minimapCount: document.querySelectorAll(".genealogy-minimap").length,
    navPressed: document.querySelector("#genealogyNavToggleBtn")?.getAttribute("aria-pressed") || "",
    navLabel: document.querySelector("#genealogyNavToggleBtn")?.getAttribute("aria-label") || "",
    currentLocatorCount: [...document.querySelectorAll(".canvas-tool-btn")]
      .filter((button) => button.getAttribute("aria-label") === "定位当前节点" || button.getAttribute("title") === "定位当前节点")
      .length,
  }));
  if (
    initialNavigationState.minimapCount !== 0 ||
    initialNavigationState.navPressed !== "false" ||
    initialNavigationState.navLabel !== "展开导航" ||
    initialNavigationState.currentLocatorCount !== 0
  ) {
    throw new Error(`族谱导航默认收起或定位当前按钮未清理：${JSON.stringify(initialNavigationState)}`);
  }
  const rootStrip = page.locator(".root-strip");
  const rootStripState = await rootStrip.evaluate((strip) => {
    strip.scrollLeft = 0;
    return {
      scrollLeft: strip.scrollLeft,
      scrollWidth: strip.scrollWidth,
      clientWidth: strip.clientWidth,
      activeRootId: document.querySelector(".root-chip.active")?.getAttribute("data-genealogy-root-id") || "",
    };
  });
  if (rootStripState.scrollWidth <= rootStripState.clientWidth || rootStripState.activeRootId !== "genealogy-job:1") {
    throw new Error(`族谱根图切换条测试前置失败：${JSON.stringify(rootStripState)}`);
  }
  const rootStripBox = await rootStrip.boundingBox();
  if (!rootStripBox) throw new Error("族谱根图切换条无法读取位置。");
  await page.mouse.move(rootStripBox.x + rootStripBox.width - 28, rootStripBox.y + rootStripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rootStripBox.x + 28, rootStripBox.y + rootStripBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => (document.querySelector(".root-strip")?.scrollLeft || 0) > 120);
  const rootStripAfterDrag = await rootStrip.evaluate((strip) => ({
    scrollLeft: strip.scrollLeft,
    activeRootId: document.querySelector(".root-chip.active")?.getAttribute("data-genealogy-root-id") || "",
  }));
  if (rootStripAfterDrag.activeRootId !== "genealogy-job:1") {
    throw new Error(`族谱根图切换条拖动后误触发切换：${JSON.stringify(rootStripAfterDrag)}`);
  }
  const genealogyWireGeometry = await page.locator('[data-genealogy-edge-kind="wire"][data-genealogy-edge-to="genealogy-job:2"]').evaluate((edge) => {
    const path = edge.getAttribute("d") || "";
    const match = path.match(/^M\s+([-\d.]+)\s+([-\d.]+)\s+C\s+[-\d.]+\s+[-\d.]+,\s+[-\d.]+\s+[-\d.]+,\s+([-\d.]+)\s+([-\d.]+)$/);
    const fromNode = document.querySelector('[data-genealogy-node-id="genealogy-job:1"]');
    const toNode = document.querySelector('[data-genealogy-node-id="genealogy-job:2"]');
    const fromPort = fromNode?.querySelector(".node-port-out");
    const toPort = toNode?.querySelector(".node-port-in");
    const toTitlebar = toNode?.querySelector(".genealogy-node-titlebar");
    const marker = document.querySelector("#genealogyArrow");
    const portCenterY = (node, port) => {
      const nodeY = Number(node?.getAttribute("data-genealogy-y") || 0);
      const nodeRect = node?.getBoundingClientRect();
      const portRect = port?.getBoundingClientRect();
      if (!nodeRect || !portRect) return 0;
      return nodeY + portRect.top - nodeRect.top + portRect.height / 2;
    };
    return {
      path,
      fromPathY: Number(match?.[2] || Number.NaN),
      toPathY: Number(match?.[4] || Number.NaN),
      fromPortCenterY: portCenterY(fromNode, fromPort),
      toPortCenterY: portCenterY(toNode, toPort),
      toTitlebarBottomY: Number(toNode?.getAttribute("data-genealogy-y") || 0) + (toTitlebar?.getBoundingClientRect().height || 0),
      markerUnits: marker?.getAttribute("markerUnits") || "",
      markerWidth: marker?.getAttribute("markerWidth") || "",
    };
  });
  if (
    Math.abs(genealogyWireGeometry.fromPathY - genealogyWireGeometry.fromPortCenterY) > 0.5 ||
    Math.abs(genealogyWireGeometry.toPathY - genealogyWireGeometry.toPortCenterY) > 0.5 ||
    genealogyWireGeometry.toPathY <= genealogyWireGeometry.toTitlebarBottomY + 10 ||
    genealogyWireGeometry.markerUnits !== "userSpaceOnUse" ||
    genealogyWireGeometry.markerWidth !== "8"
  ) {
    throw new Error(`族谱连线箭头没有对齐端口中心：${JSON.stringify(genealogyWireGeometry)}`);
  }
  const draggableNode = page.locator('[data-genealogy-node-id="genealogy-job:2"]');
  const beforeDragBox = await draggableNode.boundingBox();
  if (!beforeDragBox) throw new Error("族谱节点拖拽前无法读取位置。");
  state.genealogyImageSlots = [1, 2, 3];
  await page.locator(".genealogy-icon-btn").click();
  await page.waitForSelector('[data-genealogy-node-id="genealogy-job:3"]');
  const initialPositions = await page.locator("[data-genealogy-node-id]").evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute("data-genealogy-node-id"),
    x: Number(node.getAttribute("data-genealogy-x")),
    y: Number(node.getAttribute("data-genealogy-y")),
  })));
  const duplicateInitialPositions = new Set();
  initialPositions.forEach((position, index) => {
    initialPositions.slice(index + 1).forEach((other) => {
      const overlaps = (
        Math.abs(position.x - other.x) < 168 &&
        Math.abs(position.y - other.y) < 208
      );
      if (overlaps) duplicateInitialPositions.add(`${position.id}/${other.id}`);
    });
  });
  if (duplicateInitialPositions.size) {
    throw new Error(`族谱默认布局存在节点重叠：${JSON.stringify({ initialPositions, overlaps: [...duplicateInitialPositions] })}`);
  }
  state.genealogyImageSlots = [1, 2];
  await page.locator(".genealogy-icon-btn").click();
  await page.waitForSelector('[data-genealogy-node-id="genealogy-job:2"]');
  const dragTarget = await page.evaluate(() => genealogyDragTarget({
    nodeSelector: '[data-genealogy-node-id="genealogy-job:2"]',
    desiredX: 28,
    desiredY: 316,
  }));
  if (!dragTarget) throw new Error("族谱节点拖拽目标无法计算。");
  state.genealogyGraphStalePositionSnapshot = { ...state.genealogyPositions };
  await page.mouse.move(dragTarget.startClientX, dragTarget.startClientY);
  await page.mouse.down();
  await page.mouse.move(dragTarget.endClientX, dragTarget.endClientY, { steps: 10 });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(120);
  await page.mouse.up();
  const dragDebugState = await page.locator('[data-genealogy-node-id="genealogy-job:2"]').evaluate((node) => ({
    className: node.className,
    x: Number(node.getAttribute("data-genealogy-x")),
    y: Number(node.getAttribute("data-genealogy-y")),
  }));
  await waitForCondition(
    () => {
      const position = state.genealogyPositions["genealogy-job:2"];
      return Boolean(
        position &&
        Math.abs(position.x - dragTarget.desiredX) <= 1 &&
        Math.abs(position.y - dragTarget.desiredY) <= 1
      );
    },
    `族谱节点没有保存到可视落点：${JSON.stringify({ target: dragTarget, saved: state.genealogyPositions["genealogy-job:2"], dragDebugState })}`,
  );
  const rootPositionDuringDrag = await page.locator('[data-genealogy-node-id="genealogy-job:1"]').evaluate((node) => ({
    x: Number(node.getAttribute("data-genealogy-x")),
    y: Number(node.getAttribute("data-genealogy-y")),
  }));
  if (state.genealogyPositions["genealogy-job:2"].x >= rootPositionDuringDrag.x) {
    throw new Error(`自由画布节点仍被限制在根图右侧：${JSON.stringify({ rootPositionDuringDrag, child: state.genealogyPositions["genealogy-job:2"] })}`);
  }
  const savedPosition = { ...state.genealogyPositions["genealogy-job:2"] };
  const afterDragPosition = await draggableNode.evaluate((node) => ({
    x: Number(node.getAttribute("data-genealogy-x")),
    y: Number(node.getAttribute("data-genealogy-y")),
  }));
  const afterDragVisualPosition = await draggableNode.evaluate((node) => {
    const viewport = document.querySelector(".tree-viewport");
    const nodeRect = node.getBoundingClientRect();
    const viewportRect = viewport?.getBoundingClientRect();
    return {
      x: viewport && viewportRect ? Math.round(nodeRect.left - viewportRect.left + viewport.scrollLeft) : 0,
      y: viewport && viewportRect ? Math.round(nodeRect.top - viewportRect.top + viewport.scrollTop) : 0,
    };
  });
  if (
    Math.abs(afterDragPosition.x - savedPosition.x) > 1 ||
    Math.abs(afterDragPosition.y - savedPosition.y) > 1 ||
    Math.abs(afterDragVisualPosition.x - savedPosition.x) > 1 ||
    Math.abs(afterDragVisualPosition.y - savedPosition.y) > 1
  ) {
    throw new Error(`族谱节点拖动后没有停在保存落点：${JSON.stringify({ afterDragPosition, afterDragVisualPosition, savedPosition })}`);
  }
  await page.locator(".genealogy-icon-btn").click();
  await page.waitForFunction(
    ({ x, y }) => {
      const node = document.querySelector('[data-genealogy-node-id="genealogy-job:2"]');
      const viewport = document.querySelector(".tree-viewport");
      if (!node) return false;
      const nodeRect = node.getBoundingClientRect();
      const viewportRect = viewport?.getBoundingClientRect();
      const visualX = viewport && viewportRect ? Math.round(nodeRect.left - viewportRect.left + viewport.scrollLeft) : 0;
      const visualY = viewport && viewportRect ? Math.round(nodeRect.top - viewportRect.top + viewport.scrollTop) : 0;
      return (
        Math.abs(Number(node.getAttribute("data-genealogy-x")) - x) <= 1 &&
        Math.abs(Number(node.getAttribute("data-genealogy-y")) - y) <= 1 &&
        Math.abs(visualX - x) <= 1 &&
        Math.abs(visualY - y) <= 1
      );
    },
    savedPosition,
  );
  await page.evaluate(() => {
    const viewport = document.querySelector(".tree-viewport");
    if (viewport) {
      viewport.scrollTo({ left: 0, top: 0, behavior: "instant" });
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  });
  await page.waitForTimeout(80);
  const blankPanStart = await page.evaluate(() => {
    const viewport = document.querySelector(".tree-viewport");
    if (!viewport) return null;
    viewport.scrollTo({ left: 180, top: 180, behavior: "instant" });
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    const rect = viewport.getBoundingClientRect();
    const candidates = [
      { x: rect.left + rect.width * 0.42, y: rect.top + rect.height * 0.72 },
      { x: rect.left + rect.width * 0.34, y: rect.top + rect.height * 0.62 },
      { x: rect.left + rect.width * 0.52, y: rect.top + rect.height * 0.78 },
    ];
    const point = candidates.find((candidate) => {
      const element = document.elementFromPoint(candidate.x, candidate.y);
      if (!element || !viewport.contains(element)) return false;
      return !element.closest("[data-genealogy-node-id], button, a, input, textarea, select, [role='button']");
    });
    return point ? {
      ...point,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    } : null;
  });
  if (!blankPanStart || blankPanStart.scrollLeft < 80 || blankPanStart.scrollTop < 80) {
    throw new Error(`族谱空白拖动视野测试前置失败：${JSON.stringify(blankPanStart)}`);
  }
  await page.mouse.move(blankPanStart.x, blankPanStart.y);
  await page.mouse.down();
  await page.mouse.move(blankPanStart.x + 86, blankPanStart.y + 74, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    ({ left, top }) => {
      const viewport = document.querySelector(".tree-viewport");
      return Boolean(viewport && viewport.scrollLeft < left - 35 && viewport.scrollTop < top - 35);
    },
    { left: blankPanStart.scrollLeft, top: blankPanStart.scrollTop },
  );
  const blankPanEnd = await page.evaluate(() => {
    const viewport = document.querySelector(".tree-viewport");
    return {
      scrollLeft: viewport?.scrollLeft || 0,
      scrollTop: viewport?.scrollTop || 0,
      activeNodeId: document.querySelector(".genealogy-node.active")?.getAttribute("data-genealogy-node-id") || "",
    };
  });
  if (blankPanEnd.activeNodeId !== "genealogy-job:2") {
    throw new Error(`族谱空白拖动视野时误选中了节点：${JSON.stringify(blankPanEnd)}`);
  }
  await page.evaluate(() => {
    const viewport = document.querySelector(".tree-viewport");
    if (viewport) {
      viewport.scrollTo({ left: 0, top: 0, behavior: "instant" });
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  });
  await page.waitForTimeout(80);
  await page.locator("#genealogyNavToggleBtn").click();
  await page.waitForSelector(".genealogy-minimap");
  const openedNavigationState = await page.evaluate(() => ({
    navPressed: document.querySelector("#genealogyNavToggleBtn")?.getAttribute("aria-pressed") || "",
    heading: document.querySelector(".minimap-head > span")?.textContent?.trim() || "",
    status: document.querySelector(".minimap-status")?.textContent?.trim() || "",
    internalActionCount: document.querySelectorAll(".minimap-actions, .minimap-icon-btn").length,
  }));
  if (
    openedNavigationState.navPressed !== "true" ||
    openedNavigationState.heading !== "导航" ||
    !openedNavigationState.status.includes("节点") ||
    openedNavigationState.internalActionCount !== 0
  ) {
    throw new Error(`族谱导航展开状态或内部按钮错误：${JSON.stringify(openedNavigationState)}`);
  }
  const minimapRootPoint = await page.locator('[data-minimap-node-id="genealogy-job:1"]').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  });
  const minimapRootHitState = await page.evaluate(({ x, y }) => {
    const topElement = document.elementFromPoint(x, y);
    const viewportElement = document.querySelector(".minimap-viewport");
    return {
      topTag: topElement?.tagName || "",
      topClass: topElement?.getAttribute("class") || "",
      topIsOverlay: topElement?.getAttribute("data-minimap-interaction-overlay") === "true",
      viewportContainsPoint: Boolean(viewportElement && (() => {
        const rect = viewportElement.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      })()),
    };
  }, minimapRootPoint);
  if (!minimapRootHitState.topIsOverlay || !minimapRootHitState.viewportContainsPoint) {
    throw new Error(`族谱小地图测试前置失败，根图点没有被视野框覆盖且由交互层接管：${JSON.stringify(minimapRootHitState)}`);
  }
  await page.mouse.click(minimapRootPoint.x, minimapRootPoint.y);
  await page.waitForFunction(() => document.querySelector('[data-genealogy-node-id="genealogy-job:1"]')?.classList.contains("active"));
  const rootSelectedText = await page.locator(".node-inspector").textContent();
  if (!rootSelectedText?.includes("族谱根图")) {
    throw new Error(`点击视野框覆盖区域内的小地图节点没有选中该节点：${rootSelectedText || ""}`);
  }
  await page.mouse.click(blankPanStart.x, blankPanStart.y);
  await page.waitForFunction(() => !document.querySelector(".genealogy-minimap"));
  const closedNavigationState = await page.locator("#genealogyNavToggleBtn").getAttribute("aria-pressed");
  if (closedNavigationState !== "false") {
    throw new Error(`点击导航外部后没有收起导航：aria-pressed=${closedNavigationState || ""}`);
  }
  await page.locator('[data-genealogy-node-id="genealogy-job:2"]').click();
  const genealogyDeleteButton = page.locator(".node-inspector .genealogy-tool-btn.is-danger");
  await genealogyDeleteButton.click();
  await page.waitForFunction(() => document.querySelector(".confirm-dialog-action")?.textContent?.trim() === "删除图片");
  const genealogyDeleteDescription = await page.locator(".confirm-dialog-description").textContent();
  if (!genealogyDeleteDescription?.includes("本次任务的其余 1 张图片会保留")) {
    throw new Error(`族谱删除图片确认没有使用节点快照图片数：${genealogyDeleteDescription || ""}`);
  }
  await page.locator(".confirm-dialog-action", { hasText: "删除图片" }).click();
  await page.waitForFunction(() => !document.querySelector('[data-genealogy-node-id="genealogy-job:2"]'));

  state.genealogyImageSlots = Array.from({ length: 160 }, (_, index) => index + 1);
  await page.locator(".genealogy-icon-btn").click();
  await page.locator("#genealogyNavToggleBtn").click();
  await page.waitForSelector(".genealogy-minimap");
  await page.waitForFunction(() => document.querySelectorAll("[data-minimap-node-id]").length > 40);
  const minimapBudgetState = await page.evaluate(() => ({
    nodeCount: document.querySelectorAll("[data-minimap-node-id]").length,
    edgeCount: document.querySelectorAll("[data-minimap-edge]").length,
    status: document.querySelector(".minimap-status")?.textContent?.trim() || "",
  }));
  if (minimapBudgetState.nodeCount > 100 || minimapBudgetState.edgeCount > 140 || !minimapBudgetState.status.includes("/160")) {
    throw new Error(`族谱导航地图没有按大图谱抽样渲染：${JSON.stringify(minimapBudgetState)}`);
  }
  state.genealogyImageSlots = [1, 2];
  await page.locator("[data-workflow='generate']").click();
}

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
  await page.waitForSelector(".gallery-task-section");
  const runningTaskSection = page.locator(".gallery-task-section", { hasText: "正在生成的任务" }).first();
  const runningTaskTitle = await runningTaskSection.locator(".gallery-task-section-title").textContent();
  const runningTaskSummary = await runningTaskSection.locator(".gallery-task-section-summary").textContent();
  const runningTaskMeta = await runningTaskSection.locator(".gallery-task-section-meta").textContent();
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
  const completedPromptSection = page.locator(".gallery-task-section", { hasText: "可删除的任务" }).first();
  const completedPromptMeta = await completedPromptSection.locator(".gallery-task-section-meta").textContent();
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

export async function runProviderWorkflowScenario(context) {
  const { page, state } = context;
  const invalidModelHint = await page.locator("#modelStatusHint").textContent();
  if (invalidModelHint !== "当前已保存模型不在该 API 支持列表中，请重新选择。") {
    throw new Error(`已保存模型不受支持时提示错误：${invalidModelHint || ""}`);
  }
  const saveAsTitleBeforeModelSelect = await page.locator("#saveAsProviderBtn").getAttribute("title");
  if (saveAsTitleBeforeModelSelect !== "当前已保存模型不在该 API 支持列表中，请重新选择。") {
    throw new Error(`未阻止保存不受支持模型：${saveAsTitleBeforeModelSelect || ""}`);
  }

  await page.selectOption("#model", "supported-model");
  await page.waitForFunction(() => !document.querySelector("#saveAsProviderBtn")?.hasAttribute("disabled"));

  await page.fill("#baseUrl", "http://127.0.0.1:18081/v1");
  await page.waitForFunction(() => document.querySelector("#saveAsProviderBtn")?.hasAttribute("disabled"));
  const staleModelHint = await page.locator("#modelStatusHint").textContent();
  if (staleModelHint !== "连接信息已变化，请先拉取模型") {
    throw new Error(`连接变化后模型列表未标记为过期：${staleModelHint || ""}`);
  }

  state.providerModels = [{ id: "fresh-model", label: "fresh-model", category: "image" }];
  await page.locator("#modelReloadBtn").click();
  await page.waitForSelector("#model option[value='fresh-model']", { state: "attached" });
  const imageModelGroupLabel = await page.locator("#model optgroup").first().getAttribute("label");
  if (imageModelGroupLabel !== "图片模型") {
    throw new Error(`模型下拉没有恢复图片模型分组：${imageModelGroupLabel || ""}`);
  }
  const readyModelHint = await page.locator("#modelStatusHint").textContent();
  if (readyModelHint !== "当前已保存模型不在该 API 支持列表中，请重新选择。") {
    throw new Error(`重新拉取但未选择模型时提示错误：${readyModelHint || ""}`);
  }
  await page.selectOption("#model", "fresh-model");
  await page.waitForFunction(() => !document.querySelector("#saveAsProviderBtn")?.hasAttribute("disabled"));

  await page.selectOption("#providerCompatProfile", "text-only");
  await page.waitForFunction(() => document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
  await page.waitForSelector("#quality option[value='hd']", { state: "attached" });
  await page.selectOption("#quality", "hd");
  await page.waitForSelector("#size option[value='1440x2560']", { state: "attached" });
  await page.selectOption("#size", "1440x2560");
  await page.fill("#prompt", "跨输出档位套用提示词");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  await page.locator("#savePromptBtn").click();
  await page.waitForFunction(() => (
    [...document.querySelectorAll(".prompt-bank-item .prompt-text")]
      .some((node) => node.textContent === "跨输出档位套用提示词")
  ));
  await page.locator(".prompt-library-close").click();

  await page.selectOption("#providerCompatProfile", "openai");
  await page.waitForFunction(() => !document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
  await page.waitForSelector("#quality option[value='low']", { state: "attached" });
  await page.selectOption("#quality", "low");
  await page.selectOption("#size", "1:1");
  await page.fill("#prompt", "套用前占位");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  await page.locator(".prompt-bank-item", { hasText: "跨输出档位套用提示词" }).locator("button", { hasText: "套用" }).click();
  await page.waitForFunction(() => document.querySelector("#prompt")?.value === "跨输出档位套用提示词");
  const appliedPromptOutput = await page.evaluate(() => {
    const quality = document.querySelector("#quality");
    const size = document.querySelector("#size");
    return {
      quality: quality?.value || "",
      size: size?.value || "",
      qualityValid: Boolean(quality && [...quality.options].some((option) => option.value === quality.value)),
      sizeValid: Boolean(size && [...size.options].some((option) => option.value === size.value)),
    };
  });
  if (
    appliedPromptOutput.quality !== "medium" ||
    appliedPromptOutput.size !== "9:16" ||
    !appliedPromptOutput.qualityValid ||
    !appliedPromptOutput.sizeValid
  ) {
    throw new Error(`跨输出档位套用提示词没有按当前兼容模式规范下拉值：${JSON.stringify(appliedPromptOutput)}`);
  }

  state.providerCompatProfiles = [
    { id: "openai", label: "OpenAI", output_profile_id: "aspect_v1", supports_image_to_image: false },
    { id: "text-only", label: "Text only", output_profile_id: "pixel_v1", supports_image_to_image: false },
  ];
  await page.locator("#saveProviderBtn").click();
  await page.waitForFunction(() => document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
  await page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .meta-actions button", { hasText: "参考" }).click({ force: true });
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "当前提供方配置不支持图生图。");
  const disabledWorkflowAfterReference = await page.locator(".workflow-tab.active").textContent();
  const disabledSourcePreviewCount = await page.locator(".source-preview-item").count();
  if (disabledWorkflowAfterReference !== "文生图" || disabledSourcePreviewCount !== 0) {
    throw new Error(`不支持图生图时仍然加入了参考图或切换了工作流：workflow=${disabledWorkflowAfterReference || ""}, sources=${disabledSourcePreviewCount}`);
  }
  state.providerCompatProfiles = [
    { id: "openai", label: "OpenAI", output_profile_id: "aspect_v1", supports_image_to_image: true },
    { id: "text-only", label: "Text only", output_profile_id: "pixel_v1", supports_image_to_image: false },
  ];
  await page.locator("#saveProviderBtn").click();
  await page.waitForFunction(() => !document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
}

export async function runTaskLifecycleScenario(context) {
  const { page, state, now } = context;
  const durationNode = page.locator(".left-task-card.is-running .left-task-meta span").filter({ hasText: /分钟\d+秒/ }).first();
  const durationText = await durationNode.textContent();
  if (!durationText || !/\d+分钟\d+秒/.test(durationText)) {
    throw new Error(`运行中耗时没有显示秒：${durationText || ""}`);
  }
  await page.waitForFunction(
    (text) => {
      const nextText = [...document.querySelectorAll(".left-task-card.is-running .left-task-meta span")]
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

  await page.locator(".task-panel-header").click();
  await page.waitForFunction(() => !document.querySelector(".task-panel")?.hasAttribute("open"));
  await page.locator(".task-panel-header").click();
  await page.waitForFunction(() => document.querySelector(".task-panel")?.hasAttribute("open"));

  await page.locator(".left-task-card.is-running .left-task-actions button", { hasText: "中断" }).click();
  await page.waitForTimeout(100);
  const runningCountAfterCancel = await page.locator(".left-task-card.is-running").count();
  if (runningCountAfterCancel !== 0) {
    throw new Error(`中断点击后运行任务没有立即清空：${runningCountAfterCancel}`);
  }
  const canceledBadge = await page.locator(".left-task-card.is-canceled .left-task-badge").first().textContent();
  if (canceledBadge !== "已中断") {
    throw new Error(`中断点击后未立即进入已中断：${canceledBadge || ""}`);
  }
  await page.waitForTimeout(1400);
  const runningCountAfterSlowCancelResponse = await page.locator(".left-task-card.is-running").count();
  if (runningCountAfterSlowCancelResponse !== 0) {
    throw new Error(`中断接口慢返回后运行任务又闪回：${runningCountAfterSlowCancelResponse}`);
  }
  const canceledBadgeAfterSlowCancelResponse = await page.locator(".left-task-card.is-canceled .left-task-badge").first().textContent();
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

  const leftTaskPrompts = await page.locator(".left-task-card .left-task-prompt").allTextContents();
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

  const taskPanelWasOpen = await page.locator(".task-panel").evaluate((panel) => panel.hasAttribute("open"));
  if (!taskPanelWasOpen) {
    await page.locator(".task-panel-header").click();
  }
  await page.locator(".left-task-card.is-completed .gallery-del-btn").click();
  await page.locator(".confirm-dialog-action", { hasText: "删除任务" }).click();
  await page.waitForFunction(() => !document.querySelector(".left-task-card.is-completed"));
  await page.waitForFunction(() => !document.querySelector(".gallery-item[data-job-id='job-completed']"));
}

export async function runLegacyWorkspaceScenario(context) {
  const { page, state, now } = context;
  state.workspaceStatePayload = {
    active_workflow: "generate",
    forms: {
      generate: { prompt: "", size: "auto", quality: "auto", count: "1" },
      "image-to-image": { prompt: "", size: "auto", quality: "auto", count: "1" },
    },
    prompt_bank: {
      generate: [
        {
          id: "legacy-aspect-pixel-size",
          workflow: "generate",
          prompt: "旧版像素尺寸提示词",
          outputProfileId: "aspect_v1",
          size: "1024x1024",
          quality: "low",
          count: 1,
          createdAt: new Date(now - 120000).toISOString(),
          updatedAt: new Date(now - 120000).toISOString(),
        },
      ],
      "image-to-image": [],
    },
  };
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#galleryWindow");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  const legacyAspectSummary = await page.locator(".prompt-bank-item", { hasText: "旧版像素尺寸提示词" }).locator(".prompt-meta").first().textContent();
  if (!legacyAspectSummary?.includes("尺寸 1:1 方形 · 1024x1024")) {
    throw new Error(`旧版 aspect_v1 像素尺寸摘要没有保留像素值：${legacyAspectSummary || ""}`);
  }
}
