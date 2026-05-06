export async function runGenealogyNodeDragScenario(context) {
  const { page, state, waitForCondition } = context;
  const draggableNode = page.locator('[data-genealogy-node-id="genealogy-job:2"]');
  const beforeDragBox = await draggableNode.boundingBox();
  if (!beforeDragBox) throw new Error("族谱节点拖拽前无法读取位置。");

  state.genealogyImageSlots = [1, 2, 3];
  await page.locator(".genealogy-icon-btn").click();
  await page.waitForSelector('[data-genealogy-node-id="genealogy-job:3"]');
  await verifyInitialLayoutHasNoOverlap(page);

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

  await verifyNodeCanMoveLeftOfRoot(page, state);
  await verifySavedNodePositionSurvivesRefresh(page, draggableNode, state.genealogyPositions["genealogy-job:2"]);
  return verifyBlankCanvasPan(page);
}

async function verifyInitialLayoutHasNoOverlap(page) {
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
}

async function verifyNodeCanMoveLeftOfRoot(page, state) {
  const rootPositionDuringDrag = await page.locator('[data-genealogy-node-id="genealogy-job:1"]').evaluate((node) => ({
    x: Number(node.getAttribute("data-genealogy-x")),
    y: Number(node.getAttribute("data-genealogy-y")),
  }));
  if (state.genealogyPositions["genealogy-job:2"].x >= rootPositionDuringDrag.x) {
    throw new Error(`自由画布节点仍被限制在根图右侧：${JSON.stringify({ rootPositionDuringDrag, child: state.genealogyPositions["genealogy-job:2"] })}`);
  }
}

async function verifySavedNodePositionSurvivesRefresh(page, draggableNode, savedPosition) {
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
}

async function verifyBlankCanvasPan(page) {
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
      canPanX: viewport.scrollWidth > viewport.clientWidth + 40,
      canPanY: viewport.scrollHeight > viewport.clientHeight + 40,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    } : null;
  });
  if (
    !blankPanStart ||
    (blankPanStart.canPanX && blankPanStart.scrollLeft < 80) ||
    (blankPanStart.canPanY && blankPanStart.scrollTop < 80) ||
    (!blankPanStart.canPanX && !blankPanStart.canPanY)
  ) {
    throw new Error(`族谱空白拖动视野测试前置失败：${JSON.stringify(blankPanStart)}`);
  }

  await page.mouse.move(blankPanStart.x, blankPanStart.y);
  await page.mouse.down();
  await page.mouse.move(
    blankPanStart.x + (blankPanStart.canPanX ? 86 : 0),
    blankPanStart.y + (blankPanStart.canPanY ? 74 : 0),
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForFunction(
    ({ canPanX, canPanY, left, top }) => {
      const viewport = document.querySelector(".tree-viewport");
      return Boolean(viewport && (
        (!canPanX || viewport.scrollLeft < left - 35) &&
        (!canPanY || viewport.scrollTop < top - 35)
      ));
    },
    {
      canPanX: blankPanStart.canPanX,
      canPanY: blankPanStart.canPanY,
      left: blankPanStart.scrollLeft,
      top: blankPanStart.scrollTop,
    },
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
  return blankPanStart;
}
