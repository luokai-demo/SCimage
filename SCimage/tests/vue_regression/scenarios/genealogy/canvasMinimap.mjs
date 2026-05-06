export async function runGenealogyMinimapScenario(context, blankPanStart) {
  const { page } = context;
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

  const minimapPaintState = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("[data-minimap-node-id]")];
    const firstNodeStyle = nodes[0] ? getComputedStyle(nodes[0]) : null;
    const viewport = document.querySelector(".minimap-viewport");
    const viewportStyle = viewport ? getComputedStyle(viewport) : null;
    return {
      nodeCount: nodes.length,
      edgeCount: document.querySelectorAll("[data-minimap-edge]").length,
      firstNodeFill: firstNodeStyle?.fill || "",
      firstNodeStroke: firstNodeStyle?.stroke || "",
      viewportFill: viewportStyle?.fill || "",
      viewportStroke: viewportStyle?.stroke || "",
    };
  });
  if (
    minimapPaintState.nodeCount < 1 ||
    minimapPaintState.edgeCount < 1 ||
    isInvisibleMinimapPaint(minimapPaintState.firstNodeFill) ||
    isInvisibleMinimapPaint(minimapPaintState.firstNodeStroke) ||
    isInvisibleMinimapPaint(minimapPaintState.viewportStroke)
  ) {
    throw new Error(`族谱导航小地图没有渲染可见节点、连线和视口框：${JSON.stringify(minimapPaintState)}`);
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
}

function isInvisibleMinimapPaint(value) {
  return !value || value === "none" || value === "rgb(0, 0, 0)" || value === "rgba(0, 0, 0, 0)";
}
