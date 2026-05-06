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
