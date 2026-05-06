export async function runGenealogyDeleteAndBudgetScenario(context) {
  const { page, state } = context;
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
