export async function prepareGenealogyCanvas(context) {
  const { page } = context;
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

  await verifyRootStripDrag(page);
  await verifyWireGeometry(page);
  await verifyRuntimePushRefreshesGraph(context);
}

async function verifyRootStripDrag(page) {
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

  const targetRootId = "genealogy-extra-root:4";
  const targetChip = page.locator(`[data-genealogy-root-id="${targetRootId}"]`);
  await targetChip.scrollIntoViewIfNeeded();
  await targetChip.click();
  await page.waitForFunction((rootId) => (
    document.querySelector(".root-chip.active")?.getAttribute("data-genealogy-root-id") === rootId
  ), targetRootId);

  const rootStripAfterClick = await rootStrip.evaluate(() => ({
    activeRootId: document.querySelector(".root-chip.active")?.getAttribute("data-genealogy-root-id") || "",
  }));
  if (rootStripAfterClick.activeRootId !== targetRootId) {
    throw new Error(`族谱根图切换条点击没有切换族谱：${JSON.stringify(rootStripAfterClick)}`);
  }

  const initialRootId = "genealogy-job:1";
  const initialChip = page.locator(`[data-genealogy-root-id="${initialRootId}"]`);
  await initialChip.scrollIntoViewIfNeeded();
  await initialChip.click();
  await page.waitForFunction((rootId) => (
    document.querySelector(".root-chip.active")?.getAttribute("data-genealogy-root-id") === rootId
  ), initialRootId);
}

async function verifyWireGeometry(page) {
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
}

async function verifyRuntimePushRefreshesGraph(context) {
  const { page, state } = context;
  state.genealogyImageSlots = [1, 2, 4];
  await page.evaluate(() => window.__emitRuntimeUpdate?.("genealogy-push-test"));
  await page.waitForSelector('[data-genealogy-node-id="genealogy-job:4"]');

  const pushedNodeText = await page.locator('[data-genealogy-node-id="genealogy-job:4"]').textContent();
  if (!pushedNodeText?.includes("族谱第 4 张")) {
    throw new Error(`族谱图谱没有响应运行时推送刷新：${pushedNodeText || ""}`);
  }

  state.genealogyImageSlots = [1, 2];
  await page.evaluate(() => window.__emitRuntimeUpdate?.("genealogy-push-reset"));
  await page.waitForFunction(() => !document.querySelector('[data-genealogy-node-id="genealogy-job:4"]'));
}
