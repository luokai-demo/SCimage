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
